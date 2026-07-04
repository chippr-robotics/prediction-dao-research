/**
 * Targeted spec-034 deploy: add the WagerPools factory (+ its immutable pool clone template) to an
 * ALREADY-deployed network WITHOUT touching the existing core contracts. Reuses the network's recorded
 * SanctionsGuard (and, when enabled, MembershipManager) and APPENDS the new addresses to its
 * `deployments/<net>-chain<id>-v2.json` record (never overwrites the live UUPS proxies).
 *
 *   GAS_PRICE_WEI=30000000000 npx hardhat run scripts/deploy/deploy-wager-pool-factory.js --network amoy
 *
 * Then: npm run sync:frontend-contracts -- --network <name> --chainId <id>  (frontend reads the address),
 * and publish the subgraph for the network.
 *
 * WagerPools are address-based (spec 034 redesign) — there is NO Semaphore / anonymity primitive.
 * Membership and voting are by public wallet address, so every network (including ETC/Mordor) deploys
 * the factory the same way, with no Semaphore prerequisite.
 *
 * Config / env:
 *   - Per-network USDC (the default buy-in asset) comes from scripts/deploy/lib/wagerPoolConfig.js and
 *     is used only for logging/validation — the factory takes no token at init (token is per-createPool).
 *   - Compliance (FR-021): the SanctionsGuard is ALWAYS wired (screening on). Membership gating
 *     (POOL_PARTICIPANT_ROLE) is OFF by default to avoid bricking participation before that role's
 *     tiers are configured; enable it with POOL_ENABLE_MEMBERSHIP=1 (uses the recorded
 *     membershipManager) or POOL_MEMBERSHIP_MANAGER=0x...
 *   - screeningRequired defaults to true on mainnets (137, 61), false on testnets (incl. 63, 80002);
 *     override with POOL_SCREENING_REQUIRED=1|0. When true, both guards MUST be non-zero (init reverts
 *     otherwise).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { SALT_PREFIXES } = require("./lib/constants");
const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  saveDeployment,
  getDeploymentFilename,
} = require("./lib/helpers");
const { deployProxy } = require("./lib/upgradeable");
const { getWagerPoolConfig } = require("./lib/wagerPoolConfig");

const MAINNETS = new Set([137, 61]);

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(60));
  console.log(`WagerPools (spec 034) — address-based, targeted append-only deploy`);
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)}`);

  const cfg = getWagerPoolConfig(chainId);
  if (cfg.usdc && !ethers.isAddress(cfg.usdc)) {
    throw new Error(`WagerPools: invalid USDC address for chain ${chainId} in wagerPoolConfig.js: ${cfg.usdc}`);
  }
  console.log(`USDC (default buy-in): ${cfg.usdc || "(unset — set POOL_USDC_" + chainId + ")"}`);

  // --- Load the existing deployment record; we APPEND to it ---
  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No existing deployment record at deployments/${filename}. Run the core deploy first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || (record.contracts = {});

  const sanctionsGuard = contracts.sanctionsGuard;
  if (!sanctionsGuard || !ethers.isAddress(sanctionsGuard)) {
    throw new Error(`No sanctionsGuard in deployments/${filename}; pools require sanctions screening (FR-021a).`);
  }
  console.log(`SanctionsGuard: ${sanctionsGuard}`);

  // --- Compliance posture ---
  let membershipManager = ethers.ZeroAddress;
  if (process.env.POOL_MEMBERSHIP_MANAGER && ethers.isAddress(process.env.POOL_MEMBERSHIP_MANAGER)) {
    membershipManager = process.env.POOL_MEMBERSHIP_MANAGER;
  } else if (process.env.POOL_ENABLE_MEMBERSHIP === "1") {
    if (!contracts.membershipManager || !ethers.isAddress(contracts.membershipManager)) {
      throw new Error(`POOL_ENABLE_MEMBERSHIP=1 but no membershipManager in deployments/${filename}.`);
    }
    membershipManager = contracts.membershipManager;
  }
  const screeningRequired =
    process.env.POOL_SCREENING_REQUIRED != null
      ? process.env.POOL_SCREENING_REQUIRED === "1"
      : MAINNETS.has(chainId);
  console.log(`Membership gate: ${membershipManager === ethers.ZeroAddress ? "OFF (open participation)" : membershipManager}`);
  console.log(`screeningRequired: ${screeningRequired}`);
  if (screeningRequired && membershipManager === ethers.ZeroAddress) {
    throw new Error(
      `screeningRequired=true requires a membership manager (FR-021b). Configure POOL_PARTICIPANT_ROLE tiers ` +
        `then set POOL_ENABLE_MEMBERSHIP=1, or set POOL_SCREENING_REQUIRED=0 for an open testnet launch.`
    );
  }

  if (contracts.wagerPoolFactory) {
    console.log(`\n⚠️  wagerPoolFactory already recorded (${contracts.wagerPoolFactory}). To change logic, run an`);
    console.log(`   in-place upgrade (lib/upgradeable.js upgradeProxy), not this script. Aborting.`);
    return;
  }

  await ensureSingletonFactory();

  // 1) Immutable pool clone template (deterministic; constructor disables initializers).
  console.log("\nDeploying WagerPool template...");
  const poolImpl = await deployDeterministic(
    "WagerPool",
    [],
    generateSalt(SALT_PREFIXES.V2 + "WagerPool"),
    deployer
  );

  // 2) WagerPoolFactory behind a UUPS proxy, wired to the existing guard(s). No Semaphore arg.
  console.log("\nDeploying WagerPoolFactory behind a UUPS proxy...");
  const proxy = await deployProxy({
    name: "WagerPoolFactory",
    initArgs: [deployer.address, poolImpl.address, sanctionsGuard, membershipManager, screeningRequired],
  });

  // 2b) Allowlist the canonical buy-in token (FR-024). On value-bearing networks createPool is gated on
  //     this list, so the freshly-deployed factory is unusable until the token is allowed — do it here as
  //     the admin (the deployer). `proxy.contract` is already connected to that signer.
  if (cfg.usdc && ethers.isAddress(cfg.usdc)) {
    console.log(`\nAllowlisting buy-in token (USDC) ${cfg.usdc} (FR-024)...`);
    const tx = await proxy.contract.setAllowedToken(cfg.usdc, true);
    await tx.wait();
    console.log("  token allowlisted");
  } else if (screeningRequired) {
    console.warn(
      `\nWARNING: screeningRequired=true but POOL_USDC_${chainId} is unset — createPool will revert with ` +
        `TokenNotAllowed until an admin calls setAllowedToken(<usdc>, true).`
    );
  }

  if (typeof deployer.reset === "function") deployer.reset();

  // 3) APPEND to the record (preserve everything already there).
  contracts.wagerPoolFactory = proxy.proxy;
  contracts.wagerPoolFactoryImpl = proxy.implementation;
  contracts.poolImpl = poolImpl.address;
  record.constructorArgs = record.constructorArgs || {};
  Object.assign(record.constructorArgs, { wagerPoolFactoryImpl: [], poolImpl: [] });
  record.wagerPoolsDeployedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  wagerPoolFactory      ${contracts.wagerPoolFactory}`);
  console.log(`  wagerPoolFactoryImpl  ${contracts.wagerPoolFactoryImpl}`);
  console.log(`  poolImpl              ${contracts.poolImpl}`);
  console.log(`\nNext: npm run sync:frontend-contracts -- --network ${networkName} --chainId ${chainId}`);
  console.log(`Then: publish the subgraph for ${networkName}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
