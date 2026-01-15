const hre = require("hardhat");
const { ethers } = require("hardhat");

/**
 * Deploy NullifierRegistry and configure integration with FGMF
 *
 * Usage:
 *   FLOPPY_KEYSTORE_PASSWORD=password npx hardhat run scripts/deploy-nullifier-registry.js --network mordor
 */

const CONTRACTS = {
  friendGroupMarketFactory: '0x8cFE477e267bB36925047df8A6E30348f82b0085',
  conditionalMarketFactory: '0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a',
};

// Initial admin to grant NULLIFIER_ADMIN_ROLE
const NULLIFIER_ADMIN = '0xb8596659FD9212dB17752DB6EB53ACA97f044967';

async function main() {
  console.log("=".repeat(60));
  console.log("Deploy NullifierRegistry");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETC");

  // Deploy NullifierRegistry
  console.log("\n--- Deploying NullifierRegistry ---");
  const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
  const nullifierRegistry = await NullifierRegistry.deploy();
  await nullifierRegistry.waitForDeployment();
  const nullifierAddress = await nullifierRegistry.getAddress();
  console.log("NullifierRegistry deployed to:", nullifierAddress);

  // Grant NULLIFIER_ADMIN_ROLE to the specified admin
  console.log("\n--- Granting NULLIFIER_ADMIN_ROLE ---");
  const NULLIFIER_ADMIN_ROLE = await nullifierRegistry.NULLIFIER_ADMIN_ROLE();
  console.log("NULLIFIER_ADMIN_ROLE hash:", NULLIFIER_ADMIN_ROLE);
  console.log("Granting to:", NULLIFIER_ADMIN);

  const grantTx = await nullifierRegistry.grantRole(NULLIFIER_ADMIN_ROLE, NULLIFIER_ADMIN);
  await grantTx.wait();
  console.log("Role granted!");

  // Verify role was granted
  const hasRole = await nullifierRegistry.hasRole(NULLIFIER_ADMIN_ROLE, NULLIFIER_ADMIN);
  console.log("Verification - hasRole:", hasRole);

  // Configure FriendGroupMarketFactory with NullifierRegistry
  console.log("\n--- Configuring FriendGroupMarketFactory ---");
  const fgmf = await ethers.getContractAt(
    "FriendGroupMarketFactory",
    CONTRACTS.friendGroupMarketFactory
  );

  // Check if deployer is owner
  const fgmfOwner = await fgmf.owner();
  console.log("FGMF Owner:", fgmfOwner);
  console.log("Is deployer owner:", fgmfOwner.toLowerCase() === deployer.address.toLowerCase());

  if (fgmfOwner.toLowerCase() === deployer.address.toLowerCase()) {
    // Set NullifierRegistry on FGMF
    console.log("Setting NullifierRegistry on FGMF...");
    const setRegistryTx = await fgmf.setNullifierRegistry(nullifierAddress);
    await setRegistryTx.wait();
    console.log("NullifierRegistry set on FGMF!");

    // Enable enforcement
    console.log("Enabling nullification enforcement...");
    const enableTx = await fgmf.setNullificationEnforcement(true);
    await enableTx.wait();
    console.log("Enforcement enabled!");

    // Verify
    const registryOnFgmf = await fgmf.nullifierRegistry();
    const enforcementEnabled = await fgmf.enforceNullification();
    console.log("\nVerification:");
    console.log("  NullifierRegistry on FGMF:", registryOnFgmf);
    console.log("  Enforcement enabled:", enforcementEnabled);
  } else {
    console.log("\nWARNING: Deployer is not FGMF owner. Manual configuration required:");
    console.log(`  fgmf.setNullifierRegistry("${nullifierAddress}")`);
    console.log("  fgmf.setNullificationEnforcement(true)");
  }

  // Configure ConditionalMarketFactory if deployer is owner
  console.log("\n--- Configuring ConditionalMarketFactory ---");
  const cmf = await ethers.getContractAt(
    "ConditionalMarketFactory",
    CONTRACTS.conditionalMarketFactory
  );

  const cmfOwner = await cmf.owner();
  console.log("CMF Owner:", cmfOwner);
  console.log("Is deployer owner:", cmfOwner.toLowerCase() === deployer.address.toLowerCase());

  if (cmfOwner.toLowerCase() === deployer.address.toLowerCase()) {
    console.log("Setting NullifierRegistry on CMF...");
    const setCmfTx = await cmf.setNullifierRegistry(nullifierAddress);
    await setCmfTx.wait();
    console.log("NullifierRegistry set on CMF!");

    // Optionally enable enforcement (might increase gas costs)
    // const enableCmfTx = await cmf.setNullificationEnforcement(true);
    // await enableCmfTx.wait();
    // console.log("Enforcement enabled on CMF!");
  } else {
    console.log("\nWARNING: Deployer is not CMF owner. Manual configuration required:");
    console.log(`  cmf.setNullifierRegistry("${nullifierAddress}")`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("\nNullifierRegistry:", nullifierAddress);
  console.log("NULLIFIER_ADMIN:", NULLIFIER_ADMIN);
  console.log("\nAdd to frontend/src/config/contracts.js:");
  console.log(`  nullifierRegistry: '${nullifierAddress}',`);
  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
