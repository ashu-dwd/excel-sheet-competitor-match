const { Worker } = require("bullmq");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const { redisConnection } = require("../config/redis");
const { setJobStatus } = require("../services/jobStatusService");
const enhancedScraping = require("../services/enhancedScrapingService");
const categoryMatcher = require("../utils/categoryMatcher");
const { sendProcessingCompleteEmail } = require("../services/emailService");
const { cleanupFile } = require("../services/fileService");

// Batch size for concurrent processing
const BATCH_SIZE = 5;

const processExcelJob = async (job) => {
  const { jobId, filePath, userEmail } = job.data;
  await setJobStatus(jobId, "processing");

  let workbook;
  try {
    workbook = XLSX.readFile(filePath);
  } catch (error) {
    console.error(`Error reading Excel file for job ${jobId}:`, error);
    await setJobStatus(jobId, "failed", { error: error.message });
    cleanupFile(filePath);
    return;
  }

  const sheetName = workbook.SheetNames[0]; // Assuming first sheet
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  const results = [];
  const successLogPath = path.join("logs", `${jobId}_success.log`);
  const errorLogPath = path.join("logs", `${jobId}_error.log`);

  const successLogStream = fs.createWriteStream(successLogPath, { flags: "a" });
  const errorLogStream = fs.createWriteStream(errorLogPath, { flags: "a" });

  // Process in batches for better performance
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
        data.length / BATCH_SIZE
      )}`
    );

    const batchResults = await processBatch(
      batch,
      jobId,
      successLogStream,
      errorLogStream
    );
    results.push(...batchResults);
  }

  const newWorkbook = XLSX.utils.book_new();
  const newSheet = XLSX.utils.json_to_sheet(results);
  XLSX.utils.book_append_sheet(newWorkbook, newSheet, "Processed Results");
  const outputFilePath = path.join("results", `${jobId}_processed.xlsx`);
  XLSX.writeFile(newWorkbook, outputFilePath);

  successLogStream.end();
  errorLogStream.end();

  // Generate download links
  const baseUrl = process.env.BASE_URL || "http://localhost:8080";
  const downloadLinks = {
    excel: `${baseUrl}/download/${jobId}/excel`,
    success: `${baseUrl}/download/${jobId}/success`,
    error: `${baseUrl}/download/${jobId}/error`,
  };

  await setJobStatus(jobId, "completed", {
    excelPath: outputFilePath,
    successLog: successLogPath,
    errorLog: errorLogPath,
    downloadLinks,
  });

  // Send email notification if user email provided
  if (userEmail) {
    try {
      await sendProcessingCompleteEmail(userEmail, jobId, downloadLinks);
    } catch (emailError) {
      console.error(`Failed to send email for job ${jobId}:`, emailError);
      // Don't fail the job just because email failed
    }
  }

  cleanupFile(filePath); // Clean up uploaded file
};

// Enhanced batch processing with concurrent scraping
const processBatch = async (batch, jobId, successLogStream, errorLogStream) => {
  const batchResults = [];
  const scrapePromises = [];

  // Collect all URLs to scrape concurrently
  const allUrls = new Set();
  batch.forEach((row) => {
    if (row.client_site && row.client_site.trim()) {
      allUrls.add(row.client_site.trim());
    }
    if (row.competitors_site && row.competitors_site.trim()) {
      allUrls.add(row.competitors_site.trim());
    }
  });

  console.log(`Scraping ${allUrls.size} unique URLs concurrently...`);

  // First, scrape all unique URLs concurrently (with rate limiting through Promise.race)
  let scrapeResults = {};
  const urlArray = Array.from(allUrls);

  for (let i = 0; i < urlArray.length; i += 5) {
    // Process in chunks of 5
    const chunk = urlArray.slice(i, i + 5);
    const chunkPromises = chunk.map((url) =>
      enhancedScraping.scrapeCategories(url)
    );

    const chunkResults = await Promise.allSettled(chunkPromises);

    chunk.forEach((url, index) => {
      if (chunkResults[index].status === "fulfilled") {
        scrapeResults[url] = chunkResults[index].value;
      } else {
        console.error(
          `Failed to scrape ${url}:`,
          chunkResults[index].reason.message
        );
        scrapeResults[url] = []; // Empty array on failure
      }
    });
  }

  // Now process each row using the scraped data
  for (const row of batch) {
    const { client_site, competitors_site } = row;
    let status = "FAIL";
    let similarityScore = 0;
    let confidence = 0;
    let matchingDetails = {};

    if (!client_site || !competitors_site) {
      console.warn(
        `Job ${jobId} - Skipping row due to missing client_site or competitors_site: ${JSON.stringify(
          row
        )}`
      );
      errorLogStream.write(
        `Job ${jobId} - Skipping row due to missing client_site or competitors_site: ${JSON.stringify(
          row
        )}\n`
      );
      batchResults.push({
        ...row,
        status: "SKIPPED",
      });
      continue;
    }

    try {
      const websiteCategories = scrapeResults[client_site.trim()] || [];
      const competitorCategories = scrapeResults[competitors_site.trim()] || [];

      console.log(
        `Categories found: ${websiteCategories.length} (${client_site}) vs ${competitorCategories.length} (${competitors_site})`
      );

      // Use enhanced category matching
      const commonCategoriesDetails = categoryMatcher.findCommonCategories(
        websiteCategories,
        competitorCategories
      );

      // Determine similarity status with enhanced logic
      const similarityResult = categoryMatcher.determineSimilarityStatus(
        commonCategoriesDetails,
        {
          minMatches: 3,
          minConfidence: 0.6,
          minAverageSimilarity: 0.55,
        }
      );

      status = similarityResult.status;
      confidence = similarityResult.confidence;
      similarityScore = confidence; // For backward compatibility

      matchingDetails = {
        totalMatches: commonCategoriesDetails.length,
        highConfidenceMatches: commonCategoriesDetails.filter(
          (m) => m.confidence >= 0.6
        ).length,
        averageConfidence: Math.round(confidence * 100) + "%",
        reason: similarityResult.reason,
      };

      successLogStream.write(
        `Job ${jobId} - Row processed: Client: ${client_site}, Competitor: ${competitors_site}, Status: ${status}, Confidence: ${(
          confidence * 100
        ).toFixed(1)}%, Matches: ${commonCategoriesDetails.length}\n`
      );
    } catch (error) {
      console.error(`Error processing row:`, error.message);
      errorLogStream.write(
        `Job ${jobId} - Error processing row: Client: ${client_site}, Competitor: ${competitors_site}, Error: ${error.message}\n`
      );
    }

    batchResults.push({
      ...row,
      status,
      similarity_score: similarityScore,
      confidence: confidence,
      matching_details: JSON.stringify(matchingDetails),
    });
  }

  return batchResults;
};

const worker = new Worker("excelProcessingQueue", processExcelJob, {
  connection: redisConnection,
  concurrency: 10,
});

worker.on("failed", async (job, err) => {
  console.error(`Job ${job.data.jobId} failed:`, err);
  await setJobStatus(job.data.jobId, "failed", { error: err.message });

  // Clean up file if job fails
  if (job.data.filePath) {
    cleanupFile(job.data.filePath);
  }
});

module.exports = worker;
