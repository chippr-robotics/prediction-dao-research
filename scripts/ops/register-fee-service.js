/**
 * register-fee-service.js (spec 060) — report, and optionally REGISTER, a single platform-fee
 * service on an already-deployed FeeRouter.
 *
 * Why this exists
 * ---------------
 * `FeeRouter.registerService` is the one admin call with no UI: the AdminPanel Fees tab can change a
 * RATE, but it cannot create a service, and registration is one-shot per id. Meanwhile
 * `FeeRouter.quoteFee` REVERTS `ServiceUnknown` for an unregistered id, and every spec-067 member
 * action (bridge submit, liquidity supply) quotes before it acts. So a network whose router is
 * missing one service has a broken bridge and a broken supply surface, with no way to fix it from
 * the app — and after the DEFAULT_ADMIN handoff to the Safe, `deploy-fee-router.js` cannot fix it
 * either. This is that recovery path, and (run with no --service) it is also the fee-table printer
 * `specs/067-bridge-pool-liquidity/quickstart.md` refers to as `print-fee-services.js`.
 *
 * It never guesses: it refuses when the router is not in `deployments/` or carries no bytecode, it
 * prints the live table BEFORE it sends anything, and it refuses to submit a transaction the caller
 * is not authorized to make (naming the role and who holds it) rather than paying gas for a revert.
 *
 * Usage
 * -----
 *   # report only — the missing print-fee-services (no signature, no transaction)
 *   npx hardhat run scripts/ops/register-fee-service.js --network polygon
 *
 *   # rehearse a registration (prints the exact call, sends nothing)
 *   SERVICE=bridge.transfer DRY_RUN=true npx hardhat run scripts/ops/register-fee-service.js --network polygon
 *
 *   # register one known service
 *   SERVICE=bridge.transfer npx hardhat run scripts/ops/register-fee-service.js --network polygon
 *
 *   # register a service that is not in the catalog yet (cap + kind must be explicit)
 *   SERVICE=stake.rocketpool CAP_BPS=250 KIND=ConfigOnly npx hardhat run … --network polygon
 *
 * Env (or the equivalent `-- --flag value` after the script path):
 *   SERVICE   / --service    service label, e.g. `bridge.transfer`. Omit for a report-only run.
 *   CAP_BPS   / --cap        hard cap in bps; required only for labels outside the catalog.
 *   KIND      / --kind       `Wrapped` | `ConfigOnly` (or 1 | 2); same.
 *   DRY_RUN   / --dry-run    report + print the call, send nothing.
 *   FEE_ROUTER / --router    override the address from the deployments record (rare; must have code).
 *
 * When a Safe holds DEFAULT_ADMIN_ROLE, run this in DRY_RUN to get the exact calldata, then submit
 * that call from the Safe — the checks below are the same either way.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { getDeploymentFilename } = require("../deploy/lib/helpers");
const { LAUNCH_FEE_SERVICES, ServiceKind } = require("../deploy/lib/feeServices");

/**
 * Services this tool knows how to register without being told a cap and a kind.
 *
 * `LAUNCH_FEE_SERVICES` (shared with `deploy-fee-router.js` and its test) is the source of truth for
 * the spec-060/066 entries. The spec-067 pair is duplicated from
 * `scripts/deploy/deploy-bridge-liquidity.js`, which cannot be imported: that file calls `main()` on
 * require, so importing it would run a deploy. Keep the two lists in step — and note that anything
 * NOT listed here is still reportable and still registrable, it just has to pass CAP_BPS + KIND
 * explicitly, which is the safer default for an id nobody has reviewed.
 */
const CATALOG = [
  ...LAUNCH_FEE_SERVICES,
  { label: "bridge.transfer", capBps: 250, kind: ServiceKind.ConfigOnly }, // spec 067 — bridge submit
  { label: "liquidity.deposit", capBps: 250, kind: ServiceKind.ConfigOnly }, // spec 067 — Uniswap supply
];

const KIND_LABELS = { 0: "Unregistered", 1: "Wrapped", 2: "ConfigOnly" };

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function argFlag(flag) {
  return process.argv.includes(flag);
}

