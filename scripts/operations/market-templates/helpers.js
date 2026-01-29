const { ethers } = require("hardhat");

/**
 * Market Template Helpers
 * Utility functions for generating and managing market templates
 */

// Bet type enum values (matching ConditionalMarketFactory.sol)
const BET_TYPES = {
  YesNo: 0,
  PassFail: 1,
  AboveBelow: 2,
  HigherLower: 3,
  InOut: 4,
  OverUnder: 5,
  ForAgainst: 6,
  TrueFalse: 7,
  WinLose: 8,
  UpDown: 9,
};

// Bet type labels for display
const BET_TYPE_LABELS = {
  0: "Yes / No",
  1: "Pass / Fail",
  2: "Above / Below",
  3: "Higher / Lower",
  4: "In / Out",
  5: "Over / Under",
  6: "For / Against",
  7: "True / False",
  8: "Win / Lose",
  9: "Up / Down",
};

// Category display names
const CATEGORY_NAMES = {
  sports: "Sports",
  politics: "Politics",
  finance: "Finance",
  tech: "Tech",
  crypto: "Crypto",
  "pop-culture": "Pop-Culture",
  weather: "Weather",
};

/**
 * Create a date object for a specific date
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number} day - Day
 * @param {number} hour - Hour (0-23, default 23)
 * @param {number} minute - Minute (default 59)
 * @returns {Date} Date object in UTC
 */
function specificDate(year, month, day, hour = 23, minute = 59) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
}

/**
 * Get a date X days from now
 * @param {number} days - Number of days from now
 * @returns {Date} Future date
 */
function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Generate a deterministic proposal ID from template data
 * Uses keccak256 hash to ensure uniqueness and reproducibility
 * @param {Object} template - Market template
 * @param {Date} currentDate - Current date for versioning
 * @returns {BigInt} Proposal ID
 */
function generateProposalId(template, currentDate = new Date()) {
  const dateStr = currentDate.toISOString().slice(0, 10);
  const input = `${template.question}-${template.category}-${dateStr}`;
  const hash = ethers.keccak256(ethers.toUtf8Bytes(input));
  // Take first 16 hex chars (64 bits) for proposal ID
  return BigInt(hash.slice(0, 18));
}

/**
 * Calculate trading period based on template timing
 * @param {Object} template - Market template
 * @param {Date} currentDate - Current date
 * @returns {number} Trading period in seconds
 */
function calculateTradingPeriod(template, currentDate = new Date()) {
  const MIN_TRADING = 7 * 24 * 3600; // 7 days
  const MAX_TRADING = 21 * 24 * 3600; // 21 days
  const MIN_BUFFER = 1 * 24 * 3600; // 1 day before resolution

  if (template.timing.type === "fixed" && template.timing.resolutionDate) {
    const msUntilResolution =
      template.timing.resolutionDate.getTime() - currentDate.getTime();
    const daysUntil = msUntilResolution / (1000 * 60 * 60 * 24);

    // Calculate available trading time (leaving buffer before resolution)
    const availableDays = Math.max(0, daysUntil - 1);
    const tradingDays = Math.min(21, Math.max(7, availableDays));

    return Math.floor(tradingDays * 24 * 3600);
  }

  if (template.timing.type === "relative" && template.timing.daysFromNow) {
    const days = Math.min(21, Math.max(7, template.timing.daysFromNow - 1));
    return days * 24 * 3600;
  }

  // Default: 14 days
  return 14 * 24 * 3600;
}

/**
 * Calculate liquidity amount from template config
 * @param {Object} template - Market template
 * @param {number} decimals - Token decimals (default 6 for USC)
 * @returns {BigInt} Liquidity amount in wei
 */
function calculateLiquidity(template, decimals = 6) {
  const min = parseFloat(template.liquidity?.min || "100");
  const max = parseFloat(template.liquidity?.max || "200");
  const amount = min + Math.random() * (max - min);
  return ethers.parseUnits(amount.toFixed(2), decimals);
}

/**
 * Check if a template should be created now based on timing
 * @param {Object} template - Market template
 * @param {Date} currentDate - Current date
 * @returns {boolean} True if template should be created
 */
