#!/usr/bin/env node
/**
 * verify-market-maker-role.js
 *
 * Verifies and fixes the MARKET_MAKER_ROLE configuration for FriendGroupMarketFactory.
 *
 * Usage:
 *   npx hardhat run scripts/admin/verify-market-maker-role.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("=" .repeat(60));
  console.log("Verify and Fix MARKET_MAKER_ROLE Configuration");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  // Contract addresses from current deployment
  const ADDRESSES = {
    tieredRoleManager: "0x55e6346Be542B13462De504FCC379a2477D227f0",
    marketFactory: "0x75e81ba01f3aBC160381f3b2b3c59acB2E1800F7",
    friendGroupMarketFactory: "0x0E118DEf0946f0e7F1BEAAA385c6c37CAc6acfa7",
  };

  // Role hashes (keccak256 of role names)
  const MARKET_MAKER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER"));

  console.log("\n--- Contract Addresses ---");
  console.log("TieredRoleManager:", ADDRESSES.tieredRoleManager);
  console.log("MarketFactory:", ADDRESSES.marketFactory);
  console.log("FriendGroupMarketFactory:", ADDRESSES.friendGroupMarketFactory);
  console.log("\nMARKET_MAKER_ROLE hash:", MARKET_MAKER_ROLE);

  // Load contracts
  const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
  const tieredRoleManager = TieredRoleManager.attach(ADDRESSES.tieredRoleManager);

  const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
  const marketFactory = ConditionalMarketFactory.attach(ADDRESSES.marketFactory);

  // Step 1: Check MarketFactory's roleManager setting
  console.log("\n\n--- Step 1: Check MarketFactory's roleManager ---");
  try {
    const currentRoleManager = await marketFactory.roleManager();
    console.log("MarketFactory.roleManager():", currentRoleManager);

    if (currentRoleManager === ethers.ZeroAddress) {
      console.log("⚠️  roleManager is not set! Attempting to set...");
      const tx = await marketFactory.setRoleManager(ADDRESSES.tieredRoleManager);
      await tx.wait();
      console.log("✓ roleManager set to TieredRoleManager");
    } else if (currentRoleManager.toLowerCase() !== ADDRESSES.tieredRoleManager.toLowerCase()) {
      console.log("⚠️  roleManager points to a different address!");
      console.log("   Current:", currentRoleManager);
      console.log("   Expected:", ADDRESSES.tieredRoleManager);
      // Optionally update (uncomment if needed)
      // const tx = await marketFactory.setRoleManager(ADDRESSES.tieredRoleManager);
      // await tx.wait();
    } else {
      console.log("✓ roleManager is correctly set to TieredRoleManager");
    }
  } catch (error) {
    console.error("Error checking roleManager:", error.message);
  }

  // Step 2: Check MarketFactory owner
  console.log("\n\n--- Step 2: Check MarketFactory owner ---");
  try {
    const owner = await marketFactory.owner();
    console.log("MarketFactory.owner():", owner);
    console.log("Is signer the owner?", owner.toLowerCase() === signer.address.toLowerCase() ? "YES" : "NO");
    console.log("Is FriendGroupMarketFactory the owner?",
      owner.toLowerCase() === ADDRESSES.friendGroupMarketFactory.toLowerCase() ? "YES" : "NO");
  } catch (error) {
    console.error("Error checking owner:", error.message);
  }

  // Step 3: Check if FriendGroupMarketFactory has MARKET_MAKER_ROLE
  console.log("\n\n--- Step 3: Check MARKET_MAKER_ROLE for FriendGroupMarketFactory ---");
  try {
    const hasRole = await tieredRoleManager.hasRole(MARKET_MAKER_ROLE, ADDRESSES.friendGroupMarketFactory);
    console.log("TieredRoleManager.hasRole(MARKET_MAKER_ROLE, FriendGroupMarketFactory):", hasRole);

    if (hasRole) {
      // Also check if membership is active
      const isActive = await tieredRoleManager.isMembershipActive(ADDRESSES.friendGroupMarketFactory, MARKET_MAKER_ROLE);
      console.log("isMembershipActive:", isActive);

      if (!isActive) {
        console.log("⚠️  Role exists but membership is not active!");
      } else {
        console.log("✓ FriendGroupMarketFactory has active MARKET_MAKER_ROLE");
      }
    } else {
      console.log("⚠️  FriendGroupMarketFactory does NOT have MARKET_MAKER_ROLE");
      console.log("\nAttempting to grant PLATINUM tier for 100 years...");

      const PLATINUM = 4; // MembershipTier.PLATINUM
      const DURATION_DAYS = 36500; // 100 years

      try {
        const tx = await tieredRoleManager.grantTier(
          ADDRESSES.friendGroupMarketFactory,
          MARKET_MAKER_ROLE,
          PLATINUM,
          DURATION_DAYS
        );
        console.log("Transaction sent:", tx.hash);
        await tx.wait();
        console.log("✓ MARKET_MAKER_ROLE granted to FriendGroupMarketFactory");

        // Verify
        const verifyHasRole = await tieredRoleManager.hasRole(MARKET_MAKER_ROLE, ADDRESSES.friendGroupMarketFactory);
        console.log("Verification - hasRole:", verifyHasRole);
      } catch (grantError) {
        console.error("Failed to grant role:", grantError.message);
      }
    }
  } catch (error) {
    console.error("Error checking/granting role:", error.message);
  }

  // Step 4: Check FriendGroupMarketFactory's internal marketFactory reference
  console.log("\n\n--- Step 4: Check FriendGroupMarketFactory's marketFactory reference ---");
  try {
    const FriendGroupMarketFactory = await ethers.getContractFactory("FriendGroupMarketFactory");
    const friendGroupMarketFactory = FriendGroupMarketFactory.attach(ADDRESSES.friendGroupMarketFactory);

    const internalMarketFactory = await friendGroupMarketFactory.marketFactory();
    console.log("FriendGroupMarketFactory.marketFactory():", internalMarketFactory);

    if (internalMarketFactory.toLowerCase() !== ADDRESSES.marketFactory.toLowerCase()) {
      console.log("⚠️  FriendGroupMarketFactory points to a DIFFERENT marketFactory!");
      console.log("   Internal:", internalMarketFactory);
      console.log("   Expected:", ADDRESSES.marketFactory);
    } else {
      console.log("✓ FriendGroupMarketFactory's marketFactory reference is correct");
    }
  } catch (error) {
    console.error("Error checking FriendGroupMarketFactory:", error.message);
  }

  // Step 5: Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log(`
For acceptMarket to work, these conditions must be met:
1. ConditionalMarketFactory.roleManager must point to TieredRoleManager
2. FriendGroupMarketFactory must have MARKET_MAKER_ROLE on TieredRoleManager
3. FriendGroupMarketFactory.marketFactory must point to ConditionalMarketFactory

If all checks pass but acceptance still fails, check:
- Token approval amounts
- Collateral balance in FriendGroupMarketFactory
- Any other revert reasons in the contract logic
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
