const { Queue } = require("bullmq");
const { redisConnection } = require("../config/redis");

// BullMQ Queue
const jobQueue = new Queue("excelProcessingQueue", {
  connection: redisConnection,
});

module.exports = jobQueue;
