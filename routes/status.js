const express = require("express");
const { getJobStatus } = require("../services/jobStatusService");

const router = express.Router();

router.get("/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const status = await getJobStatus(jobId);

  if (!status) {
    return res.status(404).json({ error: "Job not found." });
  }

  res.json(status);
});

module.exports = router;
