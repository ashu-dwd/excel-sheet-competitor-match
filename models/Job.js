const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Job = sequelize.define(
  "Job",
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "processing", "completed", "failed"),
      defaultValue: "pending",
      allowNull: false,
    },
    progress: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      validate: {
        min: 0,
        max: 100,
      },
    },
    file_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    result_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    user_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },
    total_rows: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    processed_rows: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    download_links: {
      type: DataTypes.TEXT, // JSON string
      allowNull: true,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    indexes: [
      {
        fields: ["status"],
      },
      {
        fields: ["created_at"],
      },
      {
        fields: ["user_email"],
      },
      {
        fields: ["started_at", "status"],
      },
    ],
  }
);

module.exports = Job;
