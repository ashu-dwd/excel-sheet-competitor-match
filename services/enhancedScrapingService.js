const axios = require("axios");
const cheerio = require("cheerio");

// Enhanced scraping with better category extraction
class EnhancedScrapingService {
  constructor() {
    this.axiosConfig = {
      timeout: 10000, // 10s instead of 30s
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US,en;q=0.5",
      },
      maxRedirects: 5,
    };
  }

  async scrapeCategories(url, urlHash) {
    if (!url.includes("http")) {
      url = `http://${url}`;
    }

    try {
      console.log(`Enhanced scraping: ${url}`);
      const { data } = await axios.get(url, this.axiosConfig);
      const $ = cheerio.load(data);

      const categories = new Set();

      // Primary: Extract from structured data (JSON-LD)
      const structuredCategories = this.extractFromStructuredData($);
      structuredCategories.forEach((cat) => categories.add(cat));

      // Secondary: Extract from navigation and breadcrumbs
      const navCategories = this.extractFromNavigation($);
      navCategories.forEach((cat) => categories.add(cat));

      // Tertiary: Extract from product listings
      const productCategories = this.extractFromProducts($);
      productCategories.forEach((cat) => categories.add(cat));

      // Quaternary: Fallback to general links
      const linkCategories = this.extractFromLinks($);
      linkCategories.forEach((cat) => categories.add(cat));

      // Filter and clean categories
      return this.filterCategories(Array.from(categories));
    } catch (error) {
      console.error(`Enhanced scraping error for ${url}:`, error.message);
      return [];
    }
  }

  extractFromStructuredData($) {
    const categories = new Set();

    // JSON-LD structured data
    $('script[type="application/ld+json"]').each((i, elem) => {
      try {
        const jsonData = JSON.parse($(elem).html());

        if (Array.isArray(jsonData)) {
          jsonData.forEach((item) =>
            this.processStructuredDataItem(item, categories)
          );
        } else {
          this.processStructuredDataItem(jsonData, categories);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });

    return Array.from(categories);
  }

  processStructuredDataItem(data, categories) {
    const relevantTypes = [
      "Product",
      "ProductGroup",
      "Collection",
      "WebPage",
      "Breadcrumb",
    ];

    if (data["@type"] && relevantTypes.includes(data["@type"])) {
      // Product category
      if (data.category) {
        categories.add(this.cleanCategoryName(data.category));
      } else if (data.genre) {
        categories.add(this.cleanCategoryName(data.genre));
      }

      // Breadcrumb navigation
      if (data.breadcrumb && Array.isArray(data.breadcrumb.itemListElement)) {
        data.breadcrumb.itemListElement.forEach((item) => {
          if (item.item && item.item.name) {
            categories.add(this.cleanCategoryName(item.item.name));
          }
        });
      }
    }
  }

  extractFromNavigation($) {
    const categories = new Set();

    // Main navigation menus
    $('nav, [role="navigation"], .nav, .navigation, .menu')
      .find("a")
      .each((i, elem) => {
        const text = $(elem).text().trim().toLowerCase();
        const href = $(elem).attr("href") || "";

        // Skip non-category links
        if (!this.isNavigationLink(href) || this.isExcludedLink(text)) {
          return;
        }

        categories.add(this.cleanCategoryName(text));
      });

    // Breadcrumb navigation
    $('.breadcrumb, .breadcrumbs, [class*="breadcrumb"]')
      .find("a, span")
      .each((i, elem) => {
        const text = $(elem).text().trim().toLowerCase();
        if (text && text.length >= 3 && text.length <= 30) {
          categories.add(this.cleanCategoryName(text));
        }
      });

    return Array.from(categories);
  }

  extractFromProducts($) {
    const categories = new Set();

    // Product category filters/facets
    $('[class*="filter"], [class*="facet"], [class*="category"]')
      .find("a, label")
      .each((i, elem) => {
        const text = $(elem).text().trim().toLowerCase();
        if (text && text.length >= 3 && text.length <= 25) {
          categories.add(this.cleanCategoryName(text));
        }
      });

    // E-commerce specific patterns
    $(".product-category, .category-link, [data-category]").each((i, elem) => {
      const text =
        $(elem).text().trim().toLowerCase() ||
        $(elem).attr("data-category") ||
        $(elem).attr("title");
      if (text && text.length >= 3) {
        categories.add(this.cleanCategoryName(text));
      }
    });

    return Array.from(categories);
  }

  extractFromLinks($) {
    const categories = new Set();

    // Traditional link extraction with better filtering
    $("a[href]").each((i, elem) => {
      const $el = $(elem);
      const text = $el.text().trim().toLowerCase();
      const href = $el.attr("href");

      if (this.shouldExtractFromLink(text, href)) {
        categories.add(this.cleanCategoryName(text));
      }
    });

    return Array.from(categories);
  }

  // Helper methods
  isNavigationLink(href) {
    return (
      !href.includes("#") &&
      !href.includes("javascript:") &&
      !href.startsWith("mailto:") &&
      !href.startsWith("tel:")
    );
  }

  isExcludedLink(text) {
    const excludePatterns =
      /home|about|contact|privacy|terms|shipping|login|signup|search|cart|wishlist/gi;
    return excludePatterns.test(text) || text.length < 3 || text.length > 50;
  }

  shouldExtractFromLink(text, href) {
    if (!text || !href) return false;

    // Must have proper text and not be excluded
    if (this.isExcludedLink(text)) return false;

    // Check for category-related URL patterns
    const categoryUrls =
      /\/category|\/collection|\/shop|\/products|\/store|\/dept/gi;
    const hasCategoryUrl = categoryUrls.test(href);

    // Check for keywords in URL
    const urlKeywords =
      /electronics|clothing|fashion|books|grocery|beauty|home|garden|auto|moto|sport/gi;
    const hasUrlKeywords = urlKeywords.test(href);

    return hasCategoryUrl || hasUrlKeywords || text.length >= 3;
  }

  cleanCategoryName(name) {
    if (!name) return "";
    return name
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ") // Replace special chars with space
      .replace(/\s+/g, " ") // Multiple spaces to single
      .trim();
  }

  filterCategories(categories) {
    const minLength = 3;
    const maxLength = 30;

    return categories
      .filter(
        (cat) =>
          cat &&
          cat.length >= minLength &&
          cat.length <= maxLength &&
          !/^\d+$/.test(cat) && // Not just numbers
          !/^[^a-zA-Z]*$/.test(cat) // Not just symbols
      )
      .slice(0, 20); // Limit to top 20 categories
  }

  async scrapeMultiple(urls) {
    const results = {};
    const promises = urls.map(async (url) => {
      const categories = await this.scrapeCategories(url);
      results[url] = categories;
    });

    await Promise.allSettled(promises);
    return results;
  }
}

module.exports = new EnhancedScrapingService();
