const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Configure USC as payment token in MembershipPaymentManager
 *
 * Run with: npx hardhat run scripts/configure-usc-payment.js --network mordor
 */

// Contract addresses
const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const USC_ADDRESS = '0xDE093684c796204224BC081f937aa059D903c52a';

// Role hashes
const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));
const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));

async function main() {
  console.log("=".repeat(60));
  console.log("Configure USC Payment Token");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  // Get PaymentProcessor to find MembershipPaymentManager address
  console.log("\nQuerying PaymentProcessor for paymentManager address...");
  const paymentProcessor = await ethers.getContractAt("PaymentProcessor", PAYMENT_PROCESSOR);

  const paymentManagerAddress = await paymentProcessor.paymentManager();
  console.log("MembershipPaymentManager address:", paymentManagerAddress);

  if (paymentManagerAddress === ethers.ZeroAddress) {
    console.error("\n❌ PaymentProcessor.paymentManager is not set!");
    console.log("Run: npx hardhat run scripts/configure-payment-manager.js --network mordor");
    return;
  }

  // Get MembershipPaymentManager contract
  const paymentManager = await ethers.getContractAt("MembershipPaymentManager", paymentManagerAddress);

  // Check current state
  console.log("\nChecking current configuration...");

  const paymentToken = await paymentManager.paymentTokens(USC_ADDRESS);
  console.log("USC payment token status:", {
    tokenAddress: paymentToken.tokenAddress,
    isActive: paymentToken.isActive,
    decimals: paymentToken.decimals,
    symbol: paymentToken.symbol
  });

  // Add USC as payment token if not already added
  if (paymentToken.tokenAddress === ethers.ZeroAddress) {
    console.log("\nAdding USC as payment token...");
    try {
      const tx = await paymentManager.addPaymentToken(USC_ADDRESS, "USC", 6);
      await tx.wait();
      console.log("✅ USC added as payment token");
    } catch (error) {
      console.error("❌ Failed to add USC:", error.message);
    }
  } else if (!paymentToken.isActive) {
    console.log("\nUSC token exists but not active, activating...");
    try {
      const tx = await paymentManager.setPaymentTokenActive(USC_ADDRESS, true);
      await tx.wait();
      console.log("✅ USC payment token activated");
    } catch (error) {
      console.error("❌ Failed to activate USC:", error.message);
    }
  } else {
    console.log("✅ USC already configured and active");
  }

  // Check role prices
  console.log("\nChecking role prices...");
  const marketMakerPrice = await paymentManager.getRolePrice(MARKET_MAKER_ROLE, USC_ADDRESS);
  const friendMarketPrice = await paymentManager.getRolePrice(FRIEND_MARKET_ROLE, USC_ADDRESS);

  console.log("MARKET_MAKER_ROLE price:", ethers.formatUnits(marketMakerPrice, 6), "USC");
  console.log("FRIEND_MARKET_ROLE price:", ethers.formatUnits(friendMarketPrice, 6), "USC");

  // Set role prices if not set
  if (marketMakerPrice === 0n) {
    console.log("\nSetting MARKET_MAKER_ROLE price...");
    try {
      const price = ethers.parseUnits("100", 6);
      const tx = await paymentManager.setRolePrice(MARKET_MAKER_ROLE, USC_ADDRESS, price);
      await tx.wait();
      console.log("✅ MARKET_MAKER_ROLE price set to 100 USC");
    } catch (error) {
      console.error("❌ Failed to set MARKET_MAKER_ROLE price:", error.message);
    }
  }

  if (friendMarketPrice === 0n) {
    console.log("\nSetting FRIEND_MARKET_ROLE price...");
    try {
      const price = ethers.parseUnits("50", 6);
      const tx = await paymentManager.setRolePrice(FRIEND_MARKET_ROLE, USC_ADDRESS, price);
      await tx.wait();
      console.log("✅ FRIEND_MARKET_ROLE price set to 50 USC");
    } catch (error) {
      console.error("❌ Failed to set FRIEND_MARKET_ROLE price:", error.message);
    }
  }

  // Final verification
  console.log("\n" + "=".repeat(60));
  console.log("Final Verification");
  console.log("=".repeat(60));

  const finalToken = await paymentManager.paymentTokens(USC_ADDRESS);
  const finalMarketMakerPrice = await paymentManager.getRolePrice(MARKET_MAKER_ROLE, USC_ADDRESS);
  const finalFriendMarketPrice = await paymentManager.getRolePrice(FRIEND_MARKET_ROLE, USC_ADDRESS);

  console.log("\nUSC payment token:");
  console.log("  Address:", finalToken.tokenAddress);
  console.log("  Active:", finalToken.isActive);
  console.log("  Symbol:", finalToken.symbol);
  console.log("  Decimals:", finalToken.decimals);

  console.log("\nRole prices:");
  console.log("  MARKET_MAKER_ROLE:", ethers.formatUnits(finalMarketMakerPrice, 6), "USC");
  console.log("  FRIEND_MARKET_ROLE:", ethers.formatUnits(finalFriendMarketPrice, 6), "USC");

  if (finalToken.isActive && finalMarketMakerPrice > 0n) {
    console.log("\n✅ Configuration complete! Role purchases should now work.");
  } else {
    console.log("\n⚠️  Configuration may be incomplete. Check errors above.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
