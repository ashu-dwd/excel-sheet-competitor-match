const { redisClient } = require("../config/redis");

async function setJobStatus(jobId, status, details = {}) {
  await redisClient.set(`job:${jobId}`, JSON.stringify({ status, ...details }));
}

async function getJobStatus(jobId) {
  const jobData = await redisClient.get(`job:${jobId}`);
  return jobData ? JSON.parse(jobData) : null;
}

module.exports = { setJobStatus, getJobStatus };
