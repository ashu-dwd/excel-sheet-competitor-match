const express = require("express");
const { getJobStatus } = require("../services/jobStatusService");

const router = express.Router();

router.get("/:jobId/:type", async (req, res) => {
  const { jobId, type } = req.params;
  const job = await getJobStatus(jobId);

  if (!job || job.status !== "completed") {
    return res.status(404).json({ error: "Job not found or not completed." });
  }

  let filePath;
  let contentType;

  if (type === "excel" && job.excelPath) {
    filePath = job.excelPath;
    contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else if (type === "success" && job.successLog) {
    filePath = job.successLog;
    contentType = "text/plain";
  } else if (type === "error" && job.errorLog) {
    filePath = job.errorLog;
    contentType = "text/plain";
  } else {
    return res
      .status(400)
      .json({ error: "Invalid download type or file not available." });
  }

  res.download(filePath, (err) => {
    if (err) {
      console.error(
        `Error downloading file for job ${jobId}, type ${type}:`,
        err
      );
      res.status(500).json({ error: "Error downloading file." });
    }
  });
});

module.exports = router;
