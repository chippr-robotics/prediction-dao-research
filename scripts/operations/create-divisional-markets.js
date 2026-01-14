const { ethers } = require("hardhat");
const { loadMnemonicFromFloppy } = require("./floppy-key/loader");

/**
 * Create NFL Divisional Round Prediction Markets
 *
 * Creates 4 pending friend markets for the 2026 NFL Divisional Round matchups.
 * Each market requires the opponent to accept and stake to activate.
 *
 * Usage:
 *   export FLOPPY_KEYSTORE_PASSWORD="password"
 *   npx hardhat run scripts/operations/create-divisional-markets.js --network mordor
 */

// Contract addresses
const CONTRACTS = {
  friendGroupMarketFactory: "0x8cFE477e267bB36925047df8A6E30348f82b0085",
  tierRegistryAdapter: "0x8e3A4C65a6C22d88515FD356cB00732adac4f4d7",
};

// NFL Divisional Round matchups (January 17-18, 2026)
const MATCHUPS = [
  { home: "Denver Broncos", away: "Buffalo Bills", conference: "AFC" },
  { home: "Houston Texans", away: "New England Patriots", conference: "AFC" },
  { home: "Seattle Seahawks", away: "San Francisco 49ers", conference: "NFC" },
  { home: "Los Angeles Rams", away: "Chicago Bears", conference: "NFC" },
];

// Configuration
const CONFIG = {
  opponent: "0xB8594B2d60261C89E49B9D64C7165B2f33fFB90E",
  stakeAmount: "0.5", // ETC per participant
  tradingPeriodDays: 7,
  acceptanceDeadlineDays: 7,
};

// ABIs
const FACTORY_ABI = [
  "function createOneVsOneMarketPending(address opponent, string memory description, uint256 tradingPeriod, address arbitrator, uint256 acceptanceDeadline, uint256 stakeAmount, address stakeToken) external payable returns (uint256 friendMarketId)",
  "function friendMarketCount() external view returns (uint256)",
  "function getFriendMarketWithStatus(uint256 friendMarketId) external view returns (uint256 marketId, uint8 marketType, address creator, address[] memory members, address arbitrator, uint8 status, uint256 acceptanceDeadline, uint256 stakePerParticipant, address stakeToken, uint256 acceptedCount, uint256 minThreshold, string memory description)",
];

const ADAPTER_ABI = [
  "function FRIEND_MARKET_ROLE() external view returns (bytes32)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function isMembershipActive(address user, bytes32 role) external view returns (bool)",
  "function getUserTier(address user, bytes32 role) external view returns (uint8)",
  "function getUsageStats(address user, bytes32 role) external view returns (tuple(uint256 dailyBetsCount, uint256 weeklyBetsCount, uint256 monthlyMarketsCreated, uint256 dailyWithdrawals, uint256 activeMarketsCount, uint256 lastDailyReset, uint256 lastWeeklyReset, uint256 lastMonthlyReset))",
];

