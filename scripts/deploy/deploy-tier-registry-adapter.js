const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Deploy UsageTracker + TierRegistryAdapter and configure the complete bridge
 *
 * This deploys the missing UsageTracker and creates an adapter that allows
 * FriendGroupMarketFactory to work with the modular RBAC system
 * (TierRegistry + PaymentProcessor) without changes.
 *
 * Steps:
 * 1. Deploy UsageTracker (missing from modular system)
 * 2. Configure UsageTracker with TierRegistry
 * 3. Deploy TierRegistryAdapter
 * 4. Configure adapter with all modular system addresses
 * 5. Authorize adapter on UsageTracker
 * 6. Instructions to update FriendGroupMarketFactory
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deploy-tier-registry-adapter.js --network mordor
 */

// Deployed modular RBAC addresses (Mordor)
const CONTRACTS = {
  roleManagerCore: '0x888332df7621EC341131d85e2228f00407777dD7',
  tierRegistry: '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d',
  membershipManager: '0x6698C2ba129D18C1930e19C586f7Da6aB30b86D6',
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
  friendGroupMarketFactory: '0x8cFE477e267bB36925047df8A6E30348f82b0085',
};

// Role hashes for tier configuration
const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));
const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

async function main() {
  console.log("=".repeat(60));
  console.log("Deploy UsageTracker + TierRegistryAdapter");
  console.log("=".repeat(60));

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    console.error("No deployer available. Check PRIVATE_KEY in .env");
    process.exit(1);
  }
  console.log("\nDeployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETC");

  // ========== Step 1: Deploy UsageTracker ==========
  console.log("\n[1/6] Deploying UsageTracker...");

  const UsageTracker = await ethers.getContractFactory("UsageTracker");
  const usageTracker = await UsageTracker.deploy();
  await usageTracker.waitForDeployment();

  const usageTrackerAddress = await usageTracker.getAddress();
  console.log("UsageTracker deployed to:", usageTrackerAddress);

  // ========== Step 2: Configure UsageTracker ==========
  console.log("\n[2/6] Configuring UsageTracker...");

  let tx = await usageTracker.configureAll(
    CONTRACTS.roleManagerCore,
    CONTRACTS.tierRegistry
  );
  await tx.wait();
  console.log("UsageTracker configured with RoleManagerCore and TierRegistry");

  // ========== Step 3: Deploy TierRegistryAdapter ==========
  console.log("\n[3/6] Deploying TierRegistryAdapter...");

  const TierRegistryAdapter = await ethers.getContractFactory("TierRegistryAdapter");
  const adapter = await TierRegistryAdapter.deploy();
  await adapter.waitForDeployment();

  const adapterAddress = await adapter.getAddress();
  console.log("TierRegistryAdapter deployed to:", adapterAddress);

  // ========== Step 4: Configure TierRegistryAdapter ==========
  console.log("\n[4/6] Configuring TierRegistryAdapter...");

  tx = await adapter.configure(
    CONTRACTS.roleManagerCore,
    CONTRACTS.tierRegistry,
    CONTRACTS.membershipManager,
    usageTrackerAddress
  );
  await tx.wait();
  console.log("TierRegistryAdapter configured!");

  // ========== Step 5: Authorize adapter on UsageTracker ==========
  console.log("\n[5/6] Authorizing adapter on UsageTracker...");

  tx = await usageTracker.setAuthorizedExtension(adapterAddress, true);
  await tx.wait();
  console.log("TierRegistryAdapter authorized on UsageTracker!");

  // ========== Step 6: Instructions for FriendGroupMarketFactory ==========
  console.log("\n[6/6] Update FriendGroupMarketFactory...");

  // Check if we can update FriendGroupMarketFactory
  const factory = await ethers.getContractAt("FriendGroupMarketFactory", CONTRACTS.friendGroupMarketFactory);

  try {
    // Check if there's a setTieredRoleManager function
    const currentTRM = await factory.tieredRoleManager();
    console.log("Current tieredRoleManager:", currentTRM);
    console.log("New adapter address:", adapterAddress);

    // Try to update (will fail if not admin)
    console.log("\nAttempting to update FriendGroupMarketFactory...");
    tx = await factory.setTieredRoleManager(adapterAddress);
    await tx.wait();
    console.log("FriendGroupMarketFactory updated to use adapter!");
  } catch (err) {
    console.log("\nCould not update FriendGroupMarketFactory:", err.message);
    console.log("You may need to do this manually with admin privileges:");
    console.log(`  factory.setTieredRoleManager("${adapterAddress}")`);
  }

  // ========== Summary ==========
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log("UsageTracker:        ", usageTrackerAddress);
  console.log("TierRegistryAdapter: ", adapterAddress);
  console.log("\nModular RBAC System (existing):");
  console.log("  RoleManagerCore:   ", CONTRACTS.roleManagerCore);
  console.log("  TierRegistry:      ", CONTRACTS.tierRegistry);
  console.log("  MembershipManager: ", CONTRACTS.membershipManager);
  console.log("  PaymentProcessor:  ", CONTRACTS.paymentProcessor);
  console.log("\nFriendGroupMarketFactory:", CONTRACTS.friendGroupMarketFactory);
  console.log("\nNow users who purchase through PaymentProcessor can create friend markets!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
