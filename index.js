require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

// Import routes
const uploadRoutes = require("./routes/upload");
const statusRoutes = require("./routes/status");
const downloadRoutes = require("./routes/download");

// Import services
const { ensureDir } = require("./services/fileService");

// Import worker (starts the processing)
require("./queues/worker");

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories exist
ensureDir("uploads");
ensureDir("results");
ensureDir("logs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/upload", uploadRoutes);
app.use("/status", statusRoutes);
app.use("/download", downloadRoutes);

app.get("/api", (req, res) => {
  res.send("Excel Processing API is running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
