const { BET_TYPES, specificDate } = require("./helpers");

/**
 * Politics Market Templates
 * 15+ markets covering 2026 US midterm elections and legislation
 */

module.exports = [
  // ========================================
  // 2026 MIDTERM ELECTIONS (November 3, 2026)
  // ========================================

  // Congressional Control
  {
    question: "Will Republicans maintain control of the House in the 2026 midterms?",
    description:
      "The 2026 US midterm elections are on November 3. Republicans currently hold a slim majority. About 24 districts are considered competitive.",
    category: "politics",
    subcategory: "us-elections",
    betType: BET_TYPES.YesNo,
    tags: ["Midterms", "2026", "House", "Republicans", "Congress"],
    resolutionCriteria:
      "Resolves YES if Republicans hold 218+ House seats after all 2026 races are certified. Resolves NO if Democrats control 218+ seats.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 15) },
    correlationGroupId: "midterms-2026",
    correlationGroupName: "2026 US Midterm Elections",
    liquidity: { min: "300", max: "500" },
  },
  {
    question: "Will Democrats gain control of the Senate in 2026?",
    description:
      "Democrats need to gain 4 seats to win Senate control. 35 seats are contested, with 22 held by Republicans.",
    category: "politics",
    subcategory: "us-elections",
    betType: BET_TYPES.YesNo,
    tags: ["Midterms", "2026", "Senate", "Democrats", "Congress"],
    resolutionCriteria:
      "Resolves YES if Democrats hold 51+ Senate seats after 2026 elections. Resolves NO if Republicans retain majority.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 15) },
    correlationGroupId: "midterms-2026",
    liquidity: { min: "300", max: "500" },
  },

  // Key Senate Races
  {
    question: "Will Susan Collins (R) win re-election in Maine?",
    description:
      "Susan Collins is a moderate Republican senator facing a competitive race in traditionally independent Maine.",
    category: "politics",
    subcategory: "us-elections",
    betType: BET_TYPES.WinLose,
    tags: ["Senate", "2026", "Maine", "Collins", "Republican"],
    resolutionCriteria:
      "Resolves YES if Susan Collins wins re-election to the Maine Senate seat. Resolves NO if she loses.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 4) },
    correlationGroupId: "senate-2026",
    correlationGroupName: "2026 Senate Races",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Jon Ossoff (D) win re-election in Georgia?",
    description:
      "Jon Ossoff won narrowly in the 2021 special election. Georgia remains a battleground state.",
    category: "politics",
    subcategory: "us-elections",
    betType: BET_TYPES.WinLose,
    tags: ["Senate", "2026", "Georgia", "Ossoff", "Democrat"],
    resolutionCriteria:
      "Resolves YES if Jon Ossoff wins re-election to the Georgia Senate seat. Resolves NO if he loses.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 4) },
    correlationGroupId: "senate-2026",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Republicans hold the Texas Senate seat in 2026?",
    description:
      "John Cornyn's seat is up for election. Texas has been trending more competitive in recent cycles.",
    category: "politics",
    subcategory: "us-elections",
    betType: BET_TYPES.YesNo,
    tags: ["Senate", "2026", "Texas", "Cornyn", "Republican"],
    resolutionCriteria:
      "Resolves YES if the Republican candidate wins the Texas Senate seat. Resolves NO if Democrat wins.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 4) },
    correlationGroupId: "senate-2026",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Democrats flip the Michigan Senate seat in 2026?",
    description:
      "Gary Peters announced retirement. Michigan is a key swing state in presidential elections.",
    category: "politics",
    subcategory: "us-elections",
    betType: BET_TYPES.YesNo,
    tags: ["Senate", "2026", "Michigan", "Open Seat", "Democrat"],
    resolutionCriteria:
      "Resolves YES if Democrats retain the Michigan Senate seat. Resolves NO if Republicans flip it.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 4) },
    correlationGroupId: "senate-2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will Democrats win the North Carolina Senate race?",
    description:
      "North Carolina is a competitive state. The 2026 race is seen as a key Democratic pickup opportunity.",
    category: "politics",
    subcategory: "us-elections",
    betType: BET_TYPES.YesNo,
    tags: ["Senate", "2026", "North Carolina", "Democrat", "Pickup"],
    resolutionCriteria:
      "Resolves YES if the Democratic candidate wins the NC Senate seat. Resolves NO if Republican wins.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 4) },
    correlationGroupId: "senate-2026",
    liquidity: { min: "200", max: "350" },
  },

  // Special Elections
  {
    question: "Will Jon Husted (R) win the Ohio Senate special election?",
    description:
      "Jon Husted was appointed after JD Vance became VP. Sherrod Brown is running as the Democratic challenger.",
    category: "politics",
    subcategory: "us-elections",
    betType: BET_TYPES.WinLose,
    tags: ["Senate", "2026", "Ohio", "Special Election", "Husted"],
    resolutionCriteria:
      "Resolves YES if Jon Husted wins the Ohio Senate special election. Resolves NO if he loses.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 4) },
    correlationGroupId: "senate-2026",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Republicans win the Florida Senate special election?",
    description:
      "Marco Rubio's seat is being contested after he became Secretary of State. Ashley Moody was appointed interim.",
    category: "politics",
    subcategory: "us-elections",
    betType: BET_TYPES.YesNo,
    tags: ["Senate", "2026", "Florida", "Special Election", "Republican"],
    resolutionCriteria:
      "Resolves YES if the Republican candidate wins the Florida special election. Resolves NO if Democrat wins.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 11, 4) },
    correlationGroupId: "senate-2026",
    liquidity: { min: "200", max: "350" },
  },

  // ========================================
  // LEGISLATION
  // ========================================
  {
    question: "Will comprehensive crypto regulation become US law in 2026?",
    description:
      "Bipartisan crypto market structure legislation has been expected. The CFTC has been more accommodating to prediction markets.",
    category: "politics",
    subcategory: "legislation",
    betType: BET_TYPES.PassFail,
    tags: ["Legislation", "Crypto", "2026", "Regulation", "Congress"],
    resolutionCriteria:
      "Resolves PASS if comprehensive crypto regulation legislation is signed into law by December 31, 2026. Resolves FAIL otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "legislation-2026",
    correlationGroupName: "2026 Legislation",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will the US raise the debt ceiling without a crisis in 2026?",
    description:
      "Debt ceiling negotiations have led to brinkmanship in recent years. 2026 may require another increase.",
    category: "politics",
    subcategory: "legislation",
    betType: BET_TYPES.YesNo,
    tags: ["Legislation", "Debt Ceiling", "2026", "Congress"],
    resolutionCriteria:
      "Resolves YES if debt ceiling is raised or suspended before any technical default. Resolves NO if default occurs.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "legislation-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // GEOPOLITICS
  // ========================================
  {
    question: "Will there be a new major trade agreement involving the US in 2026?",
    description:
      "The US has been reassessing trade relationships and may pursue new bilateral or multilateral agreements.",
    category: "politics",
    subcategory: "geopolitics",
    betType: BET_TYPES.YesNo,
    tags: ["Trade", "Agreement", "2026", "International", "Policy"],
    resolutionCriteria:
      "Resolves YES if the US signs a significant new trade agreement in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "geopolitics-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // EVERGREEN POLITICAL TEMPLATES
  // ========================================
  {
    question: "Will the President's approval rating be above 45% in 30 days?",
    description:
      "Presidential approval is tracked by multiple polling aggregators including FiveThirtyEight and RealClearPolitics.",
    category: "politics",
    subcategory: "policy",
    betType: BET_TYPES.AboveBelow,
    tags: ["President", "Approval", "Polling"],
    resolutionCriteria:
      "Resolves YES if FiveThirtyEight's approval average is above 45% at resolution. Resolves NO if 45% or below.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will a major cabinet resignation occur this month?",
    description:
      "Cabinet-level officials occasionally resign for various reasons. This tracks unexpected departures.",
    category: "politics",
    subcategory: "policy",
    betType: BET_TYPES.YesNo,
    tags: ["Cabinet", "Resignation", "Administration"],
    resolutionCriteria:
      "Resolves YES if a cabinet-level official announces resignation during the month. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "50", max: "150" },
  },
  {
    question: "Will Congress pass any major legislation this quarter?",
    description:
      "Major legislation includes bills with significant policy impact, not routine procedural matters.",
    category: "politics",
    subcategory: "legislation",
    betType: BET_TYPES.YesNo,
    tags: ["Congress", "Legislation", "Policy"],
    resolutionCriteria:
      "Resolves YES if a significant bill (budget, infrastructure, etc.) passes both chambers. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 90 },
    liquidity: { min: "100", max: "200" },
  },
];