async function main() {
  console.log("=".repeat(60));
  console.log("Create NFL Divisional Round Prediction Markets");
  console.log("=".repeat(60));

  // Load floppy wallet
  console.log("\n[1/4] Loading floppy wallet...");
  const mnemonic = await loadMnemonicFromFloppy();
  const provider = ethers.provider;
  const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");
  const wallet = hdWallet.connect(provider);

  console.log("Wallet address:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETC");

  // Check membership
  console.log("\n[2/4] Verifying membership...");
  const adapter = new ethers.Contract(CONTRACTS.tierRegistryAdapter, ADAPTER_ABI, wallet);
  const FRIEND_MARKET_ROLE = await adapter.FRIEND_MARKET_ROLE();

  const hasRole = await adapter.hasRole(FRIEND_MARKET_ROLE, wallet.address);
  const isActive = await adapter.isMembershipActive(wallet.address, FRIEND_MARKET_ROLE);
  const tier = await adapter.getUserTier(wallet.address, FRIEND_MARKET_ROLE);
  const stats = await adapter.getUsageStats(wallet.address, FRIEND_MARKET_ROLE);

  console.log("Has role:", hasRole);
  console.log("Membership active:", isActive);
  console.log("Tier:", tier);
  console.log("Markets created this month:", stats.monthlyMarketsCreated.toString());
  console.log("Active markets:", stats.activeMarketsCount.toString());

  if (!hasRole || !isActive) {
    console.error("Error: Membership required to create markets");
    process.exit(1);
  }

  // Calculate costs
  const stakeWei = ethers.parseEther(CONFIG.stakeAmount);
  const totalStake = stakeWei * BigInt(MATCHUPS.length);
  const estimatedGas = ethers.parseEther("0.1"); // Conservative estimate

  console.log("\n[3/4] Cost estimate:");
  console.log("  Stake per market:", CONFIG.stakeAmount, "ETC");
  console.log("  Number of markets:", MATCHUPS.length);
  console.log("  Total stake:", ethers.formatEther(totalStake), "ETC");
  console.log("  Estimated gas:", ethers.formatEther(estimatedGas), "ETC");
  console.log("  Total required:", ethers.formatEther(totalStake + estimatedGas), "ETC");

  if (balance < totalStake + estimatedGas) {
    console.error("Error: Insufficient balance");
    process.exit(1);
  }

  // Create markets
  console.log("\n[4/4] Creating markets...");
  const factory = new ethers.Contract(CONTRACTS.friendGroupMarketFactory, FACTORY_ABI, wallet);

  const tradingPeriod = CONFIG.tradingPeriodDays * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  const acceptanceDeadline = now + (CONFIG.acceptanceDeadlineDays * 24 * 60 * 60);

  const createdMarkets = [];

  for (let i = 0; i < MATCHUPS.length; i++) {
    const matchup = MATCHUPS[i];
    const description = `Will the ${matchup.home} beat the ${matchup.away} in the ${matchup.conference} Divisional Round?`;

    console.log(`\n  [${i + 1}/${MATCHUPS.length}] ${matchup.home} vs ${matchup.away}`);
    console.log(`  Description: ${description}`);

    try {
      const tx = await factory.createOneVsOneMarketPending(
        CONFIG.opponent,
        description,
        tradingPeriod,
        ethers.ZeroAddress, // no arbitrator
        acceptanceDeadline,
        stakeWei,
        ethers.ZeroAddress, // native ETC
        { value: stakeWei }
      );

      console.log("  Tx:", tx.hash);
      const receipt = await tx.wait();
      console.log("  Confirmed, gas used:", receipt.gasUsed.toString());

      // Get market ID
      const count = await factory.friendMarketCount();
      const marketId = count - 1n;
      console.log("  Market ID:", marketId.toString());

      createdMarkets.push({
        id: marketId.toString(),
        matchup: `${matchup.home} vs ${matchup.away}`,
        conference: matchup.conference,
        txHash: tx.hash,
      });
    } catch (err) {
      console.error("  Error:", err.message);
      break;
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log("\nCreated", createdMarkets.length, "markets:");

  for (const market of createdMarkets) {
    console.log(`  [${market.id}] ${market.conference}: ${market.matchup}`);
  }

  console.log("\nOpponent:", CONFIG.opponent);
  console.log("Stake per market:", CONFIG.stakeAmount, "ETC");
  console.log("Acceptance deadline:", new Date(acceptanceDeadline * 1000).toISOString());
  console.log("\nOpponent must accept each market with", CONFIG.stakeAmount, "ETC to activate.");

  // Final balance
  const finalBalance = await provider.getBalance(wallet.address);
  console.log("\nFinal balance:", ethers.formatEther(finalBalance), "ETC");
  console.log("Total spent:", ethers.formatEther(balance - finalBalance), "ETC");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
