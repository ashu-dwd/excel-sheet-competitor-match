const natural = require("natural");
const { toBeRemovedCategories } = require("../constants/categories");

// Enhanced category matching with multiple similarity algorithms
class EnhancedCategoryMatcher {
  constructor() {
    // Fuse.js configuration with stricter matching
    this.fuseOptions = {
      includeScore: true,
      threshold: 0.6, // Stricter threshold (was 0.8)
      minMatchCharLength: 4,
      keys: ["name"],
    };

    // Tokenizer for advanced text processing
    this.tokenizer = new natural.WordTokenizer();
  }

  // Primary matching algorithm - combines multiple similarity metrics
  findCommonCategories(websiteCategories, competitorCategories) {
    if (!websiteCategories?.length || !competitorCategories?.length) {
      return [];
    }

    // Clean and filter categories first
    const cleanWebsiteCats = this.prepareCategories(websiteCategories);
    const cleanCompetitorCats = this.prepareCategories(competitorCategories);

    if (!cleanWebsiteCats.length || !cleanCompetitorCats.length) {
      return [];
    }

    let allMatches = [];
    const fuse = new Fuse(
      cleanCompetitorCats.map((cat) => ({ name: cat })),
      this.fuseOptions
    );

    // Multi-metric matching for each website category
    for (const websiteCat of cleanWebsiteCats) {
      const matches = this.findMatches(websiteCat, cleanCompetitorCats, fuse);
      allMatches = allMatches.concat(matches);
    }

    // Remove duplicates and filter
    const uniqueMatches = this.deduplicateMatches(allMatches);

    // Calculate overall confidence
    return uniqueMatches
      .map((match) => ({
        ...match,
        confidence: this.calculateConfidence(match),
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }

  findMatches(websiteCat, competitorCats, fuse) {
    const matches = [];

    // 1. Fuse.js fuzzy matching
    const fuseResults = fuse.search(websiteCat);
    if (
      fuseResults.length > 0 &&
      fuseResults[0].score <= this.fuseOptions.threshold
    ) {
      matches.push({
        websiteCategory: websiteCat,
        matchedCompetitorCategory: fuseResults[0].item.name,
        similarityScore: 1 - fuseResults[0].score, // Convert Fuse score to similarity (0-1)
        method: "fuse",
      });
    }

    // 2. Levenshtein distance for close matches
    for (const compCat of competitorCats) {
      const levDistance = natural.LevenshteinDistance(websiteCat, compCat);
      const maxLen = Math.max(websiteCat.length, compCat.length);
      const levSimilarity = 1 - levDistance / maxLen;

      if (levSimilarity >= 0.8 && levDistance <= 3) {
        // Very similar with few edits
        matches.push({
          websiteCategory: websiteCat,
          matchedCompetitorCategory: compCat,
          similarityScore: levSimilarity,
          method: "levenshtein",
        });
      }
    }

    // 3. Cosine similarity on tokenized keywords
    for (const compCat of competitorCats) {
      const cosineSim = this.cosineSimilarity(websiteCat, compCat);
      if (cosineSim >= 0.7) {
        matches.push({
          websiteCategory: websiteCat,
          matchedCompetitorCategory: compCat,
          similarityScore: cosineSim,
          method: "cosine",
        });
      }
    }

    return matches;
  }

  cosineSimilarity(text1, text2) {
    const tokens1 = this.tokenizer.tokenize(text1) || [];
    const tokens2 = this.tokenizer.tokenize(text2) || [];

    if (!tokens1.length || !tokens2.length) return 0;

    // Create word frequency maps
    const freq1 = tokens1.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {});

    const freq2 = tokens2.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1;
      return acc;
    }, {});

    // Calculate dot product and magnitudes
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    const allWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);

    for (const word of allWords) {
      const val1 = freq1[word] || 0;
      const val2 = freq2[word] || 0;
      dotProduct += val1 * val2;
      mag1 += val1 * val1;
      mag2 += val2 * val2;
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) return 0;

    return dotProduct / (mag1 * mag2);
  }

  prepareCategories(categories) {
    return categories
      .filter((cat) => cat && typeof cat === "string" && cat.trim().length >= 3)
      .map((cat) => this.cleanCategoryName(cat))
      .filter((cat) => cat.length >= 3 && cat.length <= 50)
      .filter((cat) => !toBeRemovedCategories.includes(cat));
  }

  cleanCategoryName(name) {
    if (!name) return "";
    return name
      .replace(/[^\w\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  deduplicateMatches(matches) {
    const seen = new Set();
    return matches.filter((match) => {
      const key = `${match.websiteCategory}-${match.matchedCompetitorCategory}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  calculateConfidence(match) {
    const baseScore = match.similarityScore;

    // Boost for better matching methods
    const methodMultiplier = {
      cosine: 1.2, // Best for semantic similarity
      levenshtein: 1.1, // Good for close matches
      fuse: 1.0, // Standard fuzzy matching
    };

    // Boost for category weightings (can be expanded)
    const categoryWeighting = this.getCategoryWeight(match.websiteCategory);

    return Math.min(
      baseScore * (methodMultiplier[match.method] || 1.0) * categoryWeighting,
      1.0
    );
  }

  getCategoryWeight(category) {
    // Weight certain categories higher (e-commerce specific)
    const highWeightCategories = [
      "electronics",
      "clothing",
      "fashion",
      "books",
      "beauty",
      "home",
      "garden",
      "sports",
      "automotive",
      "toys",
    ];

    if (highWeightCategories.some((hw) => category.includes(hw))) {
      return 1.2; // 20% boost
    }

    return 1.0; // Standard weight
  }

  // Decision logic for Pass/Fail based on matches
  determineSimilarityStatus(matches, options = {}) {
    const {
      minMatches = 3,
      minConfidence = 0.6,
      minAverageSimilarity = 0.5,
    } = options;

    if (!matches?.length) {
      return {
        status: "FAIL",
        confidence: 0,
        reason: "No category matches found",
      };
    }

    // Filter high-confidence matches
    const highConfidenceMatches = matches.filter(
      (m) => m.confidence >= minConfidence
    );

    if (highConfidenceMatches.length < minMatches) {
      return {
        status: "FAIL",
        confidence: Math.max(...matches.map((m) => m.confidence)),
        reason: `Insufficient matches: ${highConfidenceMatches.length}/${minMatches} required`,
      };
    }

    // Calculate average confidence
    const avgConfidence =
      matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length;

    if (avgConfidence >= minAverageSimilarity) {
      return {
        status: "PASS",
        confidence: avgConfidence,
        reason: `${matches.length} category matches with ${Math.round(
          avgConfidence * 100
        )}% confidence`,
      };
    }

    return {
      status: "MARGINAL",
      confidence: avgConfidence,
      reason: `Average similarity below threshold: ${Math.round(
        avgConfidence * 100
      )}%`,
    };
  }

  // Backward compatibility
  findCommonCategoriesWithFuse(websiteCategories, competitorCategories) {
    return this.findCommonCategories(websiteCategories, competitorCategories);
  }

  filterRemovedCategories(commonCategoriesDetails) {
    return commonCategoriesDetails.filter(
      (cat) => !toBeRemovedCategories.includes(cat.websiteCategory)
    );
  }
}

module.exports = new EnhancedCategoryMatcher();
