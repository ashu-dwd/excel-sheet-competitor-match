const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ProcessedResult = sequelize.define(
  "ProcessedResult",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    job_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
      references: {
        model: "Jobs",
        key: "id",
      },
    },
    row_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    client_site: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    competitor_site: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("PASS", "FAIL", "MARGINAL", "SKIPPED"),
      allowNull: false,
      defaultValue: "FAIL",
    },
    confidence: {
      type: DataTypes.DECIMAL(3, 2), // 0.00 to 1.00
      defaultValue: 0.0,
      allowNull: false,
      validate: {
        min: 0,
        max: 1,
      },
    },
    similarity_score: {
      type: DataTypes.DECIMAL(3, 2), // Legacy field for backward compatibility
      defaultValue: 0.0,
    },
    matched_categories_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    total_common_categories: {
      type: DataTypes.TEXT, // JSON array of matched categories
      allowNull: true,
    },
    client_categories: {
      type: DataTypes.TEXT, // JSON array
      allowNull: true,
    },
    competitor_categories: {
      type: DataTypes.TEXT, // JSON array
      allowNull: true,
    },
    matching_details: {
      type: DataTypes.TEXT, // JSON object with detailed matching info
      allowNull: true,
    },
    processing_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true, // Milliseconds taken to process this row
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
  },
  {
    indexes: [
      {
        fields: ["job_id"],
      },
      {
        fields: ["job_id", "row_index"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["confidence"],
      },
      {
        fields: ["client_site"],
      },
      {
        fields: ["competitor_site"],
      },
    ],
    timestamps: true,
  }
);

// Instance methods
ProcessedResult.prototype.getMatchedCategories = function () {
  try {
    return this.total_common_categories
      ? JSON.parse(this.total_common_categories)
      : [];
  } catch (error) {
    console.error("Error parsing matched categories:", error);
    return [];
  }
};

ProcessedResult.prototype.getClientCategories = function () {
  try {
    return this.client_categories ? JSON.parse(this.client_categories) : [];
  } catch (error) {
    console.error("Error parsing client categories:", error);
    return [];
  }
};

ProcessedResult.prototype.getCompetitorCategories = function () {
  try {
    return this.competitor_categories
      ? JSON.parse(this.competitor_categories)
      : [];
  } catch (error) {
    console.error("Error parsing competitor categories:", error);
    return [];
  }
};

ProcessedResult.prototype.getMatchingDetails = function () {
  try {
    return this.matching_details ? JSON.parse(this.matching_details) : {};
  } catch (error) {
    console.error("Error parsing matching details:", error);
    return {};
  }
};

ProcessedResult.prototype.setCategories = function (
  clientCats,
  competitorCats,
  matchedCats
) {
  this.client_categories = JSON.stringify(clientCats || []);
  this.competitor_categories = JSON.stringify(competitorCats || []);
  this.total_common_categories = JSON.stringify(matchedCats || []);
  this.matched_categories_count = (matchedCats || []).length;
};

ProcessedResult.prototype.setMatchingDetails = function (details) {
  this.matching_details = JSON.stringify(details || {});
};

ProcessedResult.prototype.updateStatus = function (status, confidence, reason) {
  this.status = status;
  this.confidence = Math.max(0, Math.min(1, confidence || 0));
  this.similarity_score = this.confidence;

  if (reason) {
    const details = this.getMatchingDetails();
    details.reason = reason;
    this.setMatchingDetails(details);
  }
};

// Static methods
ProcessedResult.getResultsForJob = async (jobId) => {
  return await ProcessedResult.findAll({
    where: { job_id: jobId },
    order: [["row_index", "ASC"]],
    attributes: [
      "row_index",
      "client_site",
      "competitor_site",
      "status",
      "confidence",
      "matched_categories_count",
      "created_at",
    ],
  });
};

ProcessedResult.getStatsForJob = async (jobId) => {
  const results = await ProcessedResult.findAll({
    where: { job_id: jobId },
    attributes: ["status", "confidence"],
  });

  const stats = {
    total: results.length,
    passed: 0,
    failed: 0,
    marginal: 0,
    skipped: 0,
    averageConfidence: 0,
    highConfidenceMatches: 0,
  };

  let totalConfidence = 0;
  results.forEach((result) => {
    switch (result.status) {
      case "PASS":
        stats.passed++;
        break;
      case "FAIL":
        stats.failed++;
        break;
      case "MARGINAL":
        stats.marginal++;
        break;
      case "SKIPPED":
        stats.skipped++;
        break;
    }

    totalConfidence += parseFloat(result.confidence || 0);
    if (parseFloat(result.confidence || 0) >= 0.8) {
      stats.highConfidenceMatches++;
    }
  });

  stats.averageConfidence = stats.total > 0 ? totalConfidence / stats.total : 0;

  return stats;
};

ProcessedResult.cleanupOldResults = async (daysOld = 30) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const deletedCount = await ProcessedResult.destroy({
    where: {
      created_at: {
        [require("sequelize").Op.lt]: cutoffDate,
      },
    },
  });

  console.log(
    `Cleaned up ${deletedCount} processed results older than ${daysOld} days`
  );
  return deletedCount;
};

module.exports = ProcessedResult;
