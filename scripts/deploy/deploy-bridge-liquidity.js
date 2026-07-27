/**
 * Targeted spec-067 deploy: add the BridgeRouter (Across route registry + `bridge.transfer` fee path)
 * and the LiquidityRouter (curated supply pools + `liquidity.deposit` fee path) to an ALREADY-deployed
 * network WITHOUT touching existing core contracts. Requires the spec-060 FeeRouter to be deployed on
 * the network (both routers read the rate + treasury from it). APPENDS the new addresses to
 * `deployments/<net>-chain<id>-v2.json` (never overwrites) and registers the two fee services on the
 * EXISTING FeeRouter (idempotent, rate 0 — enabled later from the AdminPanel Fees tab):
 *   bridge.transfer    ConfigOnly  cap 250 bps  (charged on a bridge submission, value-out)
 *   liquidity.deposit  ConfigOnly  cap 250 bps  (charged on a Uniswap full-range supply, value-in)
 *
 * ── THE GUARD THIS SCRIPT EXISTS TO RUN (research R4b) ──────────────────────────────────────────
 * Uniswap's own docs warn integrators not to assume a protocol sits at the same address on every
 * chain, and BASE genuinely differs: its factory and NonfungiblePositionManager are NOT the canonical
 * pair the other four networks share. A copied address points at a non-contract at best, and at a
 * same-address contract belonging to something else at worst. So BEFORE anything is deployed and
 * before any record is written, every protocol address configured for the target network is asserted
 * to carry bytecode ON THAT CHAIN, checked against the chain-specific table, and (for the position
 * manager) cross-checked to report the configured factory. Any failure aborts the run.
 * `scripts/ops/verify-protocol-addresses.js` is the standalone ops twin of this guard — it runs the
 * same assertion across every network from bare node. The two address tables must be updated together.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   npx hardhat run scripts/deploy/deploy-bridge-liquidity.js --network polygon
 *   npx hardhat run scripts/deploy/deploy-bridge-liquidity.js --network base
 *
 * Env overrides (all optional): ACROSS_SPOKE_POOL, ACROSS_HUB_POOL, UNISWAP_FACTORY,
 * UNISWAP_POSITION_MANAGER, FEE_ROUTER, SANCTIONS_GUARD.
 *
 * Then: npm run sync:frontend-contracts (frontend picks up bridgeRouter + liquidityRouter), then seed
 * routes and pools per the research R8 availability matrix.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");
const { deployProxy } = require("./lib/upgradeable");
const { ServiceKind, SERVICE_KIND_LABELS } = require("./lib/feeServices");
const { MAINNET_CHAIN_IDS } = require("./lib/constants");

/**
 * External protocol addresses per chain, each taken from that chain's own official deployment record
 * (research R4b — never copied across chains). Mirrors `scripts/ops/verify-protocol-addresses.js` and
 * `frontend/src/config/networks.js`; change all three together.
 *
 * `hubPool` is Ethereum-only: Across's HubPool is an L1 contract by design, which is why bridge-LP
 * supply is Ethereum-only while trading-LP supply spans all five networks. Do not "fix" that by
 * copying the address to an L2 — there is no HubPool there.
 */
const PROTOCOL_ADDRESSES = {
  1: {
    name: "Ethereum",
    spokePool: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5",
    hubPool: "0xc186fA914353c44b2E33eBE05f21846F1048bEda",
    uniswapFactory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  },
  10: {
    name: "Optimism",
    spokePool: "0x6f26Bf09B1C792e3228e5467807a900A503c0281",
    hubPool: null,
    uniswapFactory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  },
  137: {
    name: "Polygon",
    spokePool: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
    hubPool: null,
    uniswapFactory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  },
  8453: {
    name: "Base",
    spokePool: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
    hubPool: null,
    // ⚠️ NOT the canonical pair. This is the exact case the guard below exists for.
    uniswapFactory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    positionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  },
  42161: {
    name: "Arbitrum One",
    spokePool: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A",
    hubPool: null,
    uniswapFactory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    positionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  },
};

/**
 * Addresses that belong to exactly ONE chain. `eth_getCode` alone cannot catch a Base address pasted
 * onto Polygon (something else may well have code there), so the table itself is checked too.
 */
const CHAIN_SPECIFIC = {
  8453: ["uniswapFactory", "positionManager"],
};

