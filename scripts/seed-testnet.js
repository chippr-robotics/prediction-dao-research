const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Garden of Eden - Mordor Testnet Seeding Script
 * 
 * This script seeds the Mordor testnet with dummy data and markets to simulate
 * real-world usage of the prediction market platform. It creates markets and
 * simulates trading activity with multiple actors over time.
 * 
 * Environment Variables (10 seed players):
 * - SEED_PLAYER_1 through SEED_PLAYER_10: Private keys for seed accounts
 * - SEED_INTERVAL_MS: Time between market creation/trading cycles (default: 300000 = 5 minutes)
 * - SEED_MARKETS_PER_CYCLE: Number of markets to create per cycle (default: 3)
 * - SEED_TRADES_PER_CYCLE: Number of trades per actor per cycle (default: 5)
 * 
 * The script will:
 * 1. Connect to deployed contracts or deploy if needed
 * 2. Periodically create new markets with varied parameters
 * 3. Simulate trading by actors randomly buying/selling positions
 * 4. Run continuously as a service
 */

// Configuration
const CONFIG = {
  // Timing
  intervalMs: parseInt(process.env.SEED_INTERVAL_MS) || 300000, // 5 minutes default
  marketsPerCycle: parseInt(process.env.SEED_MARKETS_PER_CYCLE) || 3,
  tradesPerCycle: parseInt(process.env.SEED_TRADES_PER_CYCLE) || 5,
  
  // Trading parameters
  minTradeAmount: ethers.parseEther("0.1"), // 0.1 ETH minimum
  maxTradeAmount: ethers.parseEther("5"), // 5 ETH maximum
  
  // Market parameters
  minLiquidity: ethers.parseEther("10"),
  maxLiquidity: ethers.parseEther("100"),
  minTradingPeriod: 7 * 24 * 3600, // 7 days
  maxTradingPeriod: 21 * 24 * 3600, // 21 days
  liquidityParams: [100, 500, 1000, 2000], // Various liquidity parameters
  
  // Deployed contract addresses (set these after deployment)
  marketFactoryAddress: process.env.MARKET_FACTORY_ADDRESS || null,
};

// Market templates for variety
const MARKET_TEMPLATES = [
  { question: "Will ETH price exceed $5000 by Q2 2025?", category: "crypto" },
  { question: "Will Bitcoin dominance fall below 40% this year?", category: "crypto" },
  { question: "Will ETC Classic reach 100 TPS by end of year?", category: "tech" },
  { question: "Will DAO treasury grow by 20% in 6 months?", category: "governance" },
  { question: "Will new DEX integration complete successfully?", category: "tech" },
  { question: "Will community proposal #X pass?", category: "governance" },
  { question: "Will TVL exceed $10M within 3 months?", category: "defi" },
  { question: "Will next protocol upgrade deploy on time?", category: "tech" },
  { question: "Will monthly active users double?", category: "adoption" },
  { question: "Will gas fees average below 50 gwei?", category: "network" },
];

// State tracking
let cycleCount = 0;
let totalMarkets = 0;
let totalTrades = 0;
let isRunning = true;

/**
 * Get seed player wallets from environment variables
 */
function getSeedPlayers() {
  const players = [];
  
  for (let i = 1; i <= 10; i++) {
    const privateKey = process.env[`SEED_PLAYER_${i}`];
    if (privateKey) {
      try {
        const wallet = new ethers.Wallet(privateKey, ethers.provider);
        players.push(wallet);
      } catch (error) {
        console.error(`Error loading SEED_PLAYER_${i}:`, error.message);
      }
    }
  }
  
  if (players.length === 0) {
    throw new Error("No seed players configured. Set SEED_PLAYER_1 through SEED_PLAYER_10 environment variables.");
  }
  
  console.log(`✓ Loaded ${players.length} seed player(s)`);
  return players;
}

/**
 * Get or deploy market factory
 */
async function getMarketFactory(deployer) {
  if (CONFIG.marketFactoryAddress) {
    console.log(`Connecting to existing MarketFactory at ${CONFIG.marketFactoryAddress}`);
    const factory = await ethers.getContractAt("ConditionalMarketFactory", CONFIG.marketFactoryAddress);
    return factory;
  }
  
  console.log("Deploying ConditionalMarketFactory...");
  const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory", deployer);
  const factory = await ConditionalMarketFactory.deploy();
  await factory.waitForDeployment();
  const address = await factory.getAddress();
  
  console.log(`✓ ConditionalMarketFactory deployed at ${address}`);
  console.log(`  Set MARKET_FACTORY_ADDRESS=${address} to reuse this deployment`);
  
  // Initialize with deployer as owner
  await factory.initialize(deployer.address);
  console.log("✓ MarketFactory initialized");
  
  return factory;
}

/**
 * Generate random market parameters
 */
