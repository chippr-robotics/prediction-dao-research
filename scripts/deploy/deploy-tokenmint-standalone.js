/**
 * deploy-tokenmint-standalone.js — Self-contained TokenMint system deployment
 *
 * Deploys everything needed to run the TokenMint API Docker service:
 *   1. TieredRoleManager  (access control)
 *   2. TokenMintFactory    (ERC-20 / ERC-721 factory with clone pattern)
 *   3. Grants TOKENMINT_ROLE to the deployer so the API signer can create tokens
 *
 * The script is fully standalone — it does NOT depend on any prior core or RBAC
 * deployment. It reuses the project's deterministic deployment helpers (CREATE2
 * via Safe Singleton Factory) so addresses are reproducible across networks.
 *
 * Usage:
 *   # Local Hardhat node (start with `npx hardhat node` first)
 *   npx hardhat run scripts/deploy/deploy-tokenmint-standalone.js --network localhost
 *
 *   # Mordor testnet
 *   npx hardhat run scripts/deploy/deploy-tokenmint-standalone.js --network mordor
 *
 *   # Grant TOKENMINT_ROLE to a different address (instead of deployer)
 *   API_SIGNER=0x... npx hardhat run scripts/deploy/deploy-tokenmint-standalone.js --network localhost
 *
 * After deployment the script prints a ready-to-use .env block for the
 * tokenmint-api Docker service (services/tokenmint-api/).
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

const { SALT_PREFIXES, ROLE_HASHES } = require("./lib/constants");

const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  saveDeployment,
  getDeploymentFilename,
  verifyOnBlockscout,
} = require("./lib/helpers");

// Standalone salt prefix — intentionally distinct from the main pipeline so the
// two sets of contracts never collide on the same network.
const SALT_PREFIX = "TokenMint-Standalone-v1.0-";

async function main() {
  console.log("=".repeat(60));
  console.log("TokenMint Standalone Deployment");
  console.log("=".repeat(60));

  // ── Network & signer ────────────────────────────────────────────────

  const network = await ethers.provider.getNetwork();
  console.log(`\nNetwork : ${hre.network.name} (Chain ID: ${network.chainId})`);

  await ensureSingletonFactory();

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer available");
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance : ${ethers.formatEther(balance)} ETH\n`);

  // Optional: grant TOKENMINT_ROLE to a different address
  const apiSigner = process.env.API_SIGNER || deployer.address;

  const deployments = {};

  // ── 1. TieredRoleManager ────────────────────────────────────────────

  console.log("--- Step 1: TieredRoleManager ---");

  const trm = await deployDeterministic(
    "TieredRoleManager",
    [],
    generateSalt(SALT_PREFIX + "TieredRoleManager"),
    deployer,
  );
  deployments.tieredRoleManager = trm.address;

  // Initialize (idempotent — safe to re-run)
  if (!trm.alreadyDeployed) {
    try {
      const tx = await trm.contract.initialize(deployer.address);
      await tx.wait();
      console.log("  ✓ TieredRoleManager initialized");
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("TRMAlreadyInit") || msg.includes("Already initialized")) {
        console.log("  ✓ Already initialized");
      } else {
        throw error;
      }
    }
  }

  await verifyOnBlockscout({
    name: "TieredRoleManager",
    address: trm.address,
    contract: "contracts/access/TieredRoleManager.sol:TieredRoleManager",
    constructorArguments: [],
  });

  // ── 2. TokenMintFactory ─────────────────────────────────────────────

  console.log("\n--- Step 2: TokenMintFactory ---");

  const factory = await deployDeterministic(
    "TokenMintFactory",
    [trm.address],
    generateSalt(SALT_PREFIX + "TokenMintFactory"),
    deployer,
  );
  deployments.tokenMintFactory = factory.address;

  await verifyOnBlockscout({
    name: "TokenMintFactory",
    address: factory.address,
    contract: "contracts/tokens/TokenMintFactory.sol:TokenMintFactory",
    constructorArguments: [trm.address],
  });

  // ── 3. Grant TOKENMINT_ROLE ─────────────────────────────────────────
  //
  // The role hierarchy is:
  //   DEFAULT_ADMIN_ROLE  →  CORE_SYSTEM_ADMIN_ROLE  →  OPERATIONS_ADMIN_ROLE  →  TOKENMINT_ROLE
  //
  // The deployer received DEFAULT_ADMIN_ROLE from initialize().
  // To grant TOKENMINT_ROLE we must first walk the admin chain.

  console.log("\n--- Step 3: Grant TOKENMINT_ROLE ---");

  const TOKENMINT_ROLE = ROLE_HASHES.TOKENMINT_ROLE;
  const alreadyHasRole = await trm.contract.hasRole(TOKENMINT_ROLE, apiSigner);

  if (alreadyHasRole) {
    console.log(`  ✓ ${apiSigner} already has TOKENMINT_ROLE`);
  } else {
    // Read role constants from the contract
    const CORE_SYSTEM_ADMIN_ROLE = await trm.contract.CORE_SYSTEM_ADMIN_ROLE();
    const OPERATIONS_ADMIN_ROLE = await trm.contract.OPERATIONS_ADMIN_ROLE();

    // Step 3a: deployer needs CORE_SYSTEM_ADMIN_ROLE (admin: DEFAULT_ADMIN_ROLE)
    if (!(await trm.contract.hasRole(CORE_SYSTEM_ADMIN_ROLE, deployer.address))) {
      console.log("  Granting CORE_SYSTEM_ADMIN_ROLE to deployer...");
      const tx = await trm.contract.grantRole(CORE_SYSTEM_ADMIN_ROLE, deployer.address);
      await tx.wait();
      console.log("  ✓ CORE_SYSTEM_ADMIN_ROLE granted");
    } else {
      console.log("  ✓ Deployer already has CORE_SYSTEM_ADMIN_ROLE");
    }

    // Step 3b: deployer needs OPERATIONS_ADMIN_ROLE (admin: CORE_SYSTEM_ADMIN_ROLE)
    if (!(await trm.contract.hasRole(OPERATIONS_ADMIN_ROLE, deployer.address))) {
      console.log("  Granting OPERATIONS_ADMIN_ROLE to deployer...");
      const tx = await trm.contract.grantRole(OPERATIONS_ADMIN_ROLE, deployer.address);
      await tx.wait();
      console.log("  ✓ OPERATIONS_ADMIN_ROLE granted");
    } else {
      console.log("  ✓ Deployer already has OPERATIONS_ADMIN_ROLE");
    }

    // Step 3c: grant TOKENMINT_ROLE to the API signer (admin: OPERATIONS_ADMIN_ROLE)
    console.log(`  Granting TOKENMINT_ROLE to ${apiSigner}...`);
    const tx = await trm.contract.grantRole(TOKENMINT_ROLE, apiSigner);
    await tx.wait();
    console.log("  ✓ TOKENMINT_ROLE granted");
  }

  // Verify the role is set
  const confirmed = await trm.contract.hasRole(TOKENMINT_ROLE, apiSigner);
  if (!confirmed) {
    throw new Error("TOKENMINT_ROLE grant verification failed");
  }

  // ── 4. Save deployment artifact ─────────────────────────────────────

  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    apiSigner,
    contracts: deployments,
    roles: {
      TOKENMINT_ROLE,
    },
    timestamp: new Date().toISOString(),
  };

  const filename = getDeploymentFilename(network, "tokenmint-standalone");
  saveDeployment(filename, deploymentInfo);

  // ── 5. Summary ──────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log(`\n  Network              : ${hre.network.name} (Chain ID: ${network.chainId})`);
  console.log(`  TieredRoleManager    : ${trm.address}`);
  console.log(`  TokenMintFactory     : ${factory.address}`);
  console.log(`  API Signer           : ${apiSigner}`);
  console.log(`  TOKENMINT_ROLE       : ${TOKENMINT_ROLE}`);
  console.log(`  Deployment artifact  : deployments/${filename}`);

  // ── 6. Print .env for Docker API service ────────────────────────────

  const rpcUrl = hre.network.name === "mordor"
    ? "https://rpc.mordor.etccooperative.org"
    : "http://127.0.0.1:8545";

  console.log("\n" + "─".repeat(60));
  console.log("Copy the block below into services/tokenmint-api/.env");
  console.log("─".repeat(60));
  console.log(`
RPC_URL=${rpcUrl}
CHAIN_ID=${network.chainId}
TOKEN_MINT_FACTORY_ADDRESS=${factory.address}
SIGNER_PRIVATE_KEY=<your-api-signer-private-key>
API_KEYS=<generate-a-secret-api-key>
`);

  console.log("─".repeat(60));
  console.log("Quick start:");
  console.log("  cd services/tokenmint-api");
  console.log("  cp .env.example .env        # paste values above");
  console.log("  docker compose up --build   # start API");
  console.log("─".repeat(60));

  console.log("\n✓ TokenMint standalone deployment completed!\n");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
