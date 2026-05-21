/**
 * Redeploy TokenMintFactory with TieredRoleManager
 *
 * This script redeploys the TokenMintFactory contract with the correct
 * TieredRoleManager address instead of RoleManagerCore.
 *
 * The original deployment used RoleManagerCore for role checks, but the
 * payment system (PaymentProcessor) grants roles in TieredRoleManager.
 * This caused users who purchased TOKENMINT role to fail role verification.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/redeploy-token-mint-factory.js --network mordor
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  verifyOnBlockscout,
} = require("./lib/helpers");

// Use a new salt prefix to get a new deterministic address
const SALT_PREFIX = "ClearPathDAO-TokenMint-v2-";

// Existing TieredRoleManager address (from 02-deploy-rbac.js)
const TIERED_ROLE_MANAGER = "0x55e6346Be542B13462De504FCC379a2477D227f0";

async function main() {
  console.log("=".repeat(60));
  console.log("Redeploy TokenMintFactory with TieredRoleManager");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork: ${hre.network.name} (Chain ID: ${network.chainId})`);

  await ensureSingletonFactory();

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer available");
  }
  console.log("\nDeployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETC");

  console.log("\nUsing TieredRoleManager:", TIERED_ROLE_MANAGER);

  // Verify TieredRoleManager exists
  const code = await ethers.provider.getCode(TIERED_ROLE_MANAGER);
  if (code === "0x") {
    throw new Error(`TieredRoleManager not deployed at ${TIERED_ROLE_MANAGER}`);
  }
  console.log("  ✓ TieredRoleManager verified at address");

  const deployments = {};

  // =========================================================================
  // Deploy TokenMintFactory
  // =========================================================================
  console.log("\n\n--- Deploying TokenMintFactory ---");

  const tokenMintFactory = await deployDeterministic(
    "TokenMintFactory",
    [TIERED_ROLE_MANAGER],  // Use TieredRoleManager, NOT RoleManagerCore
    generateSalt(SALT_PREFIX + "TokenMintFactory"),
    deployer
  );
  deployments.tokenMintFactory = tokenMintFactory.address;
  console.log("  TokenMintFactory:", tokenMintFactory.address);

  // =========================================================================
  // Verify roleManager is set correctly
  // =========================================================================
  console.log("\n\n--- Verifying Configuration ---");

  const factory = tokenMintFactory.contract;
  const roleManagerAddress = await factory.roleManager();
  console.log("  roleManager:", roleManagerAddress);

  if (roleManagerAddress.toLowerCase() !== TIERED_ROLE_MANAGER.toLowerCase()) {
    throw new Error(`roleManager mismatch! Expected ${TIERED_ROLE_MANAGER}, got ${roleManagerAddress}`);
  }
  console.log("  ✓ roleManager correctly set to TieredRoleManager");

  // =========================================================================
  // Save Deployment Info
  // =========================================================================
  console.log("\n\n--- Saving Deployment Info ---");

  const deploymentsFile = path.join(__dirname, `../../deployments-${hre.network.name}.json`);
  let existingDeployments = {};
  if (fs.existsSync(deploymentsFile)) {
    existingDeployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  }

  // Update with new TokenMintFactory address
  existingDeployments.tokenMintFactory = tokenMintFactory.address;

  fs.writeFileSync(deploymentsFile, JSON.stringify(existingDeployments, null, 2));
  console.log(`  ✓ Saved to ${deploymentsFile}`);

  // =========================================================================
  // Update Frontend Config (manual step reminder)
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("IMPORTANT: Update frontend/src/config/contracts.js");
  console.log("=".repeat(60));
  console.log(`\nReplace the tokenMintFactory address with:`);
  console.log(`  tokenMintFactory: '${tokenMintFactory.address}',`);
  console.log(`\nAlso update .env or environment variables:`);
  console.log(`  VITE_TOKEN_MINT_FACTORY_ADDRESS=${tokenMintFactory.address}`);

  // =========================================================================
  // Verify on Blockscout
  // =========================================================================
  if (process.env.VERIFY !== "false" && !tokenMintFactory.alreadyDeployed) {
    console.log("\n\n--- Verifying on Blockscout ---");

    await verifyOnBlockscout(hre, {
      name: "TokenMintFactory",
      address: tokenMintFactory.address,
      constructorArguments: [TIERED_ROLE_MANAGER],
    });
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log(`\nTokenMintFactory: ${tokenMintFactory.address}`);
  console.log(`  roleManager: ${TIERED_ROLE_MANAGER}`);
  console.log(`  status: ${tokenMintFactory.alreadyDeployed ? "Already deployed" : "Newly deployed"}`);

  console.log("\n✅ TokenMintFactory redeployment complete!");
  console.log("\nUsers with TOKENMINT role in TieredRoleManager can now create tokens.");

  return deployments;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
