#!/usr/bin/env node
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadMnemonicFromFloppy, keystoreExists, CONFIG } = require("./floppy-key/loader");

/**
 * Create a 1v1 Friend Market Bet using the floppy wallet
 *
 * This creates a simple 1v1 bet between two addresses using the
 * FriendGroupMarketFactory on Mordor testnet.
 *
 * Requirements:
 * - Floppy disk mounted
 * - FLOPPY_PASSWORD env var set
 * - Floppy wallet has BRONZE tier FRIEND_MARKET_ROLE via TierRegistry
 *
 * Usage:
 *   export FLOPPY_PASSWORD=your_password
 *   npx hardhat run scripts/operations/create-friend-market-bet.js --network mordor
 */

// Contract addresses on Mordor
const CONTRACTS = {
  friendGroupMarketFactory: "0x8cFE477e267bB36925047df8A6E30348f82b0085",
  tierRegistryAdapter: "0x8e3A4C65a6C22d88515FD356cB00732adac4f4d7",
  tierRegistry: "0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d",
  roleManagerCore: "0x888332df7621EC341131d85e2228f00407777dD7",
};

// Bet parameters (customize these)
const BET_CONFIG = {
  opponent: "0x52502d049571C7893447b86c4d8B38e6184bF6e1", // Use deployer as opponent for test
  description: "Will ETC price be above $30 by end of January 2026?",
  tradingPeriodDays: 14, // 14 day trading period
  arbitrator: ethers.ZeroAddress, // No arbitrator (creator can resolve)
  peggedPublicMarketId: 0, // Not pegged to any public market
  liquidityETC: "0.01", // 0.01 ETC liquidity
};

// Minimal ABIs
const FRIEND_GROUP_MARKET_FACTORY_ABI = [
  "function createOneVsOneMarket(address opponent, string memory description, uint256 tradingPeriod, address arbitrator, uint256 peggedPublicMarketId) external payable returns (uint256 friendMarketId)",
  "function getFriendMarket(uint256 friendMarketId) external view returns (uint256 marketId, uint8 marketType, address creator, address[] memory members, address arbitrator, uint256 memberLimit, uint256 creationFee, uint256 createdAt, bool active, string memory description, uint256 peggedPublicMarketId, bool autoPegged, address paymentToken, uint256 liquidityAmount)",
  "function friendMarketCount() external view returns (uint256)",
  "function tieredRoleManager() external view returns (address)",
];

const TIER_REGISTRY_ADAPTER_ABI = [
  "function FRIEND_MARKET_ROLE() external view returns (bytes32)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function isMembershipActive(address user, bytes32 role) external view returns (bool)",
  "function getUserTier(address user, bytes32 role) external view returns (uint8)",
  "function getUsageStats(address user, bytes32 role) external view returns (tuple(uint256 dailyBetsCount, uint256 weeklyBetsCount, uint256 monthlyMarketsCreated, uint256 dailyWithdrawals, uint256 activeMarketsCount, uint256 lastDailyReset, uint256 lastWeeklyReset, uint256 lastMonthlyReset))",
];

const TIER_REGISTRY_ABI = [
  "function getUserTier(address user, bytes32 role) external view returns (uint8)",
  "function getTierLimits(bytes32 role, uint8 tier) external view returns (tuple(uint256 dailyBetLimit, uint256 weeklyBetLimit, uint256 monthlyMarketCreation, uint256 maxPositionSize, uint256 withdrawalLimit, uint256 maxConcurrentMarkets, bool canCreatePrivateMarkets, bool canUseAdvancedFeatures, uint256 feeDiscount))",
];

const MembershipTier = {
  NONE: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
};

function tierName(tier) {
  return Object.keys(MembershipTier).find(
    (key) => MembershipTier[key] === tier
  );
}

