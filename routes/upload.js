const express = require("express");
const upload = require("../config/multer");
const { v4: uuidv4 } = require("uuid");
const jobQueue = require("../queues/excelProcessingQueue");
const { setJobStatus } = require("../services/jobStatusService");

const router = express.Router();

router.post("/", upload.single("excelFile"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const jobId = uuidv4();
  const filePath = req.file.path;
  const userEmail = req.body.email; // Get email from request body

  await setJobStatus(jobId, "pending");

  try {
    await jobQueue.add("processExcel", { jobId, filePath, userEmail });
    res.json({
      jobId,
      status: "pending",
      message: userEmail
        ? "You will receive an email when processing is complete."
        : "Processing started.",
    });
  } catch (error) {
    console.error(`Error adding job ${jobId} to queue:`, error);
    await setJobStatus(jobId, "failed", { error: error.message });
    res.status(500).json({ error: "Failed to add job to queue." });
  }
});

module.exports = router;
