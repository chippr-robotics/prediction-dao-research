const { ethers } = require("hardhat");

/**
 * Fix TierRegistryAdapter's UsageTracker configuration
 *
 * Run with admin floppy disk:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/admin/fix-adapter-usage-tracker.js --network mordor
 */

const CONTRACTS = {
  newAdapter: "0x8aba782765b458Bf2d8DB8eD266D0c785D9F82AD",
  correctUsageTracker: "0xcdD68d86D2A381430dE3f83D3cFB0868260874F0",
};

async function main() {
  console.log("=".repeat(60));
  console.log("Fix TierRegistryAdapter UsageTracker");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("\nAdmin:", signer.address);

  // Step 1: Reconfigure adapter with correct UsageTracker
  console.log("\n[1/2] Updating adapter's UsageTracker...");
  const adapter = await ethers.getContractAt([
    "function owner() view returns (address)",
    "function usageTracker() view returns (address)",
    "function configure(address, address, address, address)"
  ], CONTRACTS.newAdapter);

  const owner = await adapter.owner();
  console.log("Adapter owner:", owner);

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error("Error: Not adapter owner");
    process.exit(1);
  }

  const currentUT = await adapter.usageTracker();
  console.log("Current UsageTracker:", currentUT);
  console.log("Correct UsageTracker:", CONTRACTS.correctUsageTracker);

  // Configure with zeros for unchanged values, only update usageTracker
  const tx1 = await adapter.configure(
    ethers.ZeroAddress, // keep roleManagerCore
    ethers.ZeroAddress, // keep tierRegistry
    ethers.ZeroAddress, // keep membershipManager
    CONTRACTS.correctUsageTracker // update usageTracker
  );
  await tx1.wait();
  console.log("Updated!");

  const newUT = await adapter.usageTracker();
  console.log("New UsageTracker:", newUT);

  // Step 2: Authorize adapter on UsageTracker
  console.log("\n[2/2] Authorizing adapter on UsageTracker...");
  const usageTracker = await ethers.getContractAt([
    "function owner() view returns (address)",
    "function setAuthorizedCaller(address, bool)"
  ], CONTRACTS.correctUsageTracker);

  const utOwner = await usageTracker.owner();
  console.log("UsageTracker owner:", utOwner);

  if (utOwner.toLowerCase() !== signer.address.toLowerCase()) {
    console.log("Warning: Not UsageTracker owner, trying anyway...");
  }

  try {
    const tx2 = await usageTracker.setAuthorizedCaller(CONTRACTS.newAdapter, true);
    await tx2.wait();
    console.log("Authorized!");
  } catch (e) {
    console.log("Authorization failed:", e.message.slice(0, 80));
  }

  console.log("\nDone! Switch to user floppy and run create-divisional-public-markets.js");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
