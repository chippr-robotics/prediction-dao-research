const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Configure the chain's stablecoin (USDC on Polygon Amoy) as payment token in
 * MembershipPaymentManager.
 *
 * Run with: npx hardhat run scripts/admin/configure-stablecoin-payment.js --network amoy
 *
 * Required env vars:
 *   PAYMENT_PROCESSOR_ADDRESS  PaymentProcessor address
 *   STABLECOIN_ADDRESS         Stablecoin (USDC) address for the network
 *   STABLECOIN_SYMBOL          Optional symbol used in addPaymentToken call (default: USDC)
 *   STABLECOIN_DECIMALS        Optional decimals (default: 6)
 */

const PAYMENT_PROCESSOR = process.env.PAYMENT_PROCESSOR_ADDRESS;
const STABLECOIN_ADDRESS = process.env.STABLECOIN_ADDRESS;
const STABLECOIN_SYMBOL = process.env.STABLECOIN_SYMBOL || "USDC";
const STABLECOIN_DECIMALS = Number(process.env.STABLECOIN_DECIMALS || 6);

const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE"));
const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));

async function main() {
  if (!PAYMENT_PROCESSOR || !STABLECOIN_ADDRESS) {
    throw new Error(
      "Set PAYMENT_PROCESSOR_ADDRESS and STABLECOIN_ADDRESS in the env before running."
    );
  }

  console.log("=".repeat(60));
  console.log(`Configure ${STABLECOIN_SYMBOL} Payment Token`);
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  console.log("\nQuerying PaymentProcessor for paymentManager address...");
  const paymentProcessor = await ethers.getContractAt("PaymentProcessor", PAYMENT_PROCESSOR);

  const paymentManagerAddress = await paymentProcessor.paymentManager();
  console.log("MembershipPaymentManager address:", paymentManagerAddress);

  if (paymentManagerAddress === ethers.ZeroAddress) {
    console.error("\n❌ PaymentProcessor.paymentManager is not set!");
    console.log("Run: npx hardhat run scripts/admin/configure-payment-manager.js --network amoy");
    return;
  }

  const paymentManager = await ethers.getContractAt("MembershipPaymentManager", paymentManagerAddress);

  console.log("\nChecking current configuration...");

  const paymentToken = await paymentManager.paymentTokens(STABLECOIN_ADDRESS);
  console.log(`${STABLECOIN_SYMBOL} payment token status:`, {
    tokenAddress: paymentToken.tokenAddress,
    isActive: paymentToken.isActive,
    decimals: paymentToken.decimals,
    symbol: paymentToken.symbol,
  });

  if (paymentToken.tokenAddress === ethers.ZeroAddress) {
    console.log(`\nAdding ${STABLECOIN_SYMBOL} as payment token...`);
    try {
      const tx = await paymentManager.addPaymentToken(STABLECOIN_ADDRESS, STABLECOIN_SYMBOL, STABLECOIN_DECIMALS);
      await tx.wait();
      console.log(`✅ ${STABLECOIN_SYMBOL} added as payment token`);
    } catch (error) {
      console.error(`❌ Failed to add ${STABLECOIN_SYMBOL}:`, error.message);
    }
  } else if (!paymentToken.isActive) {
    console.log(`\n${STABLECOIN_SYMBOL} token exists but not active, activating...`);
    try {
      const tx = await paymentManager.setPaymentTokenActive(STABLECOIN_ADDRESS, true);
      await tx.wait();
      console.log(`✅ ${STABLECOIN_SYMBOL} payment token activated`);
    } catch (error) {
      console.error(`❌ Failed to activate ${STABLECOIN_SYMBOL}:`, error.message);
    }
  } else {
    console.log(`✅ ${STABLECOIN_SYMBOL} already configured and active`);
  }

  console.log("\nChecking role prices...");
  const marketMakerPrice = await paymentManager.getRolePrice(MARKET_MAKER_ROLE, STABLECOIN_ADDRESS);
  const friendMarketPrice = await paymentManager.getRolePrice(FRIEND_MARKET_ROLE, STABLECOIN_ADDRESS);

  console.log("MARKET_MAKER_ROLE price:", ethers.formatUnits(marketMakerPrice, STABLECOIN_DECIMALS), STABLECOIN_SYMBOL);
  console.log("FRIEND_MARKET_ROLE price:", ethers.formatUnits(friendMarketPrice, STABLECOIN_DECIMALS), STABLECOIN_SYMBOL);

  if (marketMakerPrice === 0n) {
    console.log("\nSetting MARKET_MAKER_ROLE price...");
    try {
      const price = ethers.parseUnits("100", STABLECOIN_DECIMALS);
      const tx = await paymentManager.setRolePrice(MARKET_MAKER_ROLE, STABLECOIN_ADDRESS, price);
      await tx.wait();
      console.log(`✅ MARKET_MAKER_ROLE price set to 100 ${STABLECOIN_SYMBOL}`);
    } catch (error) {
      console.error("❌ Failed to set MARKET_MAKER_ROLE price:", error.message);
    }
  }

  if (friendMarketPrice === 0n) {
    console.log("\nSetting FRIEND_MARKET_ROLE price...");
    try {
      const price = ethers.parseUnits("50", STABLECOIN_DECIMALS);
      const tx = await paymentManager.setRolePrice(FRIEND_MARKET_ROLE, STABLECOIN_ADDRESS, price);
      await tx.wait();
      console.log(`✅ FRIEND_MARKET_ROLE price set to 50 ${STABLECOIN_SYMBOL}`);
    } catch (error) {
      console.error("❌ Failed to set FRIEND_MARKET_ROLE price:", error.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Final Verification");
  console.log("=".repeat(60));

  const finalToken = await paymentManager.paymentTokens(STABLECOIN_ADDRESS);
  const finalMarketMakerPrice = await paymentManager.getRolePrice(MARKET_MAKER_ROLE, STABLECOIN_ADDRESS);
  const finalFriendMarketPrice = await paymentManager.getRolePrice(FRIEND_MARKET_ROLE, STABLECOIN_ADDRESS);

  console.log(`\n${STABLECOIN_SYMBOL} payment token:`);
  console.log("  Address:", finalToken.tokenAddress);
  console.log("  Active:", finalToken.isActive);
  console.log("  Symbol:", finalToken.symbol);
  console.log("  Decimals:", finalToken.decimals);

  console.log("\nRole prices:");
  console.log("  MARKET_MAKER_ROLE:", ethers.formatUnits(finalMarketMakerPrice, STABLECOIN_DECIMALS), STABLECOIN_SYMBOL);
  console.log("  FRIEND_MARKET_ROLE:", ethers.formatUnits(finalFriendMarketPrice, STABLECOIN_DECIMALS), STABLECOIN_SYMBOL);

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