async function main() {
  console.log("=".repeat(60));
  console.log("Create Friend Market Bet");
  console.log("=".repeat(60));

  // ========== Step 1: Load Floppy Wallet ==========
  console.log("\n[1/6] Loading floppy wallet...");

  // Check FLOPPY_KEYSTORE_PASSWORD (used by loader)
  if (!process.env.FLOPPY_KEYSTORE_PASSWORD) {
    console.error("Error: FLOPPY_KEYSTORE_PASSWORD environment variable not set");
    process.exit(1);
  }

  const keystorePath = path.join(
    CONFIG.MOUNT_POINT,
    CONFIG.KEYSTORE_DIR,
    CONFIG.KEYSTORE_FILENAME
  );
  if (!fs.existsSync(keystorePath)) {
    console.error(
      `Error: Keystore not found at ${keystorePath}. Is floppy mounted?`
    );
    process.exit(1);
  }

  const mnemonic = await loadMnemonicFromFloppy();
  const provider = ethers.provider;
  const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
  const wallet = hdWallet.connect(provider);

  console.log("Wallet address:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETC");

  const liquidityWei = ethers.parseEther(BET_CONFIG.liquidityETC);
  if (balance < liquidityWei + ethers.parseEther("0.01")) {
    console.error("Insufficient balance for liquidity + gas");
    process.exit(1);
  }

  // ========== Step 2: Check Membership Status ==========
  console.log("\n[2/6] Checking membership status...");

  const adapter = new ethers.Contract(
    CONTRACTS.tierRegistryAdapter,
    TIER_REGISTRY_ADAPTER_ABI,
    wallet
  );

  const tierRegistry = new ethers.Contract(
    CONTRACTS.tierRegistry,
    TIER_REGISTRY_ABI,
    wallet
  );

  const FRIEND_MARKET_ROLE = await adapter.FRIEND_MARKET_ROLE();
  console.log("FRIEND_MARKET_ROLE:", FRIEND_MARKET_ROLE);

  // Check role
  const hasRole = await adapter.hasRole(FRIEND_MARKET_ROLE, wallet.address);
  console.log("Has role:", hasRole);

  // Check tier
  const tier = await adapter.getUserTier(wallet.address, FRIEND_MARKET_ROLE);
  console.log("Tier:", tierName(tier), `(${tier})`);

  // Check membership active
  const isActive = await adapter.isMembershipActive(
    wallet.address,
    FRIEND_MARKET_ROLE
  );
  console.log("Membership active:", isActive);

  if (!hasRole || tier === MembershipTier.NONE) {
    console.error(
      "Error: Wallet does not have FRIEND_MARKET_ROLE membership"
    );
    console.error(
      "Run scripts/operations/purchase-friend-market-membership.js first"
    );
    process.exit(1);
  }

  if (!isActive) {
    console.error("Error: Membership has expired");
    process.exit(1);
  }

  // Check usage stats
  const usageStats = await adapter.getUsageStats(
    wallet.address,
    FRIEND_MARKET_ROLE
  );
  console.log("\nUsage stats:");
  console.log("  Monthly markets created:", usageStats.monthlyMarketsCreated.toString());
  console.log("  Active markets:", usageStats.activeMarketsCount.toString());

  // Get tier limits
  const limits = await tierRegistry.getTierLimits(FRIEND_MARKET_ROLE, tier);
  console.log("\nTier limits:");
  console.log("  Monthly market creation:", limits.monthlyMarketCreation.toString());
  console.log("  Max concurrent markets:", limits.maxConcurrentMarkets.toString());

  // ========== Step 3: Verify FriendGroupMarketFactory ==========
  console.log("\n[3/6] Verifying FriendGroupMarketFactory configuration...");

  const factory = new ethers.Contract(
    CONTRACTS.friendGroupMarketFactory,
    FRIEND_GROUP_MARKET_FACTORY_ABI,
    wallet
  );

  const currentTRM = await factory.tieredRoleManager();
  console.log("Factory tieredRoleManager:", currentTRM);
  console.log("Expected adapter:", CONTRACTS.tierRegistryAdapter);

  if (currentTRM.toLowerCase() !== CONTRACTS.tierRegistryAdapter.toLowerCase()) {
    console.error(
      "Warning: Factory is not using the adapter. This may fail."
    );
  }

  const marketCountBefore = await factory.friendMarketCount();
  console.log("Current friend market count:", marketCountBefore.toString());

  // ========== Step 4: Prepare Bet Parameters ==========
  console.log("\n[4/6] Preparing bet parameters...");

  const tradingPeriodSeconds = BET_CONFIG.tradingPeriodDays * 24 * 60 * 60;

  console.log("Opponent:", BET_CONFIG.opponent);
  console.log("Description:", BET_CONFIG.description);
  console.log("Trading period:", BET_CONFIG.tradingPeriodDays, "days");
  console.log("Arbitrator:", BET_CONFIG.arbitrator || "None (creator resolves)");
  console.log("Liquidity:", BET_CONFIG.liquidityETC, "ETC");

  // ========== Step 5: Create Friend Market ==========
  console.log("\n[5/6] Creating friend market bet...");

  try {
    const tx = await factory.createOneVsOneMarket(
      BET_CONFIG.opponent,
      BET_CONFIG.description,
      tradingPeriodSeconds,
      BET_CONFIG.arbitrator,
      BET_CONFIG.peggedPublicMarketId,
      { value: liquidityWei }
    );

    console.log("Transaction submitted:", tx.hash);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());

    // Find the FriendMarketCreated event
    const friendMarketCreatedTopic = ethers.id(
      "FriendMarketCreated(uint256,uint256,uint8,address,uint256,uint256,address)"
    );
    const createdEvent = receipt.logs.find(
      (log) => log.topics[0] === friendMarketCreatedTopic
    );

    if (createdEvent) {
      const friendMarketId = ethers.toBigInt(createdEvent.topics[1]);
      const underlyingMarketId = ethers.toBigInt(createdEvent.topics[2]);
      console.log("\nFriend Market Created!");
      console.log("  Friend Market ID:", friendMarketId.toString());
      console.log("  Underlying Market ID:", underlyingMarketId.toString());
    }

    // ========== Step 6: Verify Market Creation ==========
    console.log("\n[6/6] Verifying market creation...");

    const marketCountAfter = await factory.friendMarketCount();
    console.log("New friend market count:", marketCountAfter.toString());

    if (marketCountAfter > marketCountBefore) {
      const newMarketId = marketCountAfter - BigInt(1);
      const marketInfo = await factory.getFriendMarket(newMarketId);

      console.log("\nMarket details:");
      console.log("  ID:", newMarketId.toString());
      console.log("  Underlying market ID:", marketInfo.marketId.toString());
      console.log("  Creator:", marketInfo.creator);
      console.log("  Members:", marketInfo.members.join(", "));
      console.log("  Active:", marketInfo.active);
      console.log("  Description:", marketInfo.description);
      console.log(
        "  Liquidity:",
        ethers.formatEther(marketInfo.liquidityAmount),
        "ETC"
      );
    }

    // Check updated usage stats
    const newUsageStats = await adapter.getUsageStats(
      wallet.address,
      FRIEND_MARKET_ROLE
    );
    console.log("\nUpdated usage stats:");
    console.log("  Monthly markets created:", newUsageStats.monthlyMarketsCreated.toString());
    console.log("  Active markets:", newUsageStats.activeMarketsCount.toString());

    console.log("\n" + "=".repeat(60));
    console.log("Friend market bet created successfully!");
    console.log("=".repeat(60));
  } catch (err) {
    console.error("\nFailed to create friend market:", err.message);

    // Parse custom errors
    if (err.data) {
      const errorSelectors = {
        "0x8e4a23d6": "MembershipRequired",
        "0x4a3f8c53": "MembershipExpired",
        "0x3b2f48c2": "MarketLimitReached",
      };
      const selector = err.data.slice(0, 10);
      if (errorSelectors[selector]) {
        console.error("Error type:", errorSelectors[selector]);
      }
    }

    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
