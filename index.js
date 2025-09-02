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

// Import database configuration
const { testConnection, initializeDatabase } = require("./config/database");

const app = express();
const PORT = process.env.PORT || 8080; // Changed to 8080 to match docker-compose

// Enhanced startup with database initialization
async function startServer() {
  try {
    console.log("Initializing application...");

    // Ensure directories exist first
    ensureDir("uploads");
    ensureDir("results");
    ensureDir("logs");

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.warn("Database connection failed. Some features may not work.");
    } else {
      console.log("Database connection established successfully.");
    }

    // Initialize database schema
    const dbInitialized = await initializeDatabase();
    if (dbInitialized) {
      console.log("Database schema initialized.");
    } else {
      console.warn("Database schema initialization failed or incomplete.");
    }

    // Import and start worker (starts the processing after DB is ready)
    require("./queues/worker");
    console.log("Worker initialized.");

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

    app.get("/api/health", (req, res) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(
        `🚀 Health check available at: http://localhost:${PORT}/api/health`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit the process, just log the error
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Start the server
startServer();
