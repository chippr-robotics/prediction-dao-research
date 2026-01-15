const { ethers } = require("hardhat");

/**
 * Debug script to check TierRegistryAdapter configuration
 */

const CONTRACTS = {
  tierRegistryAdapter: '0x5680f16E72E556844a430ea3B022C238dD5953a1',
  roleManagerCore: '0x888332df7621EC341131d85e2228f00407777dD7',
  conditionalMarketFactory: '0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a',
  friendGroupMarketFactory: '0x8cFE477e267bB36925047df8A6E30348f82b0085',
};

async function main() {
  console.log("=".repeat(60));
  console.log("TierRegistryAdapter Configuration Debug");
  console.log("=".repeat(60));

  // Use provider directly for read-only operations
  const provider = ethers.provider;
  console.log("Provider:", await provider.getNetwork().then(n => n.name));

  // Get TierRegistryAdapter
  const adapter = await ethers.getContractAt("TierRegistryAdapter", CONTRACTS.tierRegistryAdapter);

  console.log("\n--- TierRegistryAdapter State ---");

  // Check each configured component
  const roleManagerCore = await adapter.roleManagerCore();
  const tierRegistry = await adapter.tierRegistry();
  const membershipManager = await adapter.membershipManager();
  const usageTracker = await adapter.usageTracker();

  console.log("roleManagerCore:", roleManagerCore);
  console.log("tierRegistry:", tierRegistry);
  console.log("membershipManager:", membershipManager);
  console.log("usageTracker:", usageTracker);

  // Check if any are zero
  console.log("\n--- Zero Address Checks ---");
  console.log("roleManagerCore is zero:", roleManagerCore === ethers.ZeroAddress);
  console.log("tierRegistry is zero:", tierRegistry === ethers.ZeroAddress);
  console.log("membershipManager is zero:", membershipManager === ethers.ZeroAddress);
  console.log("usageTracker is zero:", usageTracker === ethers.ZeroAddress);

  // Try calling MARKET_MAKER_ROLE directly on the adapter
  console.log("\n--- Testing adapter.MARKET_MAKER_ROLE() ---");
  try {
    const role = await adapter.MARKET_MAKER_ROLE();
    console.log("MARKET_MAKER_ROLE via adapter:", role);
  } catch (error) {
    console.log("ERROR calling adapter.MARKET_MAKER_ROLE():", error.message);
  }

  // Try calling on roleManagerCore directly
  console.log("\n--- Testing roleManagerCore.MARKET_MAKER_ROLE() ---");
  if (roleManagerCore !== ethers.ZeroAddress) {
    try {
      const rmc = await ethers.getContractAt("RoleManagerCore", roleManagerCore);
      const role = await rmc.MARKET_MAKER_ROLE();
      console.log("MARKET_MAKER_ROLE via RoleManagerCore:", role);
    } catch (error) {
      console.log("ERROR calling roleManagerCore.MARKET_MAKER_ROLE():", error.message);
    }
  }

  // Test hasRole
  console.log("\n--- Testing adapter.hasRole() ---");
  try {
    const rmc = await ethers.getContractAt("RoleManagerCore", roleManagerCore);
    const marketMakerRole = await rmc.MARKET_MAKER_ROLE();
    const hasRole = await adapter.hasRole(marketMakerRole, CONTRACTS.friendGroupMarketFactory);
    console.log("FGMF hasRole via adapter:", hasRole);
  } catch (error) {
    console.log("ERROR calling adapter.hasRole():", error.message);
  }

  // Test checkMarketCreationLimitFor
  console.log("\n--- Testing adapter.checkMarketCreationLimitFor() ---");
  if (usageTracker !== ethers.ZeroAddress) {
    try {
      const rmc = await ethers.getContractAt("RoleManagerCore", roleManagerCore);
      const marketMakerRole = await rmc.MARKET_MAKER_ROLE();
      // Note: this is a stateful call, we do a staticCall to test
      const canCreate = await adapter.checkMarketCreationLimitFor.staticCall(CONTRACTS.friendGroupMarketFactory, marketMakerRole);
      console.log("FGMF checkMarketCreationLimitFor:", canCreate);
    } catch (error) {
      console.log("ERROR calling adapter.checkMarketCreationLimitFor():", error.message);
    }
  } else {
    console.log("usageTracker is zero, skipping checkMarketCreationLimitFor test");
  }

  // Check if CMF's roleManager is the adapter
  console.log("\n--- ConditionalMarketFactory roleManager ---");
  const cmf = await ethers.getContractAt("ConditionalMarketFactory", CONTRACTS.conditionalMarketFactory);
  const cmfRoleManager = await cmf.roleManager();
  console.log("CMF roleManager:", cmfRoleManager);
  console.log("Is CMF roleManager the adapter?", cmfRoleManager.toLowerCase() === CONTRACTS.tierRegistryAdapter.toLowerCase());

  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
