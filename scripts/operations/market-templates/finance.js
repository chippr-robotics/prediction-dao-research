const { BET_TYPES, specificDate } = require("./helpers");

/**
 * Finance Market Templates
 * 15+ markets covering stocks, interest rates, economy, and corporate events
 */

module.exports = [
  // ========================================
  // INTEREST RATES & FED POLICY
  // ========================================
  {
    question: "Will the Federal Reserve cut rates in Q1 2026?",
    description:
      "The Fed sets monetary policy through the Federal Open Market Committee (FOMC). Rate decisions impact markets broadly.",
    category: "finance",
    subcategory: "interest-rates",
    betType: BET_TYPES.YesNo,
    tags: ["Fed", "Interest Rates", "2026", "Monetary Policy", "FOMC"],
    resolutionCriteria:
      "Resolves YES if the Fed cuts the target rate at any FOMC meeting in Q1 2026 (Jan-Mar). Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 3, 31) },
    correlationGroupId: "fed-2026",
    correlationGroupName: "2026 Fed Policy",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will the Fed funds rate be below 4% by end of 2026?",
    description:
      "The Fed has been managing inflation while balancing economic growth. Current rates remain elevated.",
    category: "finance",
    subcategory: "interest-rates",
    betType: BET_TYPES.AboveBelow,
    tags: ["Fed", "Interest Rates", "2026", "Rate Target"],
    resolutionCriteria:
      "Resolves YES if the Fed funds target rate upper bound is below 4.00% on December 31, 2026. Resolves NO if 4.00% or above.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "fed-2026",
    liquidity: { min: "200", max: "400" },
  },

  // ========================================
  // STOCK MARKET
  // ========================================
  {
    question: "Will the S&P 500 reach 6500 by end of 2026?",
    description:
      "The S&P 500 is the benchmark US stock index. Market performance depends on earnings, rates, and economic conditions.",
    category: "finance",
    subcategory: "stocks",
    betType: BET_TYPES.AboveBelow,
    tags: ["S&P 500", "Stocks", "2026", "Market"],
    resolutionCriteria:
      "Resolves YES if S&P 500 closes at or above 6500 on any trading day in 2026. Resolves NO if it never reaches this level.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "markets-2026",
    correlationGroupName: "2026 Stock Market",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will the NASDAQ-100 outperform the S&P 500 in 2026?",
    description:
      "The NASDAQ-100 is tech-heavy while S&P 500 is more diversified. AI and tech trends influence relative performance.",
    category: "finance",
    subcategory: "stocks",
    betType: BET_TYPES.YesNo,
    tags: ["NASDAQ", "S&P 500", "Tech", "Performance", "2026"],
    resolutionCriteria:
      "Resolves YES if NASDAQ-100 has higher total return than S&P 500 for calendar year 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "markets-2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will there be a 10% market correction in Q1 2026?",
    description:
      "A correction is typically defined as a 10% decline from recent highs. Markets can be volatile early in election years.",
    category: "finance",
    subcategory: "stocks",
    betType: BET_TYPES.YesNo,
    tags: ["Correction", "S&P 500", "Volatility", "2026"],
    resolutionCriteria:
      "Resolves YES if S&P 500 falls 10% or more from any high in Q1 2026. Resolves NO if no 10% drawdown occurs.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 3, 31) },
    correlationGroupId: "markets-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // ECONOMY
  // ========================================
  {
    question: "Will US unemployment rise above 5% in 2026?",
    description:
      "Unemployment rates have been historically low. Economic conditions could change labor market dynamics.",
    category: "finance",
    subcategory: "economy",
    betType: BET_TYPES.AboveBelow,
    tags: ["Unemployment", "Jobs", "Economy", "2026"],
    resolutionCriteria:
      "Resolves YES if the BLS reports monthly unemployment at 5.0% or higher at any point in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "economy-2026",
    correlationGroupName: "2026 Economy",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will US GDP growth exceed 2.5% for full year 2026?",
    description:
      "GDP growth is the primary measure of economic expansion. The US economy has shown resilience in recent years.",
    category: "finance",
    subcategory: "economy",
    betType: BET_TYPES.AboveBelow,
    tags: ["GDP", "Growth", "Economy", "2026"],
    resolutionCriteria:
      "Resolves YES if annual US GDP growth for 2026 is reported at 2.5% or higher. Resolves NO if below 2.5%.",
    timing: { type: "fixed", resolutionDate: specificDate(2027, 2, 1) },
    correlationGroupId: "economy-2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will US inflation fall below 2.5% by end of 2026?",
    description:
      "The Fed targets 2% inflation. Returning to this level from elevated rates has been gradual.",
    category: "finance",
    subcategory: "economy",
    betType: BET_TYPES.AboveBelow,
    tags: ["Inflation", "CPI", "Economy", "2026", "Fed"],
    resolutionCriteria:
      "Resolves YES if December 2026 CPI year-over-year is below 2.5%. Resolves NO if 2.5% or above.",
    timing: { type: "fixed", resolutionDate: specificDate(2027, 1, 15) },
    correlationGroupId: "economy-2026",
    liquidity: { min: "200", max: "400" },
  },

  // ========================================
  // CORPORATE
  // ========================================
  {
    question: "Will Apple remain the most valuable US company in 2026?",
    description:
      "Apple has been the largest US company by market cap. AI developments may shift valuations.",
    category: "finance",
    subcategory: "corporate",
    betType: BET_TYPES.YesNo,
    tags: ["Apple", "Market Cap", "Tech", "2026"],
    resolutionCriteria:
      "Resolves YES if Apple has the highest market cap among US companies on Dec 31, 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "corporate-2026",
    correlationGroupName: "2026 Corporate",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will there be a tech company layoff exceeding 10,000 employees in 2026?",
    description:
      "Tech layoffs have been significant in recent years. Companies continue to adjust workforce sizes.",
    category: "finance",
    subcategory: "corporate",
    betType: BET_TYPES.YesNo,
    tags: ["Layoffs", "Tech", "Jobs", "2026"],
    resolutionCriteria:
      "Resolves YES if any single tech company announces layoffs of 10,000+ employees in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "corporate-2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will a new company reach $1 trillion market cap in 2026?",
    description:
      "The trillion-dollar club has grown. Companies near this threshold could break through.",
    category: "finance",
    subcategory: "corporate",
    betType: BET_TYPES.YesNo,
    tags: ["Market Cap", "Trillion", "Tech", "2026"],
    resolutionCriteria:
      "Resolves YES if a company that has never been valued at $1T reaches that milestone in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "corporate-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // COMMODITIES
  // ========================================
  {
    question: "Will gold reach $2500/oz in 2026?",
    description:
      "Gold is a traditional safe-haven asset. Prices are influenced by rates, inflation, and geopolitical uncertainty.",
    category: "finance",
    subcategory: "commodities",
    betType: BET_TYPES.AboveBelow,
    tags: ["Gold", "Commodities", "Precious Metals", "2026"],
    resolutionCriteria:
      "Resolves YES if spot gold price reaches $2500/oz at any point in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "commodities-2026",
    correlationGroupName: "2026 Commodities",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will oil prices average above $80/barrel in Q2 2026?",
    description:
      "Oil prices are influenced by OPEC policy, global demand, and geopolitical events.",
    category: "finance",
    subcategory: "commodities",
    betType: BET_TYPES.AboveBelow,
    tags: ["Oil", "Commodities", "Energy", "2026"],
    resolutionCriteria:
      "Resolves YES if WTI crude average price exceeds $80/barrel for Q2 2026. Resolves NO if $80 or below.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 6, 30) },
    correlationGroupId: "commodities-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // EVERGREEN FINANCE TEMPLATES
  // ========================================
  {
    question: "Will the S&P 500 be higher in 30 days?",
    description:
      "Short-term market direction tracking. Markets can be volatile in any given month.",
    category: "finance",
    subcategory: "stocks",
    betType: BET_TYPES.HigherLower,
    tags: ["S&P 500", "Stocks", "Short-term"],
    resolutionCriteria:
      "Resolves YES if S&P 500 closing price in 30 days is higher than today. Resolves NO if lower or unchanged.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will any company announce a major acquisition this week?",
    description:
      "M&A activity varies with market conditions. Major acquisitions are valued at $10B+.",
    category: "finance",
    subcategory: "corporate",
    betType: BET_TYPES.YesNo,
    tags: ["M&A", "Acquisition", "Corporate"],
    resolutionCriteria:
      "Resolves YES if any acquisition over $10B is announced this week. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 7 },
    liquidity: { min: "50", max: "150" },
  },
];
