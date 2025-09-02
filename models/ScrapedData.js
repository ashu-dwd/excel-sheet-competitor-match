const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const crypto = require("crypto");

const ScrapedData = sequelize.define(
  "ScrapedData",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    url_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    url: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    categories: {
      type: DataTypes.TEXT, // JSON array of categories
      allowNull: false,
    },
    source: {
      type: DataTypes.ENUM(
        "structured-data",
        "navigation",
        "products",
        "links",
        "fallback"
      ),
      allowNull: false,
    },
    scraped_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    ttl: {
      type: DataTypes.INTEGER,
      defaultValue: 86400, // 24 hours in seconds
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_accessed: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    access_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    is_valid: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    indexes: [
      {
        unique: true,
        fields: ["url_hash"],
      },
      {
        fields: ["expires_at"],
      },
      {
        fields: ["scraped_at"],
      },
      {
        fields: ["last_accessed"],
        where: {
          last_accessed: {
            [require("sequelize").Op.ne]: null,
          },
        },
      },
    ],
    timestamps: true,
  }
);

// Static methods for cache management
ScrapedData.buildUrlHash = (url) => {
  return crypto
    .createHash("sha256")
    .update(url.trim().toLowerCase())
    .digest("hex");
};

ScrapedData.findByUrl = async (url) => {
  const urlHash = ScrapedData.buildUrlHash(url);
  const now = new Date();

  const record = await ScrapedData.findOne({
    where: {
      url_hash: urlHash,
      is_valid: true,
      expires_at: {
        [require("sequelize").Op.or]: [
          { [require("sequelize").Op.gt]: now },
          { [require("sequelize").Op.is]: null },
        ],
      },
    },
  });

  if (record) {
    // Update access tracking
    await record.update({
      last_accessed: now,
      access_count: record.access_count + 1,
    });
  }

  return record;
};

ScrapedData.cacheCategories = async (
  url,
  categories,
  source = "structured-data"
) => {
  const urlHash = ScrapedData.buildUrlHash(url);
  const now = new Date();
  const ttl = 86400; // 24 hours
  const expiresAt = new Date(now.getTime() + ttl * 1000);

  try {
    categories = Array.isArray(categories) ? categories : [];
    const categoriesJson = JSON.stringify(categories);

    const record = await ScrapedData.findByUrlHash(urlHash);

    if (record) {
      // Update existing record
      await record.update({
        categories: categoriesJson,
        scraped_at: now,
        expires_at: expiresAt,
        source: source,
      });

      return record;
    } else {
      // Create new record
      return await ScrapedData.create({
        url_hash: urlHash,
        url: url.trim(),
        categories: categoriesJson,
        source: source,
        scraped_at: now,
        expires_at: expiresAt,
        ttl: ttl,
      });
    }
  } catch (error) {
    console.error("Error caching categories:", error);
    return null;
  }
};

ScrapedData.findByUrlHash = (urlHash) => {
  return ScrapedData.findOne({ where: { url_hash: urlHash, is_valid: true } });
};

ScrapedData.cleanupExpired = async () => {
  const now = new Date();
  const deletedCount = await ScrapedData.destroy({
    where: {
      expires_at: {
        [require("sequelize").Op.lt]: now,
      },
    },
  });

  console.log(`Cleaned up ${deletedCount} expired cached entries`);
  return deletedCount;
};

ScrapedData.getCacheStats = async () => {
  const total = await ScrapedData.count();
  const expired = await ScrapedData.count({
    where: {
      expires_at: {
        [require("sequelize").Op.lt]: new Date(),
      },
    },
  });

  const valid = await ScrapedData.count({
    where: {
      is_valid: true,
      expires_at: {
        [require("sequelize").Op.or]: [
          { [require("sequelize").Op.gt]: new Date() },
          { [require("sequelize").Op.is]: null },
        ],
      },
    },
  });

  return {
    total,
    valid,
    expired,
    invalid: total - expired - valid,
  };
};

module.exports = ScrapedData;