function parseKind(raw) {
  const s = String(raw).trim().toLowerCase();
  if (s === "1" || s === "wrapped") return ServiceKind.Wrapped;
  if (s === "2" || s === "configonly" || s === "config-only") return ServiceKind.ConfigOnly;
  throw new Error(`KIND must be Wrapped (1) or ConfigOnly (2), got '${raw}'.`);
}

function serviceId(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

/**
 * Current holders of `role`, derived from RoleGranted logs and then CONFIRMED with hasRole (a
 * granted-then-revoked address must not be reported as a holder). AccessControlUpgradeable is not
 * enumerable, so logs are the only index — and a public RPC may refuse the block range, which is
 * reported as "unknown" rather than as "nobody holds it".
 *
 * `fromBlock` comes from the record's `deployBlocks.feeRouter`; without it the scan starts at 0,
 * which most mainnet RPCs reject outright. That is a reporting gap, never a false "no holders".
 */
async function roleHolders(router, role, fromBlock) {
  try {
    const granted = await router.queryFilter(router.filters.RoleGranted(role), fromBlock, "latest");
    const seen = [...new Set(granted.map((e) => e.args.account))];
    const holders = [];
    for (const account of seen) {
      if (await router.hasRole(role, account)) holders.push(account);
    }
    return { holders, error: null };
  } catch (err) {
    const hint = fromBlock === 0 ? " — record deployBlocks.feeRouter to bound the scan" : "";
    return { holders: null, error: `${err.shortMessage || err.message}${hint}` };
  }
}

function describeHolders({ holders, error }) {
  if (error) return `(could not scan RoleGranted logs: ${error})`;
  if (!holders.length) return "(none — role has no holder!)";
  return holders.join(", ");
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);

  console.log("=".repeat(72));
  console.log("FeeRouter fee services (spec 060)");
  console.log("=".repeat(72));
  console.log(`Network: ${networkName} (chainId ${chainId})`);

  // ---------------------------------------------------------------- resolve the router
  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(
      `No deployment record at deployments/${filename}. deployments/ is the source of truth for ` +
        `on-chain addresses — this tool will not accept an address that is not recorded there.`
    );
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || {};

  const override = process.env.FEE_ROUTER || argVal("--router");
  if (override && !ethers.isAddress(override)) throw new Error(`FEE_ROUTER is not an address: ${override}`);
  if (override && contracts.feeRouter && override.toLowerCase() !== contracts.feeRouter.toLowerCase()) {
    // An override that contradicts the record is how a service gets registered on the wrong router
    // and nobody notices until the frontend (which reads the record) quotes the other one.
    throw new Error(
      `FEE_ROUTER ${override} contradicts deployments/${filename} (feeRouter ${contracts.feeRouter}). ` +
        `Fix the record first if the router really moved.`
    );
  }
  const routerAddress = override || contracts.feeRouter;
  if (!routerAddress) {
    throw new Error(
      `deployments/${filename} has no 'feeRouter' — spec 060 is not deployed on ${networkName}. ` +
        `Run scripts/deploy/deploy-fee-router.js first (it registers the launch services itself).`
    );
  }
  if ((await ethers.provider.getCode(routerAddress)) === "0x") {
    throw new Error(
      `feeRouter ${routerAddress} has NO bytecode on ${networkName} (chainId ${chainId}). The record ` +
        `belongs to a different network, or the deploy never landed. Refusing to send transactions ` +
        `into an empty address.`
    );
  }
  const router = await ethers.getContractAt("FeeRouter", routerAddress);
  console.log(`Router:  ${routerAddress}`);

  const treasury = await router.treasury();
  console.log(
    `Treasury: ${treasury === ethers.ZeroAddress ? "(unset — every quote reports 0 and no fee is charged)" : treasury}`
  );

  // ---------------------------------------------------------------- report BEFORE changing anything
  console.log("\nLaunch services:");
  const known = new Map();
  for (const svc of CATALOG) {
    const id = serviceId(svc.label);
    known.set(id.toLowerCase(), svc.label);
    const live = await router.getService(id);
    const kind = Number(live.kind);
    if (kind === 0) {
      console.log(
        `  ✗ ${svc.label.padEnd(20)} NOT REGISTERED  (quoteFee reverts ServiceUnknown) — expected cap ` +
          `${svc.capBps} bps, ${KIND_LABELS[svc.kind]}`
      );
      continue;
    }
    const drift =
      Number(live.capBps) !== svc.capBps || kind !== svc.kind
        ? `  ⚠️  DRIFT vs catalog (${svc.capBps} bps, ${KIND_LABELS[svc.kind]})`
        : "";
    console.log(
      `  ✓ ${svc.label.padEnd(20)} cap ${String(live.capBps).padStart(3)} bps · rate ${String(live.feeBps).padStart(3)} bps · ${KIND_LABELS[kind] || kind}${drift}`
    );
  }

  // Anything registered on-chain that the catalog does not name still belongs in the report — an
  // incomplete picture is exactly how a duplicate/typo'd id survives.
  const count = Number(await router.serviceCount());
  const extras = [];
  for (let i = 0; i < count; i++) {
    const id = await router.serviceAt(i);
    if (!known.has(id.toLowerCase())) extras.push(id);
  }
  if (extras.length) {
    console.log("\nRegistered but not in this tool's catalog:");
    for (const id of extras) {
      const live = await router.getService(id);
      console.log(
        `  ? ${id}  cap ${live.capBps} bps · rate ${live.feeBps} bps · ${KIND_LABELS[Number(live.kind)] || live.kind}`
      );
    }
  }
  console.log(`\n  ${count} service(s) registered on this router.`);

  // ---------------------------------------------------------------- roles
  const adminRole = await router.DEFAULT_ADMIN_ROLE();
  const feeAdminRole = await router.FEE_ADMIN_ROLE();
  const upgraderRole = await router.UPGRADER_ROLE();
  const fromBlock = record.deployBlocks?.feeRouter ?? 0;

  const admins = await roleHolders(router, adminRole, fromBlock);
  const feeAdmins = await roleHolders(router, feeAdminRole, fromBlock);
  const upgraders = await roleHolders(router, upgraderRole, fromBlock);
  console.log("\nRoles:");
  console.log(`  DEFAULT_ADMIN_ROLE (registerService, setTreasury): ${describeHolders(admins)}`);
  console.log(`  FEE_ADMIN_ROLE     (setFeeBps):                    ${describeHolders(feeAdmins)}`);
  console.log(`  UPGRADER_ROLE      (upgradeToAndCall):             ${describeHolders(upgraders)}`);

  const label = process.env.SERVICE || argVal("--service");
  if (!label) {
    console.log("\n(report only — pass SERVICE=<label> to register one. Nothing was sent.)");
    return;
  }

  // ---------------------------------------------------------------- resolve what to register
  const catalogEntry = CATALOG.find((s) => s.label === label);
  const capRaw = process.env.CAP_BPS || argVal("--cap");
  const kindRaw = process.env.KIND || argVal("--kind");
  if (!catalogEntry && (!capRaw || !kindRaw)) {
    throw new Error(
      `'${label}' is not in this tool's catalog (${CATALOG.map((s) => s.label).join(", ")}). To register ` +
        `a new service id, pass CAP_BPS and KIND explicitly — the cap is FIXED for the life of the ` +
        `entry, so it is never inferred.`
    );
  }
  const capBps = capRaw ? Number(capRaw) : catalogEntry.capBps;
  const kind = kindRaw ? parseKind(kindRaw) : catalogEntry.kind;
  if (!Number.isInteger(capBps) || capBps <= 0) {
    throw new Error(`CAP_BPS must be a positive integer (the router reverts CapZero on 0), got '${capRaw}'.`);
  }
  const maxWrapped = Number(await router.MAX_WRAPPED_FEE_BPS());
  if (kind === ServiceKind.Wrapped && capBps > maxWrapped) {
    throw new Error(
      `Wrapped services are capped at MAX_WRAPPED_FEE_BPS (${maxWrapped} bps); ${capBps} would revert CapAboveMax.`
    );
  }
  if (catalogEntry && (capBps !== catalogEntry.capBps || kind !== catalogEntry.kind)) {
    throw new Error(
      `Refusing to register '${label}' as cap ${capBps} bps / ${KIND_LABELS[kind]} when the catalog says ` +
        `cap ${catalogEntry.capBps} bps / ${KIND_LABELS[catalogEntry.kind]}. Registration is one-shot — ` +
        `change the catalog (and its test) first if the intent really changed.`
    );
  }

  const id = serviceId(label);
  console.log(`\nTarget: ${label}`);
  console.log(`  serviceId  ${id}`);
  console.log(`  cap        ${capBps} bps`);
  console.log(`  kind       ${KIND_LABELS[kind]} (${kind})`);

  const live = await router.getService(id);
  if (Number(live.kind) !== 0) {
    // Already registered: this is a success for the recovery use case, but say plainly whether it
    // matches what was asked for — registerService is one-shot, so a mismatch cannot be fixed here.
    const matches = Number(live.capBps) === capBps && Number(live.kind) === kind;
    console.log(
      `\n  Already registered — cap ${live.capBps} bps, rate ${live.feeBps} bps, ${KIND_LABELS[Number(live.kind)]}.`
    );
    if (!matches) {
      throw new Error(
        `'${label}' is registered as cap ${live.capBps} bps / ${KIND_LABELS[Number(live.kind)]}, not the ` +
          `requested cap ${capBps} bps / ${KIND_LABELS[kind]}. registerService is one-shot and the cap is ` +
          `fixed for the entry's life: the only levers left are setFeeBps(${label}, 0) or a NEW service id.`
      );
    }
    console.log("  Nothing to do (registerService is one-shot per id).");
    return;
  }

  // ---------------------------------------------------------------- authorization, before any send
  const dryRun = process.env.DRY_RUN === "true" || argFlag("--dry-run");
  const [signer] = await ethers.getSigners();
  const calldata = router.interface.encodeFunctionData("registerService", [id, capBps, kind]);

  if (!signer) {
    throw new Error(
      `No signer configured for network '${networkName}' — cannot register. Re-run with --dry-run to ` +
        `get the calldata and submit it from the DEFAULT_ADMIN_ROLE holder.`
    );
  }
  if (!(await router.hasRole(adminRole, signer.address))) {
    throw new Error(
      `${signer.address} does NOT hold DEFAULT_ADMIN_ROLE on ${routerAddress}, which registerService ` +
        `requires. Holder(s): ${describeHolders(admins)}. Submit this call from the holder instead ` +
        `(--dry-run prints the calldata for a Safe transaction). Refusing to send a transaction that ` +
        `would revert.`
    );
  }

  if (dryRun) {
    console.log("\nDRY RUN — nothing sent. The call to make from the DEFAULT_ADMIN_ROLE holder:");
    console.log(`  to:   ${routerAddress}`);
    console.log(`  data: ${calldata}`);
    console.log(`  (registerService("${label}" → ${id}, ${capBps}, ${kind}))`);
    return;
  }

  console.log(`\nSending registerService as ${signer.address}...`);
  const tx = await router.connect(signer).registerService(id, capBps, kind);
  console.log(`  tx ${tx.hash}`);
  await tx.wait();

  // Read back rather than trusting the receipt: the point of this tool is to end knowing the router
  // can actually quote the service.
  const after = await router.getService(id);
  if (Number(after.kind) !== kind || Number(after.capBps) !== capBps) {
    throw new Error(
      `Post-registration read-back mismatch for '${label}': got cap ${after.capBps} bps / ` +
        `${KIND_LABELS[Number(after.kind)]}. Investigate before enabling any rate.`
    );
  }
  const [fee] = await router.quoteFee(id, 10_000n); // proves quoteFee no longer reverts ServiceUnknown
  console.log(
    `  ✓ ${label} registered — cap ${after.capBps} bps, rate ${after.feeBps} bps, ` +
      `${KIND_LABELS[Number(after.kind)]}; quoteFee(10000) = ${fee} (rate starts at 0).`
  );
  console.log("\nSet the rate from the AdminPanel Fees tab (FEE_ADMIN_ROLE) when it should start charging.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
