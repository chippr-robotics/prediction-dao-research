const { ethers } = require("hardhat");

/**
 * Fix FriendGroupMarketFactory's tieredRoleManager
 *
 * Update to use the new TierRegistryAdapter that has MARKET_MAKER_ROLE support
 *
 * Run with admin floppy:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/admin/fix-fgmf-role-manager.js --network mordor
 */

const CONTRACTS = {
  friendGroupMarketFactory: "0x8cFE477e267bB36925047df8A6E30348f82b0085",
  newAdapter: "0x8aba782765b458Bf2d8DB8eD266D0c785D9F82AD",
  oldAdapter: "0x8e3A4C65a6C22d88515FD356cB00732adac4f4d7",
};

async function main() {
  console.log("=".repeat(60));
  console.log("Fix FriendGroupMarketFactory TieredRoleManager");
  console.log("=".repeat(60));

  const [signer] = await ethers.getSigners();
  console.log("\nAdmin:", signer.address);

  const fgmf = await ethers.getContractAt("FriendGroupMarketFactory", CONTRACTS.friendGroupMarketFactory);

  const owner = await fgmf.owner();
  console.log("FGMF owner:", owner);

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    console.error("Error: Not FGMF owner");
    process.exit(1);
  }

  const currentRM = await fgmf.tieredRoleManager();
  console.log("\nCurrent tieredRoleManager:", currentRM);
  console.log("New adapter:", CONTRACTS.newAdapter);

  if (currentRM.toLowerCase() === CONTRACTS.newAdapter.toLowerCase()) {
    console.log("\nAlready using new adapter!");
    return;
  }

  console.log("\nUpdating tieredRoleManager...");
  const tx = await fgmf.updateTieredRoleManager(CONTRACTS.newAdapter);
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("Updated!");

  const newRM = await fgmf.tieredRoleManager();
  console.log("New tieredRoleManager:", newRM);

  // Verify the new adapter has MARKET_MAKER_ROLE
  const adapter = await ethers.getContractAt([
    "function MARKET_MAKER_ROLE() view returns (bytes32)",
    "function FRIEND_MARKET_ROLE() view returns (bytes32)"
  ], newRM);

  const mmRole = await adapter.MARKET_MAKER_ROLE();
  const fmRole = await adapter.FRIEND_MARKET_ROLE();
  console.log("\nNew adapter roles:")
  console.log("  MARKET_MAKER_ROLE:", mmRole);
  console.log("  FRIEND_MARKET_ROLE:", fmRole);

  console.log("\nDone! Users can now accept friend markets.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
