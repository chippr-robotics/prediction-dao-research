const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Deploy TierRegistry and MembershipPaymentManager NORMALLY (not via factory)
 * and configure all components for role purchases.
 *
 * This is a comprehensive fix for the modular RBAC payment system.
 *
 * Run with: npx hardhat run scripts/deploy-modular-rbac-fix.js --network mordor
 */

// Existing contract addresses (from previous deployment)
const EXISTING = {
  roleManagerCore: '0x888332df7621EC341131d85e2228f00407777dD7',
  paymentProcessor: '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63',
  membershipManager: '0x5fbc6c64CAF5EA21090b50e0E4bb07ADdA0eB661',
};

const USC_ADDRESS = '0xDE093684c796204224BC081f937aa059D903c52a';

// Role hashes
const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));
const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));

// Membership tiers
const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

async function main() {
  console.log("=".repeat(70));
  console.log("Deploy Modular RBAC Fix - TierRegistry & MembershipPaymentManager");
  console.log("=".repeat(70));

  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("Treasury:", treasuryAddress);

  // ========== 1. Deploy TierRegistry normally ==========
  console.log("\n" + "=".repeat(50));
  console.log("1. Deploying TierRegistry (normal deployment)...");
  console.log("=".repeat(50));

  const TierRegistry = await ethers.getContractFactory("TierRegistry");
  const tierRegistry = await TierRegistry.deploy();
  await tierRegistry.waitForDeployment();

  const tierRegistryAddress = await tierRegistry.getAddress();
  console.log("   ✅ TierRegistry deployed at:", tierRegistryAddress);

  // Verify owner
  const tierRegistryOwner = await tierRegistry.owner();
  console.log("   Owner:", tierRegistryOwner);
  console.log("   Deployer is owner:", tierRegistryOwner === deployer.address);

  // ========== 2. Deploy MembershipPaymentManager normally ==========
  console.log("\n" + "=".repeat(50));
  console.log("2. Deploying MembershipPaymentManager (normal deployment)...");
  console.log("=".repeat(50));

  const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
  const paymentManager = await MembershipPaymentManager.deploy(treasuryAddress);
  await paymentManager.waitForDeployment();

  const paymentManagerAddress = await paymentManager.getAddress();
  console.log("   ✅ MembershipPaymentManager deployed at:", paymentManagerAddress);

  // ========== 3. Configure TierRegistry ==========
  console.log("\n" + "=".repeat(50));
  console.log("3. Configuring TierRegistry...");
  console.log("=".repeat(50));

  // Set RoleManagerCore
  console.log("   Setting roleManagerCore...");
  let tx = await tierRegistry.setRoleManagerCore(EXISTING.roleManagerCore);
  await tx.wait();
  console.log("   ✅ roleManagerCore set");

  // Authorize PaymentProcessor as extension
  console.log("   Authorizing PaymentProcessor as extension...");
  tx = await tierRegistry.setAuthorizedExtension(EXISTING.paymentProcessor, true);
  await tx.wait();
  console.log("   ✅ PaymentProcessor authorized");

  // Configure tier metadata
  const defaultLimits = {
    dailyBetLimit: ethers.parseUnits("10000", 6),
    weeklyBetLimit: ethers.parseUnits("50000", 6),
    monthlyMarketCreation: 10,
    maxPositionSize: ethers.parseUnits("5000", 6),
    maxConcurrentMarkets: 5,
    withdrawalLimit: ethers.parseUnits("10000", 6),
    canCreatePrivateMarkets: true,
    canUseAdvancedFeatures: false,
    feeDiscount: 0
  };

  console.log("   Setting MARKET_MAKER tier 1 (BRONZE)...");
  tx = await tierRegistry.setTierMetadata(
    MARKET_MAKER_ROLE,
    MembershipTier.BRONZE,
    "Basic Market Maker",
    "Basic market creation access",
    ethers.parseUnits("100", 6),
    defaultLimits,
    true
  );
  await tx.wait();
  console.log("   ✅ MARKET_MAKER tier 1 configured");

  console.log("   Setting FRIEND_MARKET tier 1 (BRONZE)...");
  tx = await tierRegistry.setTierMetadata(
    FRIEND_MARKET_ROLE,
    MembershipTier.BRONZE,
    "Basic Friend Access",
    "Access to friend markets",
    ethers.parseUnits("50", 6),
    { ...defaultLimits, monthlyMarketCreation: 0, maxConcurrentMarkets: 0 },
    true
  );
  await tx.wait();
  console.log("   ✅ FRIEND_MARKET tier 1 configured");

  // ========== 4. Configure MembershipPaymentManager ==========
  console.log("\n" + "=".repeat(50));
  console.log("4. Configuring MembershipPaymentManager...");
  console.log("=".repeat(50));

  // Add USC as payment token
  console.log("   Adding USC as payment token...");
  tx = await paymentManager.addPaymentToken(USC_ADDRESS, "USC", 6);
  await tx.wait();
  console.log("   ✅ USC added");

  // Set role prices
  console.log("   Setting MARKET_MAKER_ROLE price to 100 USC...");
  tx = await paymentManager.setRolePrice(MARKET_MAKER_ROLE, USC_ADDRESS, ethers.parseUnits("100", 6));
  await tx.wait();
  console.log("   ✅ MARKET_MAKER_ROLE price set");

  console.log("   Setting FRIEND_MARKET_ROLE price to 50 USC...");
  tx = await paymentManager.setRolePrice(FRIEND_MARKET_ROLE, USC_ADDRESS, ethers.parseUnits("50", 6));
  await tx.wait();
  console.log("   ✅ FRIEND_MARKET_ROLE price set");

  // ========== 5. Configure PaymentProcessor ==========
  console.log("\n" + "=".repeat(50));
  console.log("5. Configuring PaymentProcessor...");
  console.log("=".repeat(50));

  const paymentProcessor = await ethers.getContractAt("PaymentProcessor", EXISTING.paymentProcessor);

  console.log("   Updating PaymentProcessor configuration...");
  tx = await paymentProcessor.configureAll(
    EXISTING.roleManagerCore,
    tierRegistryAddress,
    EXISTING.membershipManager,
    paymentManagerAddress
  );
  await tx.wait();
  console.log("   ✅ PaymentProcessor configured");

  // ========== 6. Verification ==========
  console.log("\n" + "=".repeat(50));
  console.log("6. Verification...");
  console.log("=".repeat(50));

  const configuredTierRegistry = await paymentProcessor.tierRegistry();
  const configuredPaymentManager = await paymentProcessor.paymentManager();
  const tier1Active = await tierRegistry.isTierActive(MARKET_MAKER_ROLE, MembershipTier.BRONZE);
  const uscActive = await paymentManager.paymentTokens(USC_ADDRESS);
  const mmPrice = await paymentManager.getRolePrice(MARKET_MAKER_ROLE, USC_ADDRESS);
  const ppAuthorized = await tierRegistry.authorizedExtensions(EXISTING.paymentProcessor);

  console.log("   PaymentProcessor.tierRegistry:", configuredTierRegistry);
  console.log("   PaymentProcessor.paymentManager:", configuredPaymentManager);
  console.log("   TierRegistry MARKET_MAKER tier 1 active:", tier1Active);
  console.log("   MembershipPaymentManager USC active:", uscActive.isActive);
  console.log("   MembershipPaymentManager MARKET_MAKER price:", ethers.formatUnits(mmPrice, 6), "USC");
  console.log("   TierRegistry PaymentProcessor authorized:", ppAuthorized);

  // ========== Summary ==========
  console.log("\n" + "=".repeat(70));
  console.log("DEPLOYMENT COMPLETE!");
  console.log("=".repeat(70));

  console.log("\nDeployed Contracts:");
  console.log("  TierRegistry:              ", tierRegistryAddress);
  console.log("  MembershipPaymentManager:  ", paymentManagerAddress);

  console.log("\nExisting Contracts:");
  console.log("  RoleManagerCore:           ", EXISTING.roleManagerCore);
  console.log("  PaymentProcessor:          ", EXISTING.paymentProcessor);
  console.log("  MembershipManager:         ", EXISTING.membershipManager);

  console.log("\n" + "-".repeat(70));
  console.log("Update frontend/src/config/contracts.js with:");
  console.log("-".repeat(70));
  console.log(`  tierRegistry: '${tierRegistryAddress}',`);
  console.log(`  membershipPaymentManager: '${paymentManagerAddress}'`);

  const allGood = tier1Active && uscActive.isActive && mmPrice > 0n && ppAuthorized;
  if (allGood) {
    console.log("\n✅ All configuration verified! Role purchases should now work.");
  } else {
    console.log("\n⚠️  Some configuration may be incomplete. Check verification output above.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
