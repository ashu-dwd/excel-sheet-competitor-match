const Redis = require("ioredis");

const redisConnection = new Redis({ maxRetriesPerRequest: null });
const redisClient = new Redis();

module.exports = { redisConnection, redisClient };
