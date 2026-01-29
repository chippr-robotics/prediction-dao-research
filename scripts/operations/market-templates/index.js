/**
 * Market Templates Aggregator
 *
 * Exports all market templates and helper functions for the Garden of Eden
 * demonstration market creation system.
 */

// Import category templates
const sportsTemplates = require("./sports");
const politicsTemplates = require("./politics");
const financeTemplates = require("./finance");
const techTemplates = require("./tech");
const cryptoTemplates = require("./crypto");
const popCultureTemplates = require("./pop-culture");
const weatherTemplates = require("./weather");

// Import helpers
const helpers = require("./helpers");
const ipfs = require("./ipfs");

/**
 * Get all market templates combined
 * @returns {Array} All market templates from all categories
 */
function getAllTemplates() {
  return [
    ...sportsTemplates,
    ...politicsTemplates,
    ...financeTemplates,
    ...techTemplates,
    ...cryptoTemplates,
    ...popCultureTemplates,
    ...weatherTemplates,
  ];
}

/**
 * Get templates by category
 * @param {string} category - Category name
 * @returns {Array} Templates for the specified category
 */
function getTemplatesByCategory(category) {
  const categoryMap = {
    sports: sportsTemplates,
    politics: politicsTemplates,
    finance: financeTemplates,
    tech: techTemplates,
    crypto: cryptoTemplates,
    "pop-culture": popCultureTemplates,
    weather: weatherTemplates,
  };
  return categoryMap[category] || [];
}

/**
 * Get template statistics
 * @returns {Object} Statistics about templates
 */
function getTemplateStats() {
  const allTemplates = getAllTemplates();
  const byCategory = {};
  const byTiming = { fixed: 0, relative: 0, evergreen: 0 };

  for (const template of allTemplates) {
    // Count by category
    if (!byCategory[template.category]) {
      byCategory[template.category] = 0;
    }
    byCategory[template.category]++;

    // Count by timing type
    const timingType = template.timing?.type || "evergreen";
    byTiming[timingType]++;
  }

  return {
    total: allTemplates.length,
    byCategory,
    byTiming,
    categories: Object.keys(byCategory),
  };
}

/**
 * Filter templates by various criteria
 * @param {Object} options - Filter options
 * @returns {Array} Filtered templates
 */
function filterTemplates(options = {}) {
  let templates = getAllTemplates();

  // Filter by category
  if (options.category) {
    templates = templates.filter((t) => t.category === options.category);
  }

  // Filter by subcategory
  if (options.subcategory) {
    templates = templates.filter((t) => t.subcategory === options.subcategory);
  }

  // Filter by bet type
  if (options.betType !== undefined) {
    templates = templates.filter((t) => t.betType === options.betType);
  }

  // Filter by timing type
  if (options.timingType) {
    templates = templates.filter((t) => t.timing?.type === options.timingType);
  }

  // Filter by correlation group
  if (options.correlationGroupId) {
    templates = templates.filter(
      (t) => t.correlationGroupId === options.correlationGroupId
    );
  }

  // Filter by date range
  if (options.minResolutionDate && options.maxResolutionDate) {
    templates = templates.filter((t) => {
      if (!t.timing?.resolutionDate) return true;
      const date = t.timing.resolutionDate;
      return date >= options.minResolutionDate && date <= options.maxResolutionDate;
    });
  }

  // Filter to currently active (creatable) templates
  if (options.activeOnly) {
    const now = new Date();
    templates = templates.filter((t) => helpers.shouldCreateMarket(t, now));
  }

  return templates;
}

/**
 * Get correlation groups
 * @returns {Object} Map of correlation group ID to templates
 */
function getCorrelationGroups() {
  const groups = {};
  const allTemplates = getAllTemplates();

  for (const template of allTemplates) {
    if (template.correlationGroupId) {
      if (!groups[template.correlationGroupId]) {
        groups[template.correlationGroupId] = {
          id: template.correlationGroupId,
          name: template.correlationGroupName || template.correlationGroupId,
          category: template.category,
          templates: [],
        };
      }
      groups[template.correlationGroupId].templates.push(template);
    }
  }

  return groups;
}

// Export everything
module.exports = {
  // Template access
  getAllTemplates,
  getTemplatesByCategory,
  getTemplateStats,
  filterTemplates,
  getCorrelationGroups,

  // Category-specific templates
  templates: {
    sports: sportsTemplates,
    politics: politicsTemplates,
    finance: financeTemplates,
    tech: techTemplates,
    crypto: cryptoTemplates,
    "pop-culture": popCultureTemplates,
    weather: weatherTemplates,
  },

  // Helper functions
  ...helpers,

  // IPFS functions
  ipfs,
};
