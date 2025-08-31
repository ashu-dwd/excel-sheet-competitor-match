const fs = require("fs");
const path = require("path");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Initialize directories
ensureDir("uploads");
ensureDir("results");
ensureDir("logs");

const cleanupFile = (filePath) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

module.exports = { ensureDir, cleanupFile };
