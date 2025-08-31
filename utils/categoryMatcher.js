const Fuse = require("fuse.js");
const { toBeRemovedCategories } = require("../constants/categories");

// Configure Fuse.js for category matching
const fuseOptions = {
  includeScore: true,
  threshold: 0.8, // Adjust threshold for matching sensitivity (0 = exact, 1 = loose)
  minMatchCharLength: 4, // Minimum character length for matches
  keys: ["name"], // We'll use this to match category names
};

// Function to find common categories using Fuse.js fuzzy matching
function findCommonCategoriesWithFuse(websiteCategories, competitorCategories) {
  if (websiteCategories.length === 0 || competitorCategories.length === 0) {
    return [];
  }

  // Create Fuse instance with competitor categories as the search list
  const fuse = new Fuse(
    competitorCategories.map((cat) => ({ name: cat })),
    fuseOptions
  );

  const commonCategories = [];

  // Check each website category against competitor categories
  for (const websiteCat of websiteCategories) {
    const results = fuse.search(websiteCat);

    // If we have a good match (score <= threshold), consider it a common category
    if (results.length > 0 && results[0].score <= fuseOptions.threshold) {
      commonCategories.push({
        websiteCategory: websiteCat,
        matchedCompetitorCategory: results[0].item.name,
        similarityScore: results[0].score,
      });
    }
  }

  return commonCategories;
}

function filterRemovedCategories(commonCategoriesDetails) {
  return commonCategoriesDetails.filter(
    (cat) => !toBeRemovedCategories.includes(cat.websiteCategory)
  );
}

module.exports = { findCommonCategoriesWithFuse, filterRemovedCategories };
