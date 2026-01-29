const { BET_TYPES, specificDate } = require("./helpers");

/**
 * Crypto Market Templates
 * 20+ markets covering Bitcoin, Ethereum, DeFi, and crypto milestones
 */

module.exports = [
  // ========================================
  // BITCOIN MILESTONES
  // ========================================
  {
    question: "Will the 20 millionth Bitcoin be mined by April 2026?",
    description:
      "The 20 millionth Bitcoin is expected to be mined around March 2026. Only 21 million will ever exist.",
    category: "crypto",
    subcategory: "bitcoin",
    betType: BET_TYPES.YesNo,
    tags: ["Bitcoin", "Mining", "Supply", "Milestone", "2026"],
    resolutionCriteria:
      "Resolves YES if total Bitcoin supply reaches 20,000,000 before April 1, 2026 00:00 UTC per blockchain.com or similar data source.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 4, 1) },
    correlationGroupId: "btc-2026-milestones",
    correlationGroupName: "Bitcoin 2026 Milestones",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Bitcoin reach $120,000 in 2026?",
    description:
      "Analyst forecasts for 2026 range from $120K-$170K. Post-halving dynamics and ETF flows are key drivers.",
    category: "crypto",
    subcategory: "bitcoin",
    betType: BET_TYPES.AboveBelow,
    tags: ["Bitcoin", "Price", "2026", "$120K"],
    resolutionCriteria:
      "Resolves YES if BTC/USD reaches $120,000 or higher on any major exchange in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "btc-2026-price",
    correlationGroupName: "Bitcoin 2026 Price Targets",
    liquidity: { min: "300", max: "500" },
  },
  {
    question: "Will Bitcoin reach $150,000 in 2026?",
    description:
      "Mid-range forecast target. Fundstrat and JPMorgan have projected targets in this range.",
    category: "crypto",
    subcategory: "bitcoin",
    betType: BET_TYPES.AboveBelow,
    tags: ["Bitcoin", "Price", "2026", "$150K"],
    resolutionCriteria:
      "Resolves YES if BTC/USD reaches $150,000 or higher on any major exchange in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "btc-2026-price",
    liquidity: { min: "250", max: "450" },
  },
  {
    question: "Will Bitcoin reach $170,000 in 2026?",
    description:
      "JPMorgan's volatility-adjusted gold model suggests $170K if Bitcoin attracts capital like commodities.",
    category: "crypto",
    subcategory: "bitcoin",
    betType: BET_TYPES.AboveBelow,
    tags: ["Bitcoin", "Price", "2026", "$170K"],
    resolutionCriteria:
      "Resolves YES if BTC/USD reaches $170,000 or higher on any major exchange in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "btc-2026-price",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will Bitcoin ETFs see $40 billion in inflows in 2026?",
    description:
      "Bloomberg analysts project 2026 ETF inflows could reach $40B under favorable conditions.",
    category: "crypto",
    subcategory: "bitcoin",
    betType: BET_TYPES.AboveBelow,
    tags: ["Bitcoin", "ETF", "Inflows", "2026", "Institutional"],
    resolutionCriteria:
      "Resolves YES if total 2026 Bitcoin ETF inflows exceed $40 billion. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2027, 1, 15) },
    correlationGroupId: "btc-2026-milestones",
    liquidity: { min: "150", max: "300" },
  },

  // ========================================
  // ETHEREUM
  // ========================================
  {
    question: "Will Ethereum reach $5,000 by Q2 2026?",
    description:
      "ETH price predictions for 2026 range from $2,500-$7,000. RWA tokenization and DeFi are key drivers.",
    category: "crypto",
    subcategory: "ethereum",
    betType: BET_TYPES.AboveBelow,
    tags: ["Ethereum", "ETH", "Price", "2026", "$5K"],
    resolutionCriteria:
      "Resolves YES if ETH/USD reaches $5,000 or higher by June 30, 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 6, 30) },
    correlationGroupId: "eth-2026-price",
    correlationGroupName: "Ethereum 2026 Price Targets",
    liquidity: { min: "250", max: "450" },
  },
  {
    question: "Will Ethereum reach $7,000 in 2026?",
    description:
      "Bullish cases push toward $7,000-$11,000 if RWA tokenization and L2 expansion accelerate.",
    category: "crypto",
    subcategory: "ethereum",
    betType: BET_TYPES.AboveBelow,
    tags: ["Ethereum", "ETH", "Price", "2026", "$7K"],
    resolutionCriteria:
      "Resolves YES if ETH/USD reaches $7,000 or higher on any major exchange in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "eth-2026-price",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will the ETH/BTC ratio exceed 0.06 in 2026?",
    description:
      "The ETH/BTC ratio measures Ethereum's relative performance to Bitcoin.",
    category: "crypto",
    subcategory: "ethereum",
    betType: BET_TYPES.AboveBelow,
    tags: ["Ethereum", "Bitcoin", "Ratio", "2026"],
    resolutionCriteria:
      "Resolves YES if ETH/BTC exceeds 0.06 at any point in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "eth-2026-price",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will Ethereum staking yield average above 4% in 2026?",
    description:
      "Staking rewards vary based on network activity and validator count. Higher yields attract more stakers.",
    category: "crypto",
    subcategory: "ethereum",
    betType: BET_TYPES.AboveBelow,
    tags: ["Ethereum", "Staking", "Yield", "2026"],
    resolutionCriteria:
      "Resolves YES if average ETH staking APR exceeds 4% across 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2027, 1, 15) },
    correlationGroupId: "eth-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // DEFI & ALTCOINS
  // ========================================
  {
    question: "Will DeFi TVL exceed $200 billion in 2026?",
    description:
      "Total Value Locked in DeFi protocols measures adoption. Growth depends on rates and institutional interest.",
    category: "crypto",
    subcategory: "defi",
    betType: BET_TYPES.AboveBelow,
    tags: ["DeFi", "TVL", "2026", "Adoption"],
    resolutionCriteria:
      "Resolves YES if DeFi TVL (per DefiLlama) exceeds $200B at any point in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "defi-2026",
    correlationGroupName: "DeFi 2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will Solana reach $500 in 2026?",
    description:
      "Solana has been a top-performing altcoin. Spot SOL ETFs may further boost institutional interest.",
    category: "crypto",
    subcategory: "altcoins",
    betType: BET_TYPES.AboveBelow,
    tags: ["Solana", "SOL", "Price", "2026"],
    resolutionCriteria:
      "Resolves YES if SOL/USD reaches $500 or higher in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "altcoins-2026",
    correlationGroupName: "Altcoins 2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will a new Layer 1 enter the top 10 by market cap in 2026?",
    description:
      "The top 10 cryptos by market cap changes as new projects gain adoption and existing ones fade.",
    category: "crypto",
    subcategory: "altcoins",
    betType: BET_TYPES.YesNo,
    tags: ["Layer 1", "Altcoins", "Market Cap", "2026"],
    resolutionCriteria:
      "Resolves YES if a Layer 1 blockchain not currently in top 10 enters top 10 by end of 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "altcoins-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // REGULATION & ETFS
  // ========================================
  {
    question: "Will comprehensive US crypto regulation pass in 2026?",
    description:
      "Bipartisan crypto market structure legislation is expected. Grayscale predicts it will become law in 2026.",
    category: "crypto",
    subcategory: "defi",
    betType: BET_TYPES.PassFail,
    tags: ["Regulation", "US", "Legislation", "2026"],
    resolutionCriteria:
      "Resolves PASS if comprehensive crypto regulation is signed into US law by December 31, 2026. Resolves FAIL otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "crypto-regulation-2026",
    correlationGroupName: "Crypto Regulation 2026",
    liquidity: { min: "200", max: "400" },
  },
  {
    question: "Will multiple spot Solana ETFs be approved in 2026?",
    description:
      "After Bitcoin and Ethereum, Solana is the next likely candidate for spot ETF approval.",
    category: "crypto",
    subcategory: "altcoins",
    betType: BET_TYPES.YesNo,
    tags: ["Solana", "ETF", "SEC", "2026"],
    resolutionCriteria:
      "Resolves YES if 2+ spot Solana ETFs are approved by the SEC in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "crypto-regulation-2026",
    liquidity: { min: "150", max: "300" },
  },
  {
    question: "Will XRP ETF be approved in 2026?",
    description:
      "Following the resolution of SEC litigation, XRP ETF applications may be considered.",
    category: "crypto",
    subcategory: "altcoins",
    betType: BET_TYPES.YesNo,
    tags: ["XRP", "ETF", "SEC", "2026"],
    resolutionCriteria:
      "Resolves YES if a spot XRP ETF is approved by the SEC in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "crypto-regulation-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // NFTS
  // ========================================
  {
    question: "Will NFT trading volume recover to $1B/month in 2026?",
    description:
      "NFT volumes have declined from 2021-2022 peaks. Recovery depends on new use cases and collector interest.",
    category: "crypto",
    subcategory: "nft",
    betType: BET_TYPES.AboveBelow,
    tags: ["NFT", "Volume", "2026", "Recovery"],
    resolutionCriteria:
      "Resolves YES if monthly NFT trading volume exceeds $1B for any month in 2026. Resolves NO otherwise.",
    timing: { type: "fixed", resolutionDate: specificDate(2026, 12, 31) },
    correlationGroupId: "nft-2026",
    liquidity: { min: "100", max: "200" },
  },

  // ========================================
  // EVERGREEN CRYPTO TEMPLATES
  // ========================================
  {
    question: "Will Bitcoin price be higher in 30 days?",
    description:
      "Short-term Bitcoin price direction. BTC is known for volatility in any given month.",
    category: "crypto",
    subcategory: "bitcoin",
    betType: BET_TYPES.HigherLower,
    tags: ["Bitcoin", "Price", "Short-term"],
    resolutionCriteria:
      "Resolves YES if BTC/USD in 30 days is higher than today. Resolves NO if lower or unchanged.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will Ethereum outperform Bitcoin this month?",
    description:
      "Comparing ETH vs BTC relative performance over a month.",
    category: "crypto",
    subcategory: "ethereum",
    betType: BET_TYPES.YesNo,
    tags: ["Ethereum", "Bitcoin", "Performance"],
    resolutionCriteria:
      "Resolves YES if ETH percentage gain exceeds BTC percentage gain this month. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 30 },
    liquidity: { min: "100", max: "200" },
  },
  {
    question: "Will any top 10 crypto fall 50% from current price in 60 days?",
    description:
      "Crypto volatility can lead to significant drawdowns even for large-cap assets.",
    category: "crypto",
    subcategory: "altcoins",
    betType: BET_TYPES.YesNo,
    tags: ["Volatility", "Crash", "Altcoins"],
    resolutionCriteria:
      "Resolves YES if any current top 10 crypto drops 50%+ within 60 days. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 60 },
    liquidity: { min: "50", max: "150" },
  },
  {
    question: "Will a major crypto exchange experience issues this week?",
    description:
      "Exchange outages, hacks, or liquidity issues occur periodically in the crypto space.",
    category: "crypto",
    subcategory: "defi",
    betType: BET_TYPES.YesNo,
    tags: ["Exchange", "Outage", "Security"],
    resolutionCriteria:
      "Resolves YES if a top 10 exchange reports significant issues this week. Resolves NO otherwise.",
    timing: { type: "relative", daysFromNow: 7 },
    liquidity: { min: "50", max: "100" },
  },
];
