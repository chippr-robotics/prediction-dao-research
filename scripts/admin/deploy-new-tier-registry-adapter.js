const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Deploy a new TierRegistryAdapter with the MARKET_MAKER_ROLE function
 * and configure it with the modular system references.
 *
 * The old adapter (0x8e3A4C65a6C22d88515FD356cB00732adac4f4d7) was deployed
 * before commit e29016e which added the MARKET_MAKER_ROLE() function.
 *
 * Usage:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/admin/deploy-new-tier-registry-adapter.js --network mordor
 */

const MODULAR_SYSTEM = {
  roleManagerCore: '0x888332df7621EC341131d85e2228f00407777dD7',
  tierRegistry: '0x4eb93BaF14f668F8f67922121A3b9FC3FB5b8A0d',
  membershipManager: '0x6698C2ba129D18C1930e19C586f7Da6aB30b86D6',
  usageTracker: '0xcdD68d86D2A381430dE3f83D3cFB0868260874F0',
};

const CONTRACTS = {
  conditionalMarketFactory: '0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a',
};

async function main() {
  console.log("=".repeat(60));
  console.log("Deploy New TierRegistryAdapter with MARKET_MAKER_ROLE");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("Deployer:", signer.address);

  // Step 1: Deploy new TierRegistryAdapter
  console.log("\n--- Step 1: Deploying TierRegistryAdapter ---");
  const TierRegistryAdapter = await ethers.getContractFactory("TierRegistryAdapter");
  const adapter = await TierRegistryAdapter.deploy();
  await adapter.waitForDeployment();
  const adapterAddress = await adapter.getAddress();
  console.log("New TierRegistryAdapter deployed at:", adapterAddress);

  // Step 2: Configure the adapter with modular system references
  console.log("\n--- Step 2: Configuring Adapter ---");
  console.log("Configuring with:");
  console.log("  roleManagerCore:", MODULAR_SYSTEM.roleManagerCore);
  console.log("  tierRegistry:", MODULAR_SYSTEM.tierRegistry);
  console.log("  membershipManager:", MODULAR_SYSTEM.membershipManager);
  console.log("  usageTracker:", MODULAR_SYSTEM.usageTracker);

  const configureTx = await adapter.configure(
    MODULAR_SYSTEM.roleManagerCore,
    MODULAR_SYSTEM.tierRegistry,
    MODULAR_SYSTEM.membershipManager,
    MODULAR_SYSTEM.usageTracker
  );
  await configureTx.wait();
  console.log("Configuration tx:", configureTx.hash);

  // Step 3: Verify MARKET_MAKER_ROLE works on new adapter
  console.log("\n--- Step 3: Verifying MARKET_MAKER_ROLE ---");
  try {
    const marketMakerRole = await adapter.MARKET_MAKER_ROLE();
    console.log("MARKET_MAKER_ROLE:", marketMakerRole);
    console.log("SUCCESS: MARKET_MAKER_ROLE() works on new adapter!");
  } catch (error) {
    console.log("ERROR: MARKET_MAKER_ROLE() failed:", error.message);
    process.exit(1);
  }

  // Step 4: Update ConditionalMarketFactory to use new adapter
  console.log("\n--- Step 4: Updating ConditionalMarketFactory ---");
  const cmf = await ethers.getContractAt("ConditionalMarketFactory", CONTRACTS.conditionalMarketFactory);

  const currentRoleManager = await cmf.roleManager();
  console.log("Current roleManager:", currentRoleManager);
  console.log("New adapter address:", adapterAddress);

  const setTx = await cmf.setRoleManager(adapterAddress);
  await setTx.wait();
  console.log("Set roleManager tx:", setTx.hash);

  const newRoleManager = await cmf.roleManager();
  console.log("New roleManager:", newRoleManager);

  if (newRoleManager.toLowerCase() === adapterAddress.toLowerCase()) {
    console.log("SUCCESS: ConditionalMarketFactory updated to use new adapter!");
  } else {
    console.log("ERROR: Failed to update roleManager");
    process.exit(1);
  }

  // Step 5: Authorize new adapter on UsageTracker
  console.log("\n--- Step 5: Authorizing Adapter on UsageTracker ---");
  const usageTracker = await ethers.getContractAt("UsageTracker", MODULAR_SYSTEM.usageTracker);
  try {
    const authTx = await usageTracker.setAuthorizedExtension(adapterAddress, true);
    await authTx.wait();
    console.log("Authorized adapter on UsageTracker, tx:", authTx.hash);
  } catch (error) {
    console.log("Warning: Could not authorize on UsageTracker:", error.message);
    console.log("This may need to be done by the UsageTracker owner.");
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log("New TierRegistryAdapter:", adapterAddress);
  console.log("CMF roleManager updated to:", newRoleManager);
  console.log("");
  console.log("Friend market 7 should now be able to activate!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
