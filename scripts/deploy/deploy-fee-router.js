/**
 * Targeted spec-060 deploy: add the FeeRouter (unified platform-fee registry + atomic ERC-4626
 * fee wrapper) to an ALREADY-deployed network WITHOUT touching existing core contracts. Reuses the
 * network's recorded treasury address and APPENDS the new addresses to its
 * `deployments/<net>-chain<id>-v2.json` record (never overwrites).
 *
 * Registers the launch fee services from `lib/feeServices.js` with their hard caps (rates all start
 * at 0 — fees are enabled later from the AdminPanel Fees tab); that table is the source of truth,
 * reproduced here only as a reader's map:
 *   earn.lend         Wrapped     cap 250 bps  (Earn/Morpho vault deposits, spec 050 consumer)
 *   polymarket.taker  ConfigOnly  cap 100 bps  (relay-gateway reads; spec 057 cap)
 *   polymarket.maker  ConfigOnly  cap  50 bps  (relay-gateway reads; spec 057 cap)
 *   stake.lido        ConfigOnly  cap 250 bps  (StakingRouter skims itself; spec 066)
 *   stake.polygon     ConfigOnly  cap 250 bps  (StakingRouter skims itself; spec 066)
 * The spec-067 `bridge.transfer` / `liquidity.deposit` services are registered by
 * `deploy-bridge-liquidity.js` on the router this script deploys.
 *
 * RESUMABLE: re-running on a network that already has a recorded feeRouter does NOT redeploy the
 * proxy — it reconciles the deployments record and registers whatever services are still missing.
 * That path is the whole point: setup after the proxy is a sequence of registerService txs, any one
 * of which can die on an RPC hiccup, and a half-registered router is not a cosmetic problem
 * (`quoteFee` REVERTS ServiceUnknown for an unregistered id, and the spec-067 bridge/liquidity
 * routers quote on every member action — so a missing service breaks every bridge and every supply).
 *
 *   CONFIRM_MAINNET=true npx hardhat run scripts/deploy/deploy-fee-router.js --network polygon
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/deploy-fee-router.js --network mordor
 *
 * Then: npm run sync:frontend-contracts  (frontend picks up the feeRouter address), and set
 * FEE_ROUTER_ADDRESS on the relay-gateway so Predict serves the on-chain Polymarket bps.
 *
 * To register a service on a router this script can no longer administer (roles handed off to the
 * multisig) or to inspect the live table, use `scripts/ops/register-fee-service.js`.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");
const { deployProxy, getImplementation } = require("./lib/upgradeable");
const { LAUNCH_FEE_SERVICES, SERVICE_KIND_LABELS } = require("./lib/feeServices");
const { MAINNET_CHAIN_IDS } = require("./lib/constants");

/**
 * The gate below is the CONFIRM_MAINNET pattern scripts/deploy/deploy.js and
 * deploy-verifying-paymaster.js already use, keyed off the shared MAINNET_CHAIN_IDS list — this
 * script deliberately does NOT keep a second "is this mainnet" list of its own.
 *
 * What it does keep is a load-time assertion that the five mainnets this control plane targets
 * (spec 060 FeeRouter + spec 067 routers) are actually IN that shared list. Dropping one there
 * would not break anything visibly; it would just quietly delete the prompt in front of a live
 * chain. Failing at require-time makes that regression impossible to miss.
 */
const CONTROL_PLANE_MAINNETS = [1, 10, 137, 8453, 42161]; // Ethereum, Optimism, Polygon, Base, Arbitrum One
const UNGATED = CONTROL_PLANE_MAINNETS.filter((id) => !MAINNET_CHAIN_IDS.includes(id));
if (UNGATED.length) {
  throw new Error(
    `MAINNET_CHAIN_IDS in scripts/deploy/lib/constants.js is missing chain id(s) ${UNGATED.join(", ")}, ` +
      `so this script would deploy there with no CONFIRM_MAINNET prompt. Add them back before deploying.`
  );
}

