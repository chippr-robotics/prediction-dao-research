const { BET_TYPES, specificDate } = require("./helpers");

/**
 * Weather Market Templates
 * 15+ markets covering climate, storms, temperature records, and seasonal forecasts
 */

module.exports = [
  // ========================================
  // CLIMATE & ANNUAL RECORDS
  // ========================================
  {
    question: "Will 2026 be the hottest year on record globally?",
    description:
      "Global temperature records are tracked by NASA GISS and NOAA. Recent years have set new records.",
    category: "weather",
    subcategory: "temperature",
    betType: BET_TYPES.YesNo,
    tags: ["Climate", "Temperature", "Records", "2026", "Global"],
    resolutionCriteria:
      "Resolves YES if NASA GISS or NOAA declares 2026 as the warmest year in recorded history. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2027, 1, 20) },
    correlationGroupId: "climate-2026",
    correlationGroupName: "Climate 2026",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will global average temperature rise exceed 1.5C above pre-industrial levels in 2026?",
    description:
      "The Paris Agreement aims to limit warming to 1.5C. We are approaching this threshold.",
    category: "weather",
    subcategory: "temperature",
    betType: BET_TYPES.AboveBelow,
    tags: ["Climate", "Paris Agreement", "1.5C", "2026"],
    resolutionCriteria:
      "Resolves YES if 2026 global average temperature exceeds 1.5C above pre-industrial baseline. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2027, 1, 20) },
    correlationGroupId: "climate-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // HURRICANE SEASON (June-November)
  // ========================================
  {
    question: "Will there be 20+ named Atlantic storms in 2026?",
    description:
      "The Atlantic hurricane season runs June 1 - November 30. Above-average seasons have 15-20+ named storms.",
    category: "weather",
    subcategory: "storms",
    betType: BET_TYPES.OverUnder,
    tags: ["Hurricane", "Atlantic", "2026", "Storms"],
    resolutionCriteria:
      "Resolves YES if 20 or more named storms form in the Atlantic basin during the 2026 season. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 1) },
    correlationGroupId: "hurricane-2026",
    correlationGroupName: "2026 Hurricane Season",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will a Category 5 hurricane make US landfall in 2026?",
    description:
      "Category 5 hurricanes (157+ mph winds) are the most destructive. Direct US landfalls at Cat 5 are relatively rare.",
    category: "weather",
    subcategory: "storms",
    betType: BET_TYPES.YesNo,
    tags: ["Hurricane", "Category 5", "US Landfall", "2026"],
    resolutionCriteria:
      "Resolves YES if any hurricane at Category 5 intensity makes US landfall in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 1) },
    correlationGroupId: "hurricane-2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will hurricane damage in the US exceed $50 billion in 2026?",
    description:
      "Hurricane damage costs vary dramatically by storm intensity and landfall location.",
    category: "weather",
    subcategory: "storms",
    betType: BET_TYPES.AboveBelow,
    tags: ["Hurricane", "Damage", "Cost", "2026"],
    resolutionCriteria:
      "Resolves YES if total 2026 US hurricane damage exceeds $50 billion. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2027, 1, 31) },
    correlationGroupId: "hurricane-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // WINTER WEATHER
  // ========================================
  {
    question: "Will there be a white Christmas in New York City in 2026?",
    description:
      "A white Christmas requires 1+ inch of snow on the ground on December 25. Rare in NYC.",
    category: "weather",
    subcategory: "snowfall",
    betType: BET_TYPES.YesNo,
    tags: ["Snow", "Christmas", "NYC", "2026"],
    resolutionCriteria:
      "Resolves YES if Central Park has 1+ inch snow cover on December 25, 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 26) },
    correlationGroupId: "winter-2026",
    correlationGroupName: "Winter 2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will the Northeast US experience a major blizzard in Winter 2026?",
    description:
      "Major blizzards bring 12+ inches of snow with sustained high winds. Can paralyze major cities.",
    category: "weather",
    subcategory: "snowfall",
    betType: BET_TYPES.YesNo,
    tags: ["Blizzard", "Northeast", "Snow", "2026"],
    resolutionCriteria:
      "Resolves YES if a blizzard drops 12+ inches on any major Northeast city (NYC, Boston, Philly) in Jan-Feb 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 3, 1) },
    correlationGroupId: "winter-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // SUMMER HEAT
  // ========================================
  {
    question: "Will Death Valley set a new world record high temperature in 2026?",
    description:
      "Death Valley holds the world record at 134F (56.7C) from 1913. Extreme heat events are increasing.",
    category: "weather",
    subcategory: "records",
    betType: BET_TYPES.YesNo,
    tags: ["Temperature", "Record", "Death Valley", "Heat"],
    resolutionCriteria:
      "Resolves YES if a new verified world record high temperature is set in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 9, 30) },
    correlationGroupId: "heat-2026",
    correlationGroupName: "Summer Heat 2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will Europe experience a major heat wave in Summer 2026?",
    description:
      "European heat waves have become more common. Major heat waves cause health emergencies and wildfires.",
    category: "weather",
    subcategory: "temperature",
    betType: BET_TYPES.YesNo,
    tags: ["Heat Wave", "Europe", "Summer", "2026"],
    resolutionCriteria:
      "Resolves YES if temperatures exceed 40C (104F) for 5+ consecutive days in any major European city during Summer 2026.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 9, 30) },
    correlationGroupId: "heat-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // DROUGHT & PRECIPITATION
  // ========================================
  {
    question: "Will California experience exceptional drought conditions in 2026?",
    description:
      "California's water supply is monitored by the US Drought Monitor. Exceptional drought (D4) is the most severe category.",
    category: "weather",
    subcategory: "drought",
    betType: BET_TYPES.YesNo,
    tags: ["Drought", "California", "Water", "2026"],
    resolutionCriteria:
      "Resolves YES if any part of California reaches D4 (Exceptional Drought) on US Drought Monitor in 2026.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "drought-2026",
    correlationGroupName: "Drought 2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will Lake Mead water levels drop to critical lows in 2026?",
    description:
      "Lake Mead serves millions in the Southwest. Critical levels trigger water restrictions.",
    category: "weather",
    subcategory: "drought",
    betType: BET_TYPES.YesNo,
    tags: ["Lake Mead", "Water", "Southwest", "2026"],
    resolutionCriteria:
      "Resolves YES if Lake Mead drops below 1,000 feet elevation at any point in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "drought-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // SEASONAL FORECASTS
  // ========================================
  {
    question: "Will El Nino conditions develop in 2026?",
    description:
      "El Nino/La Nina cycles affect global weather patterns. NOAA tracks these conditions closely.",
    category: "weather",
    subcategory: "seasonal",
    betType: BET_TYPES.YesNo,
    tags: ["El Nino", "Climate Pattern", "ENSO", "2026"],
    resolutionCriteria:
      "Resolves YES if NOAA declares El Nino conditions at any point in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "seasonal-2026",
    correlationGroupName: "Seasonal Patterns 2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will the 2026 Atlantic hurricane season be above average?",
    description:
      "NOAA forecasts hurricane season severity. Above average means 14+ named storms.",
    category: "weather",
    subcategory: "seasonal",
    betType: BET_TYPES.YesNo,
    tags: ["Hurricane", "Forecast", "NOAA", "2026"],
    resolutionCriteria:
      "Resolves YES if the 2026 Atlantic hurricane season produces 14+ named storms. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 1) },
    correlationGroupId: "seasonal-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // EVERGREEN WEATHER TEMPLATES
  // ========================================
  {
    question: "Will average temperature be above normal this month?",
    description:
      "Monthly temperature deviations compared to 30-year climate normals.",
    category: "weather",
    subcategory: "temperature",
    betType: BET_TYPES.AboveBelow,
    tags: ["Temperature", "Monthly", "Climate"],
    resolutionCriteria:
      "Resolves YES if US average temperature exceeds the 1991-2020 normal for the month. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "50", max: "150" },
  },
  {
    question: "Will precipitation be above average this week?",
    description:
      "Weekly precipitation compared to historical averages for the region.",
    category: "weather",
    subcategory: "precipitation",
    betType: BET_TYPES.AboveBelow,
    tags: ["Rain", "Precipitation", "Weekly"],
    resolutionCriteria:
      "Resolves YES if national precipitation exceeds weekly average. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 7 },
    liquidity: { min: "50", max: "100" },
  },
  {
    question: "Will a significant tornado outbreak occur in the US this month?",
    description:
      "Tornado outbreaks involve multiple tornadoes in a short period. Spring months see most activity.",
    category: "weather",
    subcategory: "storms",
    betType: BET_TYPES.YesNo,
    tags: ["Tornado", "Outbreak", "Severe Weather"],
    resolutionCriteria:
      "Resolves YES if 20+ tornadoes occur in a single day this month. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "50", max: "150" },
  },
];
