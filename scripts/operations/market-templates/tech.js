const { BET_TYPES, specificDate } = require("./helpers");

/**
 * Tech Market Templates
 * 15+ markets covering AI, hardware, software, and big tech events in 2026
 */

module.exports = [
  // ========================================
  // APPLE 2026
  // ========================================
  {
    question: "Will Apple release a foldable iPhone in 2026?",
    description:
      "Apple is rumored to launch its first foldable iPhone in September 2026, potentially priced over $2000.",
    category: "tech",
    subcategory: "hardware",
    betType: BET_TYPES.YesNo,
    tags: ["Apple", "iPhone", "Foldable", "2026", "Hardware"],
    resolutionCriteria:
      "Resolves YES if Apple officially announces and releases a foldable iPhone by December 31, 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "apple-2026",
    correlationGroupName: "Apple 2026 Products",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Apple announce LLM-powered Siri by Q1 2026?",
    description:
      "Reports suggest Apple is partnering with Google to use Gemini for a major Siri upgrade, targeted for March 2026.",
    category: "tech",
    subcategory: "ai",
    betType: BET_TYPES.YesNo,
    tags: ["Apple", "Siri", "AI", "LLM", "2026"],
    resolutionCriteria:
      "Resolves YES if Apple announces significantly upgraded Siri with LLM capabilities by March 31, 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 3, 31) },
    correlationGroupId: "apple-2026",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Apple Smart Glasses be announced at WWDC 2026?",
    description:
      "Apple is expected to unveil AI-driven smart glasses (not AR) at WWDC 2026, featuring built-in speakers and cameras.",
    category: "tech",
    subcategory: "hardware",
    betType: BET_TYPES.YesNo,
    tags: ["Apple", "Smart Glasses", "WWDC", "2026", "Wearables"],
    resolutionCriteria:
      "Resolves YES if Apple announces smart glasses at WWDC 2026 (expected June). Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 6, 15) },
    correlationGroupId: "apple-2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will Apple launch a smart home hub in 2026?",
    description:
      "Apple is planning a major smart home push around March-April 2026, dependent on improved Siri capabilities.",
    category: "tech",
    subcategory: "hardware",
    betType: BET_TYPES.YesNo,
    tags: ["Apple", "Smart Home", "Hub", "2026"],
    resolutionCriteria:
      "Resolves YES if Apple announces a dedicated smart home hub device in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "apple-2026",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // GOOGLE & AI
  // ========================================
  {
    question: "Will Google announce a GPT-5 competitor at I/O 2026?",
    description:
      "Google I/O 2026 (expected May) is where major AI announcements typically occur. Gemini continues to evolve.",
    category: "tech",
    subcategory: "ai",
    betType: BET_TYPES.YesNo,
    tags: ["Google", "AI", "Gemini", "I/O", "2026"],
    resolutionCriteria:
      "Resolves YES if Google announces a major new AI model at I/O 2026 positioned as next-gen. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 5, 31) },
    correlationGroupId: "google-2026",
    correlationGroupName: "Google 2026",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Gemini power 800 million Samsung devices by end of 2026?",
    description:
      "Samsung announced plans to double Gemini AI integration to 800 million mobile devices by end of 2026.",
    category: "tech",
    subcategory: "ai",
    betType: BET_TYPES.YesNo,
    tags: ["Samsung", "Google", "Gemini", "AI", "2026"],
    resolutionCriteria:
      "Resolves YES if Samsung reports 800M+ Gemini-equipped devices by end of 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "google-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // AI INDUSTRY
  // ========================================
  {
    question: "Will OpenAI release GPT-5 in 2026?",
    description:
      "OpenAI has been iterating on GPT models. The next major version could arrive in 2026.",
    category: "tech",
    subcategory: "ai",
    betType: BET_TYPES.YesNo,
    tags: ["OpenAI", "GPT-5", "AI", "2026"],
    resolutionCriteria:
      "Resolves YES if OpenAI publicly releases a model officially named GPT-5 by December 31, 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "ai-2026",
    correlationGroupName: "AI Developments 2026",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will an AI model achieve AGI benchmark by 2026?",
    description:
      "AGI (Artificial General Intelligence) is a debated milestone. Various benchmarks attempt to measure it.",
    category: "tech",
    subcategory: "ai",
    betType: BET_TYPES.YesNo,
    tags: ["AGI", "AI", "Milestone", "2026"],
    resolutionCriteria:
      "Resolves YES if a major AI lab claims AGI achievement verified by independent benchmark. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "ai-2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will Anthropic reach $10B+ valuation in 2026?",
    description:
      "Anthropic (Claude's creator) has been growing rapidly. AI companies command premium valuations.",
    category: "tech",
    subcategory: "startups",
    betType: BET_TYPES.AboveBelow,
    tags: ["Anthropic", "AI", "Valuation", "Startup", "2026"],
    resolutionCriteria:
      "Resolves YES if Anthropic's valuation is reported at $10B+ in any 2026 funding round or transaction. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "ai-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // HARDWARE & DEVICES
  // ========================================
  {
    question: "Will AMD's market share in CPUs exceed 30% in 2026?",
    description:
      "AMD has been gaining ground against Intel. Ryzen AI 400 series was announced at CES 2026.",
    category: "tech",
    subcategory: "hardware",
    betType: BET_TYPES.AboveBelow,
    tags: ["AMD", "CPU", "Market Share", "2026"],
    resolutionCriteria:
      "Resolves YES if AMD's CPU market share (desktop + laptop) exceeds 30% at any point in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "hardware-2026",
    correlationGroupName: "2026 Hardware",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will Meta release a new Quest VR headset in 2026?",
    description:
      "Meta continues to invest in VR/AR. New Quest devices are typically released every 1-2 years.",
    category: "tech",
    subcategory: "hardware",
    betType: BET_TYPES.YesNo,
    tags: ["Meta", "Quest", "VR", "2026"],
    resolutionCriteria:
      "Resolves YES if Meta releases a new Quest headset in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "hardware-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // SOFTWARE & PLATFORMS
  // ========================================
  {
    question: "Will a major social media platform shut down in 2026?",
    description:
      "Social media landscape continues to evolve. Some platforms struggle while new ones emerge.",
    category: "tech",
    subcategory: "software",
    betType: BET_TYPES.YesNo,
    tags: ["Social Media", "Platform", "Shutdown", "2026"],
    resolutionCriteria:
      "Resolves YES if a social platform with 50M+ users announces shutdown in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "tech-2026",
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will Twitter/X reach 1 billion monthly active users in 2026?",
    description:
      "X has been targeting growth under new leadership. Monthly active users are a key metric.",
    category: "tech",
    subcategory: "software",
    betType: BET_TYPES.YesNo,
    tags: ["Twitter", "X", "Users", "2026"],
    resolutionCriteria:
      "Resolves YES if X reports 1B+ monthly active users at any point in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "tech-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // EVERGREEN TECH TEMPLATES
  // ========================================
  {
    question: "Will a major data breach affecting 100M+ users occur this month?",
    description:
      "Large-scale data breaches continue to be a security concern. Companies of all sizes are targeted.",
    category: "tech",
    subcategory: "software",
    betType: BET_TYPES.YesNo,
    tags: ["Security", "Data Breach", "Privacy"],
    resolutionCriteria:
      "Resolves YES if a breach affecting 100M+ users is disclosed this month. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "50", max: "150" },
  },
  {
    question: "Will Apple stock outperform Microsoft this quarter?",
    description:
      "Comparing the two largest tech companies by market performance over a quarter.",
    category: "tech",
    subcategory: "big-tech",
    betType: BET_TYPES.YesNo,
    tags: ["Apple", "Microsoft", "Stocks", "Performance"],
    resolutionCriteria:
      "Resolves YES if AAPL returns higher than MSFT over the current quarter. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 90 },
    liquidity: { min: "100", max: "200" },
  },
];