function shouldCreateMarket(template, currentDate = new Date()) {
  // Evergreen templates are always valid
  if (template.timing.type === "evergreen") {
    return true;
  }

  // Relative timing is always valid
  if (template.timing.type === "relative") {
    return true;
  }

  // Fixed timing: check if we're in the creation window
  if (template.timing.type === "fixed" && template.timing.resolutionDate) {
    const msUntil =
      template.timing.resolutionDate.getTime() - currentDate.getTime();
    const daysUntil = msUntil / (1000 * 60 * 60 * 24);

    // Create markets 7-90 days before resolution
    return daysUntil >= 7 && daysUntil <= 90;
  }

  return true;
}

/**
 * Filter templates to those that should be created now
 * @param {Array} templates - All market templates
 * @param {Date} currentDate - Current date
 * @returns {Array} Filtered templates
 */
function filterActiveTemplates(templates, currentDate = new Date()) {
  return templates.filter((t) => shouldCreateMarket(t, currentDate));
}

/**
 * Select templates with category diversity
 * @param {Array} templates - All market templates
 * @param {number} count - Number of templates to select
 * @param {Date} currentDate - Current date
 * @returns {Array} Selected templates
 */
function selectDiverseTemplates(templates, count, currentDate = new Date()) {
  const active = filterActiveTemplates(templates, currentDate);

  // Group by category
  const byCategory = {};
  for (const t of active) {
    const cat = t.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  }

  // Select round-robin from categories
  const selected = [];
  const categories = Object.keys(byCategory);
  let catIndex = 0;

  while (selected.length < count && selected.length < active.length) {
    const cat = categories[catIndex % categories.length];
    const catTemplates = byCategory[cat];

    if (catTemplates && catTemplates.length > 0) {
      // Pick random from category
      const idx = Math.floor(Math.random() * catTemplates.length);
      selected.push(catTemplates.splice(idx, 1)[0]);
    }

    catIndex++;

    // Safety: break if we've cycled through all categories without finding templates
    if (catIndex > categories.length * count) break;
  }

  return selected;
}

/**
 * Build complete market parameters from template
 * @param {Object} template - Market template
 * @param {string} uscAddress - USC token address
 * @param {number} decimals - Token decimals
 * @param {Date} currentDate - Current date
 * @returns {Object} Market creation parameters
 */
function buildMarketParams(template, uscAddress, decimals = 6, currentDate = new Date()) {
  return {
    question: template.question,
    description: template.description || "",
    category: template.category,
    subcategory: template.subcategory,
    proposalId: generateProposalId(template, currentDate),
    collateralToken: uscAddress,
    liquidity: calculateLiquidity(template, decimals),
    liquidityParam: ethers.parseUnits("100", decimals),
    tradingPeriod: calculateTradingPeriod(template, currentDate),
    betType: template.betType,
    tags: template.tags || [],
    resolutionCriteria: template.resolutionCriteria || "",
    correlationGroupId: template.correlationGroupId || null,
  };
}

/**
 * Calculate total liquidity needed for all templates
 * @param {Array} templates - Market templates
 * @param {number} decimals - Token decimals
 * @returns {BigInt} Total liquidity in wei
 */
function calculateTotalLiquidity(templates, decimals = 6) {
  let total = 0n;
  for (const template of templates) {
    // Use average of min/max for estimation
    const min = parseFloat(template.liquidity?.min || "100");
    const max = parseFloat(template.liquidity?.max || "200");
    const avg = (min + max) / 2;
    total += ethers.parseUnits(avg.toFixed(2), decimals);
  }
  return total;
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format date for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Get resolution date display string
 * @param {Object} template - Market template
 * @returns {string} Human-readable resolution date
 */
function getResolutionDateDisplay(template) {
  if (template.timing.type === "fixed" && template.timing.resolutionDate) {
    return formatDate(template.timing.resolutionDate);
  }
  if (template.timing.type === "relative" && template.timing.daysFromNow) {
    return `${template.timing.daysFromNow} days from creation`;
  }
  return "TBD";
}

module.exports = {
  BET_TYPES,
  BET_TYPE_LABELS,
  CATEGORY_NAMES,
  specificDate,
  daysFromNow,
  generateProposalId,
  calculateTradingPeriod,
  calculateLiquidity,
  shouldCreateMarket,
  filterActiveTemplates,
  selectDiverseTemplates,
  buildMarketParams,
  calculateTotalLiquidity,
  sleep,
  formatDate,
  getResolutionDateDisplay,
};
