const { Worker } = require("bullmq");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const { redisConnection } = require("../config/redis");
const { setJobStatus } = require("../services/jobStatusService");
const { scrapeCategories } = require("../services/scrapingService");
const {
  findCommonCategoriesWithFuse,
  filterRemovedCategories,
} = require("../utils/categoryMatcher");
const { sendProcessingCompleteEmail } = require("../services/emailService");
const { cleanupFile } = require("../services/fileService");

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

  for (const row of data) {
    console.log(row);
    const { client_site, competitors_site } = row;
    let status = "FAIL";
    let websiteCategories = [];
    let competitorCategories = [];
    let commonCategoriesDetails = [];
    let similarityScore = 0;

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
      results.push({
        ...row,
        status: "SKIPPED",
      });
      continue;
    }

    try {
      websiteCategories = await scrapeCategories(client_site);
      competitorCategories = await scrapeCategories(competitors_site);

      // Use Fuse.js for fuzzy matching
      commonCategoriesDetails = findCommonCategoriesWithFuse(
        websiteCategories,
        competitorCategories
      );

      // Remove unwanted categories
      commonCategoriesDetails = filterRemovedCategories(
        commonCategoriesDetails
      );

      if (commonCategoriesDetails.length > 0) {
        status = "PASS";
        // Calculate average similarity score
        similarityScore =
          commonCategoriesDetails.reduce(
            (sum, cat) => sum + (1 - cat.similarityScore),
            0
          ) / commonCategoriesDetails.length;
      }

      successLogStream.write(
        `Job ${jobId} - Row processed: Client: ${client_site}, Competitor: ${competitors_site}, Status: ${status}, Common Categories: ${commonCategoriesDetails.length}\n`
      );
    } catch (error) {
      errorLogStream.write(
        `Job ${jobId} - Error processing row: Client: ${client_site}, Competitor: ${competitors_site}, Error: ${error.message}\n`
      );
    }

    results.push({
      ...row,
      status,
    });
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