/** The two spec-067 fee services, registered at cap 250 bps / rate 0 (research R9). */
const BRIDGE_LIQUIDITY_FEE_SERVICES = [
  // ConfigOnly, NOT Wrapped — matching spec 066's StakingRouter precedent.
  //
  // "Wrapped" means chargeable through FeeRouter.depositToVaultWithFee, which deposits into an
  // ERC-4626 vault. These routers do not use that path: they read quoteFee/feeBps/treasury and skim
  // the fee themselves. Registering them Wrapped would make
  // `depositToVaultWithFee("bridge.transfer", someVault, ...)` pass FeeRouter's kind check and treat
  // a bridge fee as a vault deposit; ConfigOnly makes that revert ServiceNotWrapped.
  //
  // quoteFee/feeBps/setFeeBps behave identically for either kind, and the 250 bps ceiling is
  // enforced by the stored capBps on every rate change regardless.
  { label: "bridge.transfer", capBps: 250, kind: ServiceKind.ConfigOnly }, // bridge submission (value-out)
  { label: "liquidity.deposit", capBps: 250, kind: ServiceKind.ConfigOnly }, // Uniswap supply (value-in)
];

const LOCAL_NETWORKS = new Set(["hardhat", "localhost"]);

async function hasCode(address) {
  if (!address || !ethers.isAddress(address)) return false;
  return (await ethers.provider.getCode(address)) !== "0x";
}

/** Env override wins over the table so a fresh official deployment can be used before this file moves. */
function resolveProtocolAddresses(chainId) {
  const table = PROTOCOL_ADDRESSES[chainId] || {};
  const pick = (envKey, tableValue) => {
    const override = process.env[envKey];
    if (override) {
      if (!ethers.isAddress(override)) throw new Error(`${envKey}="${override}" is not an address`);
      return ethers.getAddress(override);
    }
    return tableValue || null;
  };
  return {
    name: table.name || null,
    spokePool: pick("ACROSS_SPOKE_POOL", table.spokePool),
    hubPool: pick("ACROSS_HUB_POOL", table.hubPool),
    uniswapFactory: pick("UNISWAP_FACTORY", table.uniswapFactory),
    positionManager: pick("UNISWAP_POSITION_MANAGER", table.positionManager),
  };
}

/**
 * The research-R4b guard. Aborts the whole run if ANY configured protocol address fails, so no proxy
 * is ever deployed — and no deployment record ever written — against an address that is not what the
 * config claims it is on this chain.
 */
async function verifyProtocolAddresses(chainId, resolved, { label }) {
  const configured = Object.entries(resolved).filter(
    ([key, value]) => key !== "name" && value && ethers.isAddress(value)
  );
  if (configured.length === 0) return;

  console.log(`\nR4b guard — verifying ${label} protocol addresses on chain ${chainId}:`);
  const failures = [];

  for (const [key, address] of configured) {
    let bytes = 0;
    try {
      const code = await ethers.provider.getCode(address);
      bytes = code && code !== "0x" ? (code.length - 2) / 2 : 0;
    } catch (err) {
      // A transport failure is NOT a pass — an unreachable RPC must never look like a verified address.
      failures.push(`${key} ${address}: eth_getCode failed (${err?.message || String(err)})`);
      console.log(`  ${key.padEnd(18)} ${address}  FAIL rpc error`);
      continue;
    }
    if (bytes === 0) {
      failures.push(`${key} ${address}: no bytecode on chain ${chainId}`);
      console.log(`  ${key.padEnd(18)} ${address}  FAIL no bytecode`);
    } else {
      console.log(`  ${key.padEnd(18)} ${address}  OK ${bytes} bytes`);
    }
  }

  // Table check: a chain-specific address must not appear on any other chain's row.
  for (const [ownerChainStr, keys] of Object.entries(CHAIN_SPECIFIC)) {
    const ownerChain = Number(ownerChainStr);
    if (ownerChain === chainId) continue;
    for (const key of keys) {
      const ownerAddress = PROTOCOL_ADDRESSES[ownerChain]?.[key];
      if (!ownerAddress || !resolved[key]) continue;
      if (ownerAddress.toLowerCase() === resolved[key].toLowerCase()) {
        failures.push(
          `${key} ${resolved[key]} is specific to chain ${ownerChain} but is configured on chain ${chainId}`
        );
      }
    }
  }

  // Identity check: the position manager must report the factory we configured for the same chain.
  // Bytecode alone would happily accept an unrelated contract that happens to sit at a copied address.
  if (resolved.positionManager && resolved.uniswapFactory) {
    try {
      const nfpm = new ethers.Contract(
        resolved.positionManager,
        ["function factory() view returns (address)"],
        ethers.provider
      );
      const reported = await nfpm.factory();
      if (reported.toLowerCase() !== resolved.uniswapFactory.toLowerCase()) {
        failures.push(
          `positionManager ${resolved.positionManager} reports factory ${reported}, ` +
            `not the configured ${resolved.uniswapFactory}`
        );
      } else {
        console.log(`  positionManager.factory() matches the configured factory`);
      }
    } catch (err) {
      failures.push(
        `positionManager ${resolved.positionManager}: factory() call failed — not a Uniswap V3 ` +
          `NonfungiblePositionManager on this chain (${err?.message || String(err)})`
      );
    }
  }

  if (failures.length > 0) {
    console.error("\n" + "!".repeat(60));
    console.error("R4b GUARD FAILED — nothing was deployed and no record was written.");
    for (const f of failures) console.error(`  • ${f}`);
    console.error("Take every address from THIS chain's own official deployment record.");
    console.error("!".repeat(60));
    throw new Error(`${failures.length} protocol address check(s) failed on chain ${chainId}`);
  }
  console.log(`  ✓ ${configured.length} protocol address(es) verified on chain ${chainId}`);
}

