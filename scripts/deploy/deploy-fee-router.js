/**
 * Targeted spec-060 deploy: add the FeeRouter (unified platform-fee registry + atomic ERC-4626
 * fee wrapper) to an ALREADY-deployed network WITHOUT touching existing core contracts. Reuses the
 * network's recorded treasury address and APPENDS the new addresses to its
 * `deployments/<net>-chain<id>-v2.json` record (never overwrites).
 *
 * Registers the launch fee services with their hard caps (rates all start at 0 — fees are enabled
 * later from the AdminPanel Fees tab):
 *   earn.lend         Wrapped     cap 250 bps  (Earn/Morpho vault deposits, spec 050 consumer)
 *   polymarket.taker  ConfigOnly  cap 100 bps  (relay-gateway reads; spec 057 cap)
 *   polymarket.maker  ConfigOnly  cap  50 bps  (relay-gateway reads; spec 057 cap)
 *
 *   npx hardhat run scripts/deploy/deploy-fee-router.js --network polygon
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/deploy-fee-router.js --network mordor
 *
 * Then: npm run sync:frontend-contracts  (frontend picks up the feeRouter address), and set
 * FEE_ROUTER_ADDRESS on the relay-gateway so Predict serves the on-chain Polymarket bps.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");
const { deployProxy } = require("./lib/upgradeable");
const { LAUNCH_FEE_SERVICES } = require("./lib/feeServices");

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Fee Router (spec 060) — targeted deploy");
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No existing deployment record at deployments/${filename}. Run the core deploy first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || (record.contracts = {});

  // Fee destination: the network's recorded treasury (TREASURY env overrides). Zero is allowed —
  // the charge path then skips fees (never lost funds) until setTreasury is called.
  const treasury =
    process.env.TREASURY && ethers.isAddress(process.env.TREASURY)
      ? process.env.TREASURY
      : record.treasury && ethers.isAddress(record.treasury)
        ? record.treasury
        : ethers.ZeroAddress;
  console.log(`Treasury: ${treasury === ethers.ZeroAddress ? "(unset — fees skipped until setTreasury)" : treasury}`);

  if (contracts.feeRouter) {
    console.log(`\n⚠️  feeRouter already recorded (${contracts.feeRouter}). To change logic,`);
    console.log(`   run an in-place upgrade (lib/upgradeable.js upgradeProxy), not this script. Aborting.`);
    return;
  }

  console.log("\nDeploying FeeRouter behind a UUPS proxy...");
  const proxy = await deployProxy({
    name: "FeeRouter",
    initArgs: [deployer.address, treasury],
  });

  // Persist the proxy address IMMEDIATELY (before the registration loop) so an interrupted run —
  // e.g. an RPC timeout on a registerService tx — leaves a RECORDED proxy rather than an orphan.
  contracts.feeRouter = proxy.proxy;
  contracts.feeRouterImpl = proxy.implementation;
  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.feeRouterImpl = [];
  record.feeRouterDeployedAt = new Date().toISOString();
  saveDeployment(filename, record);

  // Register launch services idempotently (rates start at 0; enable from the Fees admin tab). A
  // resumed run skips services already registered (AlreadyRegistered), so re-running finishes setup.
  const router = proxy.contract;
  for (const svc of LAUNCH_FEE_SERVICES) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(svc.label));
    const existing = await router.getService(id);
    if (Number(existing.kind) !== 0) {
      console.log(`  • ${svc.label} already registered — skipping`);
      continue;
    }
    await (await router.registerService(id, svc.capBps, svc.kind)).wait();
    console.log(`  ✓ registered ${svc.label} (cap ${svc.capBps} bps, kind ${svc.kind})`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  feeRouter     ${contracts.feeRouter}`);
  console.log(`  feeRouterImpl ${contracts.feeRouterImpl}`);
  console.log("\n" + "!".repeat(60));
  console.log("ADMIN HANDOFF (do NOT skip): the deployer EOA currently holds DEFAULT_ADMIN_ROLE,");
  console.log("UPGRADER_ROLE and FEE_ADMIN_ROLE on a value-bearing UUPS router. Transfer these to");
  console.log("the designated multisig/timelock and renounce the deployer's roles per the fee");
  console.log("operations runbook before this router carries production fees.");
  console.log("!".repeat(60));
  console.log(`\nNext: npm run sync:frontend-contracts, then set FEE_ROUTER_ADDRESS on the relay-gateway.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
