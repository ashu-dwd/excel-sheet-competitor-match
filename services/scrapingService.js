const axios = require("axios");
const cheerio = require("cheerio");

function cleanHtmlContent(html) {
  const $ = cheerio.load(html);

  // Remove all attributes from all elements
  $("*").each(function () {
    const attributes = $(this).get(0).attribs;
    for (const attr in attributes) {
      $(this).removeAttr(attr);
    }
  });

  // Remove script and style tags
  $("script, style, noscript").remove();

  // Get clean text content
  return $.text().replace(/\s+/g, " ").trim();
}

async function scrapeCategories(url) {
  if (!url.includes("http")) {
    url = `http://${url}`;
  }
  console.log(`Scraping categories from: ${url}`);
  try {
    const { data } = await axios.get(url, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    // Clean HTML by removing attributes and extracting clean text
    const cleanContent = cleanHtmlContent(data);
    const $ = cheerio.load(data);
    const categories = new Set();

    // Extract categories from various HTML elements with attribute removal
    $("a").each((i, el) => {
      const $el = $(el);
      // Remove attributes for cleaner text extraction
      $el.removeAttr("href");
      $el.removeAttr("class");
      $el.removeAttr("id");
      const text = $el.text().trim().toLowerCase();
      if (text && text.length > 2 && text.length < 50) {
        categories.add(text);
      }
    });

    $('meta[property="product:category"], meta[name="category"]').each(
      (i, el) => {
        const content = $(el).attr("content");
        if (content) {
          categories.add(content.trim().toLowerCase());
        }
      }
    );

    // Also extract from common class names (after cleaning)
    $('[class*="category"], [class*="cat"], [class*="tag"]').each((i, el) => {
      const $el = $(el);
      $el.removeAttr("class");
      const text = $el.text().trim().toLowerCase();
      if (text && text.length > 2) {
        categories.add(text);
      }
    });

    // Add some keywords from the clean content
    const contentWords = cleanContent.toLowerCase().split(/\s+/);
    const categoryKeywords = [
      "category",
      "categories",
      "shop",
      "products",
      "collection",
      "department",
    ];

    categoryKeywords.forEach((keyword) => {
      const index = contentWords.indexOf(keyword);
      if (index !== -1 && index < contentWords.length - 1) {
        // Add the word after the keyword as potential category
        const potentialCategory = contentWords[index + 1];
        if (potentialCategory.length > 2) {
          categories.add(potentialCategory);
        }
      }
    });

    return Array.from(categories).filter(
      (cat) => cat.length > 2 && cat.length < 50
    );
  } catch (error) {
    console.error(`Error scraping categories from ${url}:`, error.message);
    return []; // Return empty array instead of throwing to continue processing
  }
}

module.exports = { scrapeCategories, cleanHtmlContent };
