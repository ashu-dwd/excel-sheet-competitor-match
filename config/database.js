const { Sequelize } = require("sequelize");
require("dotenv").config();

// Database configuration
const sequelize = new Sequelize(
  process.env.DB_NAME || "excel_match",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "",
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: process.env.NODE_ENV === "production" ? false : console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
      paranoid: false, // No soft deletes for now
    },
  }
);

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connection has been established successfully.");
    return true;
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    return false;
  }
};

// Initialize database schema
const initializeDatabase = async () => {
  try {
    // Import models
    const Job = require("../models/Job");
    const ScrapedData = require("../models/ScrapedData");
    const ProcessedResult = require("../models/ProcessedResult");

    // Define associations
    Job.hasMany(ProcessedResult, { foreignKey: "job_id", onDelete: "CASCADE" });
    ProcessedResult.belongsTo(Job, { foreignKey: "job_id" });

    // Sync database (create tables if not exists)
    await sequelize.sync({ alter: true });
    console.log("Database schema synchronized successfully.");
    return true;
  } catch (error) {
    console.error("Failed to initialize database:", error);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection,
  initializeDatabase,
};
