/**
 * Targeted spec-066 deploy: add the StakingRouter (staking control surface + LIQUID fee router)
 * to an ALREADY-deployed network WITHOUT touching existing core contracts. Requires the spec-060
 * FeeRouter to be deployed on the network (it reads the rate + treasury from it). APPENDS the new
 * addresses to `deployments/<net>-chain<id>-v2.json` (never overwrites) and registers the two
 * per-provider LIQUID staking fee services on the EXISTING FeeRouter (idempotent, rate 0):
 *   stake.lido     ConfigOnly  cap 250 bps  (Lido ETH→wstETH)
 *   stake.polygon  ConfigOnly  cap 250 bps  (sPOL POL→sPOL)
 *
 * Provider addresses default to the Ethereum-mainnet (chainId 1) L1 contracts (env-overridable);
 * the staking service launches on mainnet per spec 065. Delegated staking is fee-free in v1 and
 * stays a direct member call — the router only governs its allowlist + pause.
 *
 *   npx hardhat run scripts/deploy/deploy-staking-router.js --network mainnet
 *   Then: npm run sync:frontend-contracts   (frontend picks up the stakingRouter address)
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");
const { deployProxy } = require("./lib/upgradeable");
const { LAUNCH_FEE_SERVICES } = require("./lib/feeServices");

// Ethereum-mainnet L1 provider addresses (mirror frontend/src/config/staking.js). Env-overridable.
const PROVIDERS = {
  steth: process.env.LIDO_STETH || "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  wsteth: process.env.LIDO_WSTETH || "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  spolController: process.env.SPOL_CONTROLLER || "0xEaadA411F2600570796c341552b9869DA708a28B",
  spolToken: process.env.SPOL_TOKEN || "0x3B790d651e950497c7723D47B24E6f61534f7969",
  polToken: process.env.POL_TOKEN_L1 || "0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6",
  stakeManager: process.env.POLYGON_STAKE_MANAGER || "0x5e3Ef299fDDf15eAa0432E6e66473ace8c13D908",
};

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Staking Router (spec 066) — targeted deploy");
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  if (chainId !== 1) {
    console.log(`\n⚠️  Provider addresses default to Ethereum-mainnet L1 contracts. On chainId ${chainId}`);
    console.log(`   override LIDO_STETH/LIDO_WSTETH/SPOL_*/POL_TOKEN_L1/POLYGON_STAKE_MANAGER as needed.`);
  }

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No existing deployment record at deployments/${filename}. Run the core deploy first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || (record.contracts = {});

  const feeRouter = contracts.feeRouter;
  if (!feeRouter || !ethers.isAddress(feeRouter)) {
    throw new Error(`FeeRouter not deployed on this network (contracts.feeRouter missing). Run deploy-fee-router.js first.`);
  }
  console.log(`FeeRouter: ${feeRouter}`);

  if (contracts.stakingRouter) {
    console.log(`\n⚠️  stakingRouter already recorded (${contracts.stakingRouter}). To change logic,`);
    console.log(`   run an in-place upgrade (lib/upgradeable.js upgradeProxy), not this script. Aborting.`);
    return;
  }

  // Admin (config + guardian) starts as the deployer; hand off to the multisig below (FR-018).
  console.log("\nDeploying StakingRouter behind a UUPS proxy...");
  const proxy = await deployProxy({
    name: "StakingRouter",
    initArgs: [
      deployer.address,
      feeRouter,
      PROVIDERS.steth,
      PROVIDERS.wsteth,
      PROVIDERS.spolController,
      PROVIDERS.spolToken,
      PROVIDERS.polToken,
      PROVIDERS.stakeManager,
    ],
  });

  // Persist immediately so an interrupted registration loop leaves a RECORDED proxy, not an orphan.
  contracts.stakingRouter = proxy.proxy;
  contracts.stakingRouterImpl = proxy.implementation;
  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.stakingRouterImpl = [];
  record.stakingRouterDeployedAt = new Date().toISOString();
  saveDeployment(filename, record);

  // Register the two per-provider LIQUID staking fee services on the EXISTING FeeRouter (idempotent,
  // rate 0 — enabled later from the Fees tab). Needs DEFAULT_ADMIN_ROLE on the FeeRouter; if the
  // deployer no longer holds it (handed off to a multisig), this is a no-op with a loud note.
  const stakingServices = LAUNCH_FEE_SERVICES.filter((s) => s.label.startsWith("stake."));
  const router = await ethers.getContractAt("FeeRouter", feeRouter);
  const canRegister = await router.hasRole(await router.DEFAULT_ADMIN_ROLE(), deployer.address);
  if (!canRegister) {
    console.log(`\n⚠️  Deployer lacks DEFAULT_ADMIN_ROLE on the FeeRouter — register the staking`);
    console.log(`   services (${stakingServices.map((s) => s.label).join(", ")}) from the FeeRouter admin.`);
  } else {
    for (const svc of stakingServices) {
      const id = ethers.keccak256(ethers.toUtf8Bytes(svc.label));
      const existing = await router.getService(id);
      if (Number(existing.kind) !== 0) {
        console.log(`  • ${svc.label} already registered — skipping`);
        continue;
      }
      await (await router.registerService(id, svc.capBps, svc.kind)).wait();
      console.log(`  ✓ registered ${svc.label} (cap ${svc.capBps} bps, ConfigOnly)`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  stakingRouter     ${contracts.stakingRouter}`);
  console.log(`  stakingRouterImpl ${contracts.stakingRouterImpl}`);
  console.log("\n" + "!".repeat(60));
  console.log("ADMIN HANDOFF (do NOT skip): the deployer EOA currently holds DEFAULT_ADMIN_ROLE,");
  console.log("UPGRADER_ROLE, STAKING_ADMIN_ROLE and GUARDIAN_ROLE on a value-bearing UUPS router.");
  console.log("Transfer these to the designated multisig (no timelock — FR-018) and renounce the");
  console.log("deployer's roles per docs/runbooks/staking-operations.md before it carries production stakes.");
  console.log("!".repeat(60));
  console.log(`\nNext: npm run sync:frontend-contracts (frontend picks up the stakingRouter address).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