/**
 * Local-only stand-ins so `npx hardhat node` + this script gives a working local wiring in one command
 * (quickstart §3). Mocks are confined to contracts/mocks and can never reach a real network: this runs
 * only when the network is hardhat/localhost AND nothing is configured or overridden.
 *
 * A re-run against the same local node REUSES the doubles already in the record — deploying fresh ones
 * would rewrite the record's protocol addresses to contracts the already-deployed routers do not point at.
 */
async function deployLocalProtocolDoubles(record) {
  if ((await hasCode(record.acrossSpokePool)) && (await hasCode(record.uniswapPositionManager))) {
    console.log("\n⚠️  LOCAL DEV ONLY — reusing the recorded contracts/mocks stand-ins (still live).");
    console.log(`  • MockAcrossSpokePool: ${record.acrossSpokePool}`);
    console.log(`  • MockPositionManager: ${record.uniswapPositionManager}`);
    return {
      name: "local",
      spokePool: record.acrossSpokePool,
      hubPool: null,
      uniswapFactory: null,
      positionManager: record.uniswapPositionManager,
    };
  }

  console.log("\n⚠️  LOCAL DEV ONLY — no Across/Uniswap deployment on this chain.");
  console.log("   Deploying contracts/mocks stand-ins so the local wiring flow works. These are test");
  console.log("   doubles, NOT protocol addresses; never reuse this record on a real network.");
  const spoke = await (await ethers.getContractFactory("MockAcrossSpokePool")).deploy();
  await spoke.waitForDeployment();
  const nfpm = await (await ethers.getContractFactory("MockPositionManager")).deploy();
  await nfpm.waitForDeployment();
  const spokePool = await spoke.getAddress();
  const positionManager = await nfpm.getAddress();
  console.log(`  ✓ MockAcrossSpokePool: ${spokePool}`);
  console.log(`  ✓ MockPositionManager: ${positionManager}`);
  // No factory double: the identity cross-check is skipped when no factory is configured.
  return { name: "local", spokePool, hubPool: null, uniswapFactory: null, positionManager };
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const isLocal = LOCAL_NETWORKS.has(networkName);
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Bridge + Liquidity Routers (spec 067) — targeted deploy");
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  // Mainnet gate, checked BEFORE anything is deployed — same position and env var as
  // deploy-fee-router.js:78 and deploy.js. Without it a bare `--network mainnet` typo puts two
  // value-bearing UUPS proxies on a live chain with no prompt and no undo. init-deployment-record.js
  // already instructs operators to run this script AS `CONFIRM_MAINNET=true …`, so until now the
  // tooling advertised a gate that did not exist (T150 finding M2).
  if (MAINNET_CHAIN_IDS.includes(chainId) && !process.env.CONFIRM_MAINNET) {
    throw new Error(
      `Mainnet deployment requires CONFIRM_MAINNET=true env var (network ${networkName}, chainId ${chainId}).`,
    );
  }

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No existing deployment record at deployments/${filename}. Run the core deploy first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || (record.contracts = {});

  // ---------------------------------------------------------------- 1. R4b guard (before ANY deploy)
  let protocols = resolveProtocolAddresses(chainId);
  await verifyProtocolAddresses(chainId, protocols, { label: "configured" });

  if (!protocols.spokePool && !protocols.positionManager) {
    if (!isLocal) {
      throw new Error(
        `No Across/Uniswap addresses configured for chain ${chainId}. Add them to PROTOCOL_ADDRESSES ` +
          `(and the ops twin scripts/ops/verify-protocol-addresses.js) from that chain's own official ` +
          `deployment record, or set ACROSS_SPOKE_POOL / UNISWAP_POSITION_MANAGER. Refusing to deploy blind.`
      );
    }
    protocols = await deployLocalProtocolDoubles(record);
    await verifyProtocolAddresses(chainId, protocols, { label: "local stand-in" });
  }
  if (!protocols.spokePool) {
    // BridgeRouter.initialize rejects a zero spokePool — the bridge path must never silently no-op.
    throw new Error(`No Across SpokePool for chain ${chainId}; BridgeRouter cannot be deployed here.`);
  }

  // ---------------------------------------------------------------- 2. prerequisites
  const feeRouter =
    process.env.FEE_ROUTER && ethers.isAddress(process.env.FEE_ROUTER)
      ? ethers.getAddress(process.env.FEE_ROUTER)
      : contracts.feeRouter;
  if (!feeRouter || !ethers.isAddress(feeRouter)) {
    throw new Error(`FeeRouter not deployed on this network (contracts.feeRouter missing). Run deploy-fee-router.js first.`);
  }
  if (!(await hasCode(feeRouter))) {
    throw new Error(
      `Recorded feeRouter ${feeRouter} has no bytecode on chain ${chainId} — the record is stale or ` +
        `points at another network. Fix deployments/${filename} before deploying.`
    );
  }
  console.log(`\nFeeRouter: ${feeRouter}`);

  // Optional; zero disables screening in both routers (mirrors the platform pattern).
  const sanctionsGuard =
    process.env.SANCTIONS_GUARD && ethers.isAddress(process.env.SANCTIONS_GUARD)
      ? ethers.getAddress(process.env.SANCTIONS_GUARD)
      : contracts.sanctionsGuard && ethers.isAddress(contracts.sanctionsGuard)
        ? contracts.sanctionsGuard
        : ethers.ZeroAddress;
  console.log(
    `SanctionsGuard: ${sanctionsGuard === ethers.ZeroAddress ? "(unset — screening disabled)" : sanctionsGuard}`
  );

  // ---------------------------------------------------------------- 3. proxies (in-place upgrades later)
  // Admin (config + guardian) starts as the deployer; hand off to the multisig below.
  const routers = [
    {
      key: "bridgeRouter",
      name: "BridgeRouter",
      initArgs: [deployer.address, feeRouter, protocols.spokePool, sanctionsGuard],
    },
    {
      key: "liquidityRouter",
      name: "LiquidityRouter",
      // A zero position manager is allowed (bridge pools can still be curated); mintFullRangeWithFee
      // then reverts PositionManagerUnset rather than failing opaquely.
      initArgs: [deployer.address, feeRouter, protocols.positionManager || ethers.ZeroAddress, sanctionsGuard],
    },
  ];

  for (const router of routers) {
    const recorded = contracts[router.key];
    if (recorded && (await hasCode(recorded))) {
      console.log(`\n⚠️  ${router.key} already deployed (${recorded}). To change logic, run an in-place`);
      console.log(`   upgrade (lib/upgradeable.js upgradeProxy), not this script. Skipping.`);
      continue;
    }
    if (recorded && !isLocal) {
      throw new Error(
        `${router.key} is recorded as ${recorded} but has no bytecode on chain ${chainId}. ` +
          `Fix deployments/${filename} rather than redeploying over a live proxy address.`
      );
    }

    console.log(`\nDeploying ${router.name} behind a UUPS proxy...`);
    const proxy = await deployProxy({ name: router.name, initArgs: router.initArgs });

    // Persist immediately so an interrupted run leaves a RECORDED proxy, not an orphan.
    contracts[router.key] = proxy.proxy;
    contracts[`${router.key}Impl`] = proxy.implementation;
    record.constructorArgs = record.constructorArgs || {};
    record.constructorArgs[`${router.key}Impl`] = [];
    record[`${router.key}DeployedAt`] = new Date().toISOString();
    saveDeployment(filename, record);
  }

  // The protocol addresses belong in the record too (research R4b): the per-network source of truth for
  // what these routers are pointed at, without re-deriving it from a table. Read the two the routers
  // actually hold FROM THE CHAIN rather than trusting config — on a re-run against already-deployed
  // routers a changed table would otherwise silently rewrite the record to something untrue.
  const bridge = await ethers.getContractAt("BridgeRouter", contracts.bridgeRouter);
  const liquidity = await ethers.getContractAt("LiquidityRouter", contracts.liquidityRouter);
  const liveSpokePool = await bridge.spokePool();
  const livePositionManager = await liquidity.positionManager();

  for (const [label, live, configured, setter] of [
    ["spokePool", liveSpokePool, protocols.spokePool, "BridgeRouter.setSpokePool"],
    ["positionManager", livePositionManager, protocols.positionManager, "LiquidityRouter.setPositionManager"],
  ]) {
    if (configured && live.toLowerCase() !== configured.toLowerCase()) {
      console.log(`\n⚠️  ${label} drift: the deployed router holds ${live} but config says ${configured}.`);
      console.log(`   Recording the LIVE value. Point the router at the new address with ${setter}`);
      console.log(`   (an admin transaction) — never by redeploying.`);
    }
  }

  record.acrossSpokePool = liveSpokePool;
  record.acrossHubPool = protocols.hubPool;
  record.uniswapFactory = protocols.uniswapFactory;
  record.uniswapPositionManager =
    livePositionManager === ethers.ZeroAddress ? null : livePositionManager;
  if (protocols.name === "local") record.bridgeLiquidityLocalMocks = true;
  saveDeployment(filename, record);

  // ---------------------------------------------------------------- 4. fee services (idempotent, 0 bps)
  // Needs DEFAULT_ADMIN_ROLE on the FeeRouter; if the deployer no longer holds it (handed off to a
  // multisig), this is a no-op with a loud note rather than a failed run.
  const router = await ethers.getContractAt("FeeRouter", feeRouter);
  const canRegister = await router.hasRole(await router.DEFAULT_ADMIN_ROLE(), deployer.address);
  if (!canRegister) {
    // FATAL, not a warning (T150 finding M3). Without these services registered, FeeRouter.quoteFee
    // reverts ServiceUnknown, which both routers call on EVERY member action — so continuing here
    // publishes live routers where bridging and supplying revert for everyone. The record has
    // already been written at this point, so a warn-and-continue also printed a success banner and
    // exited 0 over a broken deployment.
    //
    // Recovery when the deployer has legitimately handed admin to the multisig: register the
    // services from that admin (scripts/ops/register-fee-service.js), then re-run this script — the
    // deploy steps above are idempotent and will skip.
    throw new Error(
      `Deployer ${deployer.address} lacks DEFAULT_ADMIN_ROLE on the FeeRouter (${feeRouter}), so the ` +
        `spec-067 fee services (${BRIDGE_LIQUIDITY_FEE_SERVICES.map((s) => s.label).join(", ")}) cannot be ` +
        `registered. The routers are deployed but EVERY member action would revert ServiceUnknown until ` +
        `they are. Register them from the FeeRouter admin (scripts/ops/register-fee-service.js) and re-run ` +
        `this script to complete setup.`,
    );
  } else {
    console.log("\nRegistering fee services on the FeeRouter...");
    for (const svc of BRIDGE_LIQUIDITY_FEE_SERVICES) {
      const id = ethers.keccak256(ethers.toUtf8Bytes(svc.label));
      const existing = await router.getService(id);
      if (Number(existing.kind) !== 0) {
        console.log(`  • ${svc.label} already registered — skipping`);
        continue;
      }
      await (await router.registerService(id, svc.capBps, svc.kind)).wait();
      // Interpolated, not hardcoded. This line used to print "Wrapped" while the call above
      // registers ConfigOnly — contradicting the paragraph at the top of this file explaining why
      // these two services must NOT be Wrapped. It is also the line an operator pastes into a
      // deployment record.
      console.log(
        `  ✓ registered ${svc.label} (cap ${svc.capBps} bps, ${SERVICE_KIND_LABELS[svc.kind] || svc.kind}, rate 0)`
      );
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  bridgeRouter          ${contracts.bridgeRouter}`);
  console.log(`  bridgeRouterImpl      ${contracts.bridgeRouterImpl}`);
  console.log(`  liquidityRouter       ${contracts.liquidityRouter}`);
  console.log(`  liquidityRouterImpl   ${contracts.liquidityRouterImpl}`);
  console.log("\n" + "!".repeat(60));
  console.log("ADMIN HANDOFF (do NOT skip): the deployer EOA currently holds DEFAULT_ADMIN_ROLE,");
  console.log("UPGRADER_ROLE, LIQUIDITY_ADMIN_ROLE and GUARDIAN_ROLE on two value-bearing UUPS routers.");
  console.log("Transfer these to the designated multisig and renounce the deployer's roles before");
  console.log("either router carries production value.");
  console.log("!".repeat(60));
  console.log("\nNext:");
  console.log("  1. npm run sync:frontend-contracts   (frontend picks up both router addresses)");
  console.log("  2. seed routes + pools per the research R8 availability matrix");
  console.log("  3. npm run check:storage-layout      (gate BEFORE any future upgrade)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
