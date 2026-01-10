const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Deploy MembershipPaymentManager NORMALLY (not via Safe Singleton Factory)
 *
 * This ensures the deployer gets admin roles, not the factory.
 *
 * Run with: npx hardhat run scripts/deploy-payment-manager-normal.js --network mordor
 */

// Existing contract addresses
const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const USC_ADDRESS = '0xDE093684c796204224BC081f937aa059D903c52a';

// Role hashes
const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));
const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));

async function main() {
  console.log("=".repeat(60));
  console.log("Deploy MembershipPaymentManager (Normal Deployment)");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("Treasury:", treasuryAddress);

  // ========== 1. Deploy MembershipPaymentManager normally ==========
  console.log("\n1. Deploying MembershipPaymentManager...");

  const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
  const paymentManager = await MembershipPaymentManager.deploy(treasuryAddress);
  await paymentManager.waitForDeployment();

  const paymentManagerAddress = await paymentManager.getAddress();
  console.log("   ✅ MembershipPaymentManager deployed at:", paymentManagerAddress);

  // Verify deployer has admin role
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const hasAdmin = await paymentManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
  console.log("   Deployer has DEFAULT_ADMIN_ROLE:", hasAdmin);

  if (!hasAdmin) {
    console.error("   ❌ Deployer doesn't have admin role! Something went wrong.");
    return;
  }

  // ========== 2. Configure PaymentProcessor ==========
  console.log("\n2. Configuring PaymentProcessor with new MembershipPaymentManager...");

  const paymentProcessor = await ethers.getContractAt("PaymentProcessor", PAYMENT_PROCESSOR);

  try {
    const tx = await paymentProcessor.setPaymentManager(paymentManagerAddress);
    await tx.wait();
    console.log("   ✅ PaymentProcessor.paymentManager set");
  } catch (error) {
    console.error("   ❌ Failed to set payment manager:", error.message);
    console.log("   You may not be the owner of PaymentProcessor");
  }

  // ========== 3. Add USC as payment token ==========
  console.log("\n3. Adding USC as payment token...");

  try {
    const tx = await paymentManager.addPaymentToken(USC_ADDRESS, "USC", 6);
    await tx.wait();
    console.log("   ✅ USC added as payment token");
  } catch (error) {
    console.error("   ❌ Failed to add USC:", error.message);
  }

  // ========== 4. Set role prices ==========
  console.log("\n4. Setting role prices...");

  const rolePrices = [
    { role: MARKET_MAKER_ROLE, name: "MARKET_MAKER_ROLE", price: "100" },
    { role: FRIEND_MARKET_ROLE, name: "FRIEND_MARKET_ROLE", price: "50" }
  ];

  for (const { role, name, price } of rolePrices) {
    try {
      const priceWei = ethers.parseUnits(price, 6);
      const tx = await paymentManager.setRolePrice(role, USC_ADDRESS, priceWei);
      await tx.wait();
      console.log(`   ✅ ${name} price set to ${price} USC`);
    } catch (error) {
      console.error(`   ❌ Failed to set ${name} price:`, error.message);
    }
  }

  // ========== 5. Verification ==========
  console.log("\n5. Verifying configuration...");

  const tokenInfo = await paymentManager.paymentTokens(USC_ADDRESS);
  console.log("   USC token active:", tokenInfo.isActive);

  const mmPrice = await paymentManager.getRolePrice(MARKET_MAKER_ROLE, USC_ADDRESS);
  const fmPrice = await paymentManager.getRolePrice(FRIEND_MARKET_ROLE, USC_ADDRESS);
  console.log("   MARKET_MAKER price:", ethers.formatUnits(mmPrice, 6), "USC");
  console.log("   FRIEND_MARKET price:", ethers.formatUnits(fmPrice, 6), "USC");

  const configuredManager = await paymentProcessor.paymentManager();
  console.log("   PaymentProcessor.paymentManager:", configuredManager);

  // ========== Summary ==========
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));
  console.log("\nMembershipPaymentManager:", paymentManagerAddress);
  console.log("\nUpdate frontend/src/config/contracts.js:");
  console.log(`  membershipPaymentManager: '${paymentManagerAddress}'`);

  if (tokenInfo.isActive && mmPrice > 0n && configuredManager === paymentManagerAddress) {
    console.log("\n✅ All configuration complete! Role purchases should now work.");
  } else {
    console.log("\n⚠️  Some configuration may be incomplete. Check output above.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