function generateMarketParams() {
  const template = MARKET_TEMPLATES[Math.floor(Math.random() * MARKET_TEMPLATES.length)];
  
  // Add timestamp to make questions unique
  const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
  const question = template.question.replace(/[#X]/, `#${uniqueId}`);
  
  const liquidity = randomInRange(CONFIG.minLiquidity, CONFIG.maxLiquidity);
  const tradingPeriod = randomIntInRange(CONFIG.minTradingPeriod, CONFIG.maxTradingPeriod);
  const liquidityParam = CONFIG.liquidityParams[Math.floor(Math.random() * CONFIG.liquidityParams.length)];
  
  // Use a unique proposalId (timestamp-based to avoid collisions)
  const proposalId = Date.now() + Math.floor(Math.random() * 1000000);
  
  return {
    question,
    proposalId,
    collateralToken: ethers.ZeroAddress, // Use ETH as collateral
    liquidity,
    liquidityParam,
    tradingPeriod,
    category: template.category,
  };
}

/**
 * Create markets for this cycle
 */
async function createMarkets(marketFactory, deployer) {
  console.log(`\n📊 Creating ${CONFIG.marketsPerCycle} market(s)...`);
  const createdMarkets = [];
  
  for (let i = 0; i < CONFIG.marketsPerCycle; i++) {
    try {
      const params = generateMarketParams();
      
      console.log(`  Creating market ${i + 1}/${CONFIG.marketsPerCycle}:`);
      console.log(`    Question: ${params.question}`);
      console.log(`    Liquidity: ${ethers.formatEther(params.liquidity)} ETH`);
      console.log(`    Trading period: ${params.tradingPeriod / (24 * 3600)} days`);
      
      const tx = await marketFactory.connect(deployer).deployMarketPair(
        params.proposalId,
        params.collateralToken,
        params.liquidity,
        params.liquidityParam,
        params.tradingPeriod,
        { value: params.liquidity, gasLimit: 5000000 }
      );
      
      const receipt = await tx.wait();
      
      // Find MarketCreated event
      const event = receipt.logs.find(log => {
        try {
          return marketFactory.interface.parseLog(log).name === "MarketCreated";
        } catch {
          return false;
        }
      });
      
      if (event) {
        const marketId = marketFactory.interface.parseLog(event).args.marketId;
        createdMarkets.push({
          id: marketId,
          question: params.question,
          category: params.category,
        });
        console.log(`    ✓ Market created: ID ${marketId}`);
        totalMarkets++;
      }
    } catch (error) {
      console.error(`    ✗ Failed to create market:`, error.message);
    }
    
    // Small delay between creations to avoid nonce issues
    await sleep(2000);
  }
  
  return createdMarkets;
}

/**
 * Execute trades for all active markets
 */
async function executeTrades(marketFactory, players) {
  console.log(`\n💱 Executing trades...`);
  
  // Get active markets
  let activeMarkets;
  try {
    [activeMarkets] = await marketFactory.getActiveMarkets(0, 50);
  } catch (error) {
    console.error("  Failed to fetch active markets:", error.message);
    return;
  }
  
  if (activeMarkets.length === 0) {
    console.log("  No active markets available for trading");
    return;
  }
  
  console.log(`  Found ${activeMarkets.length} active market(s)`);
  
  // Each player makes trades
  for (const player of players) {
    const tradesThisCycle = Math.floor(Math.random() * CONFIG.tradesPerCycle) + 1;
    
    for (let i = 0; i < tradesThisCycle; i++) {
      try {
        // Pick random market
        const marketId = activeMarkets[Math.floor(Math.random() * activeMarkets.length)];
        
        // Random trade parameters
        const buyPass = Math.random() > 0.5; // 50/50 chance
        const amount = randomInRange(CONFIG.minTradeAmount, CONFIG.maxTradeAmount);
        
        // Check player balance
        const balance = await ethers.provider.getBalance(player.address);
        if (balance < amount) {
          console.log(`  ⚠ Player ${player.address.slice(0, 8)}... has insufficient balance, skipping trade`);
          continue;
        }
        
        // Execute trade
        const tx = await marketFactory.connect(player).buyTokens(
          marketId,
          buyPass,
          amount,
          { value: amount, gasLimit: 500000 }
        );
        
        await tx.wait();
        
        console.log(`  ✓ ${player.address.slice(0, 8)}... bought ${buyPass ? 'PASS' : 'FAIL'} tokens in market ${marketId} for ${ethers.formatEther(amount)} ETH`);
        totalTrades++;
      } catch (error) {
        // Silently skip failed trades to avoid spam
        if (error.message.includes("Trading period ended")) {
          // Market has ended, this is expected
        } else {
          console.error(`  ✗ Trade failed:`, error.message.split('\n')[0]);
        }
      }
      
      // Small delay between trades
      await sleep(1000);
    }
  }
}

/**
 * Check and display player balances
 */
async function checkBalances(players) {
  console.log(`\n💰 Checking player balances...`);
  let totalBalance = 0n;
  let lowBalanceCount = 0;
  
  for (const player of players) {
    const balance = await ethers.provider.getBalance(player.address);
    totalBalance += balance;
    
    if (balance < ethers.parseEther("1")) {
      lowBalanceCount++;
      console.log(`  ⚠ ${player.address.slice(0, 8)}... has low balance: ${ethers.formatEther(balance)} ETH`);
    }
  }
  
  const avgBalance = totalBalance / BigInt(players.length);
  console.log(`  Average balance: ${ethers.formatEther(avgBalance)} ETH`);
  
  if (lowBalanceCount > 0) {
    console.log(`  ⚠ ${lowBalanceCount} player(s) with low balance - please replenish accounts`);
  }
}

/**
 * Display statistics
 */
function displayStats() {
  console.log(`\n📈 Statistics:`);
  console.log(`  Total cycles: ${cycleCount}`);
  console.log(`  Total markets created: ${totalMarkets}`);
  console.log(`  Total trades executed: ${totalTrades}`);
  console.log(`  Avg markets per cycle: ${(totalMarkets / Math.max(cycleCount, 1)).toFixed(2)}`);
  console.log(`  Avg trades per cycle: ${(totalTrades / Math.max(cycleCount, 1)).toFixed(2)}`);
}

/**
 * Main seeding cycle
 */
async function runCycle(marketFactory, deployer, players) {
  cycleCount++;
  const cycleStart = Date.now();
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🌱 Garden of Eden - Cycle #${cycleCount}`);
  console.log(`   ${new Date().toISOString()}`);
  console.log(`${'='.repeat(70)}`);
  
  try {
    // Check balances periodically
    if (cycleCount % 5 === 0) {
      await checkBalances(players);
    }
    
    // Create new markets
    await createMarkets(marketFactory, deployer);
    
    // Execute trades
    await executeTrades(marketFactory, players);
    
    // Display stats
    displayStats();
    
    const cycleTime = Date.now() - cycleStart;
    console.log(`\n⏱  Cycle completed in ${(cycleTime / 1000).toFixed(1)}s`);
    console.log(`   Next cycle in ${(CONFIG.intervalMs / 1000).toFixed(0)}s`);
    
  } catch (error) {
    console.error(`\n❌ Cycle error:`, error.message);
    console.error(error.stack);
  }
}

/**
 * Utility: Sleep for ms milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Utility: Random BigInt in range
 */
function randomInRange(min, max) {
  const minNum = Number(ethers.formatEther(min));
  const maxNum = Number(ethers.formatEther(max));
  const random = minNum + Math.random() * (maxNum - minNum);
  return ethers.parseEther(random.toFixed(4));
}

/**
 * Utility: Random integer in range
 */
function randomIntInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
  const shutdown = () => {
    console.log(`\n\n${'='.repeat(70)}`);
    console.log(`🛑 Shutting down Garden of Eden...`);
    console.log(`${'='.repeat(70)}`);
    displayStats();
    console.log(`\n✓ Goodbye!\n`);
    isRunning = false;
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Main entry point
 */
async function main() {
  console.log(`
${'='.repeat(70)}
🌱 Garden of Eden - Mordor Testnet Seeding Service
${'='.repeat(70)}
  
Configuration:
  Network: ${hre.network.name}
  Cycle interval: ${CONFIG.intervalMs / 1000}s
  Markets per cycle: ${CONFIG.marketsPerCycle}
  Trades per cycle: ${CONFIG.tradesPerCycle} per player
  Trade amount: ${ethers.formatEther(CONFIG.minTradeAmount)} - ${ethers.formatEther(CONFIG.maxTradeAmount)} ETH
${'='.repeat(70)}
`);
  
  // Setup signal handlers
  setupSignalHandlers();
  
  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
  
  // Load seed players
  const players = getSeedPlayers();
  const deployer = players[0]; // First player is the deployer/owner
  
  console.log(`Deployer: ${deployer.address}`);
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)} ETH`);
  
  if (deployerBalance < ethers.parseEther("10")) {
    console.warn(`⚠ Warning: Deployer has low balance. Consider replenishing.`);
  }
  
  // Get or deploy market factory
  const marketFactory = await getMarketFactory(deployer);
  CONFIG.marketFactoryAddress = await marketFactory.getAddress();
  
  console.log(`\n✓ Initialization complete! Starting seeding service...\n`);
  
  // Run cycles continuously
  while (isRunning) {
    await runCycle(marketFactory, deployer, players);
    
    // Wait for next cycle
    if (isRunning) {
      await sleep(CONFIG.intervalMs);
    }
  }
}

// Run the script
main()
  .then(() => {
    if (!isRunning) {
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:");
    console.error(error);
    process.exit(1);
  });