// Shared with deploy-bridge-liquidity.js via lib/feeServices — see the note there.
const KIND_LABELS = SERVICE_KIND_LABELS;

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);

  console.log("=".repeat(60));
  console.log("Fee Router (spec 060) — targeted deploy");
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${chainId})`);

  // Mainnet gate, checked BEFORE a signer is even fetched (same position as deploy.js). Without it
  // this script deploys a value-path contract to a live chain on a bare `--network polygon` typo
  // with no prompt at all.
  if (MAINNET_CHAIN_IDS.includes(chainId)) {
    if (!process.env.CONFIRM_MAINNET) {
      throw new Error(
        `Mainnet deployment requires CONFIRM_MAINNET=true env var (network ${networkName}, chainId ${chainId}).`
      );
    }
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error(`No signer for network '${networkName}'`);
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

  // ---------------------------------------------------------------- 1. deploy OR resume
  // A recorded feeRouter means the proxy already exists, and this script must never deploy a second
  // one: a fresh proxy would strand the registered services, their caps and their rates on the old
  // address and split the source of truth. But "don't redeploy" is NOT "don't finish" — the earlier
  // run may have died between the proxy and the last registerService, and the only way back from
  // that is to re-run. So the already-deployed path falls through to the same reconcile-and-register
  // tail as a fresh deploy; it just skips the proxy.
  let router;
  if (contracts.feeRouter) {
    console.log(`\nfeeRouter already recorded (${contracts.feeRouter}) — resuming setup, not redeploying.`);
    console.log("   (to change LOGIC, run an in-place upgrade via lib/upgradeable.js upgradeProxy)");
    // Refuse to "resume" against an address that isn't a contract here. That means the record
    // belongs to another network, or the recorded deploy never actually landed — and continuing
    // would fire admin transactions into the void and report success.
    const code = await ethers.provider.getCode(contracts.feeRouter);
    if (code === "0x") {
      throw new Error(
        `deployments/${filename} records feeRouter ${contracts.feeRouter}, but that address has NO ` +
          `bytecode on ${networkName} (chainId ${chainId}). Fix the record (wrong network? deploy that ` +
          `never landed?) before re-running — this script will not silently deploy a second proxy.`
      );
    }
    router = await ethers.getContractAt("FeeRouter", contracts.feeRouter);
    // Report the treasury the router ACTUALLY holds, not the one this run would have initialized it
    // with — on a resume the init arg was never applied, and printing it would tell the operator
    // fees go somewhere they do not.
    const liveTreasury = await router.treasury();
    console.log(
      `Treasury (live on router): ${liveTreasury === ethers.ZeroAddress ? "(unset — fees skipped until setTreasury)" : liveTreasury}`
    );
    if (liveTreasury.toLowerCase() !== treasury.toLowerCase()) {
      console.log(`   note: the record/TREASURY says ${treasury}. Change it with setTreasury (DEFAULT_ADMIN),`);
      console.log(`   never by redeploying — this script cannot and must not move it.`);
    }
  } else {
    console.log(
      `Treasury: ${treasury === ethers.ZeroAddress ? "(unset — fees skipped until setTreasury)" : treasury}`
    );
    console.log("\nDeploying FeeRouter behind a UUPS proxy...");
    const proxy = await deployProxy({
      name: "FeeRouter",
      initArgs: [deployer.address, treasury],
    });
    router = proxy.contract;
    contracts.feeRouter = proxy.proxy;
    record.feeRouterDeployedAt = new Date().toISOString();
    // Record the deploy block alongside the address: every later log scan over this router (role
    // holders, FeeBpsChanged rate history) needs a fromBlock, and scanning from 0 is refused
    // outright by most public mainnet RPCs — which turns "who holds DEFAULT_ADMIN?" into a shrug
    // exactly when it matters. Best-effort: a missing block never blocks the deploy.
    const deployTx = proxy.contract.deploymentTransaction();
    const blockNumber = deployTx ? (await deployTx.wait()).blockNumber : null;
    if (blockNumber != null) {
      record.deployBlocks = record.deployBlocks || {};
      record.deployBlocks.feeRouter = blockNumber;
    }
  }

  // ---------------------------------------------------------------- 2. reconcile the record
  // Written on BOTH paths, and BEFORE the registration loop, so an interrupted run — e.g. an RPC
  // timeout on a registerService tx — leaves a RECORDED proxy rather than an orphan, and so a
  // resumed run repairs a record that was written before an upgrade (or never written, if the first
  // run died between the deploy tx and the save). The implementation comes from the proxy's
  // ERC-1967 slot rather than from memory: that is the on-chain truth, and a stale feeRouterImpl
  // would point `npm run verify:<net>` at bytecode that is no longer behind the proxy.
  contracts.feeRouterImpl = await getImplementation(contracts.feeRouter);
  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.feeRouterImpl = []; // UUPS implementations take no constructor args
  record.feeRouterDeployedAt = record.feeRouterDeployedAt || new Date().toISOString();
  saveDeployment(filename, record);

  // ---------------------------------------------------------------- 3. register launch services
  // registerService is ONE-SHOT per id (the router reverts AlreadyRegistered) and gated on
  // DEFAULT_ADMIN_ROLE, so read the live table first and only send transactions for what is
  // genuinely missing. Rates all start at 0 — they are enabled later from the AdminPanel Fees tab.
  console.log("\nLaunch fee services (live table):");
  const adminRole = await router.DEFAULT_ADMIN_ROLE();
  const missing = [];
  const drift = [];
  for (const svc of LAUNCH_FEE_SERVICES) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(svc.label));
    const existing = await router.getService(id);
    const kind = Number(existing.kind);
    if (kind === 0) {
      console.log(`  · ${svc.label.padEnd(18)} NOT registered (cap ${svc.capBps} bps, ${KIND_LABELS[svc.kind]})`);
      missing.push({ ...svc, id });
      continue;
    }
    console.log(
      `  • ${svc.label.padEnd(18)} registered — cap ${existing.capBps} bps, rate ${existing.feeBps} bps, ${KIND_LABELS[kind] || kind}`
    );
    if (Number(existing.capBps) !== svc.capBps || kind !== svc.kind) {
      drift.push(
        `${svc.label}: on-chain cap ${existing.capBps} bps / ${KIND_LABELS[kind] || kind} vs. ` +
          `lib/feeServices.js cap ${svc.capBps} bps / ${KIND_LABELS[svc.kind]}`
      );
    }
  }

  if (missing.length) {
    // Fail loudly rather than "warn and continue": services are missing AND this signer cannot add
    // them, so nobody would notice until a member's bridge quote reverted ServiceUnknown.
    if (!(await router.hasRole(adminRole, deployer.address))) {
      throw new Error(
        `${missing.length} launch fee service(s) are unregistered (${missing.map((s) => s.label).join(", ")}) ` +
          `and the deployer ${deployer.address} does NOT hold DEFAULT_ADMIN_ROLE on ${contracts.feeRouter} ` +
          `(roles handed off?). Register them from the role holder — see ` +
          `scripts/ops/register-fee-service.js — before any member surface quotes them: ` +
          `FeeRouter.quoteFee reverts ServiceUnknown for an unregistered id.`
      );
    }
    console.log("\nRegistering missing services (rate 0)...");
    for (const svc of missing) {
      await (await router.registerService(svc.id, svc.capBps, svc.kind)).wait();
      console.log(`  ✓ registered ${svc.label} (cap ${svc.capBps} bps, ${KIND_LABELS[svc.kind]}, rate 0)`);
    }
  } else {
    console.log("  (all launch services already registered — nothing to send)");
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

  // Reported LAST, and as a failure, because it is real config drift that no script can repair:
  // registration is one-shot and the cap is fixed for the entry's life, so a router registered with
  // the wrong cap/kind can only be fixed by a new service id. Everything above already ran (the
  // record is saved and the missing services are registered) — this exit code exists so a wrong
  // table can never be mistaken for a clean deploy.
  if (drift.length) {
    console.error("\n" + "!".repeat(60));
    console.error("FEE SERVICE DRIFT — the live router disagrees with scripts/deploy/lib/feeServices.js:");
    for (const d of drift) console.error(`  ✗ ${d}`);
    console.error("!".repeat(60));
    throw new Error(
      "Live fee-service table does not match lib/feeServices.js. registerService is one-shot and the " +
        "cap is fixed for the entry's life, so this cannot be corrected in place: reconcile the table " +
        "(or register a new service id) before enabling any rate."
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
