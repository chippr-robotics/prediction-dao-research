/**
 * Targeted spec-034 deploy: add the ZK-Wager Pools factory (+ its immutable pool clone template) to an
 * ALREADY-deployed network WITHOUT touching the existing core contracts. Reuses the network's recorded
 * SanctionsGuard (and, when enabled, MembershipManager) and APPENDS the new addresses to its
 * `deployments/<net>-chain<id>-v2.json` record (never overwrites the live UUPS proxies).
 *
 *   GAS_PRICE_WEI=30000000000 npx hardhat run scripts/deploy/deploy-zk-wager-pool-factory.js --network amoy
 *
 * Then: npm run sync:frontend-contracts -- --network <name> --chainId <id>  (frontend reads the address),
 * and publish the subgraph for the network.
 *
 * Config / env:
 *   - Semaphore address comes from scripts/deploy/lib/zkPoolConfig.js (canonical singleton on
 *     Amoy/Polygon). On ETC/Mordor it is null (self-deploy required) — set ZKPOOL_SEMAPHORE_<chainId>
 *     to the self-deployed Semaphore, or the script aborts.
 *   - Compliance (FR-021): the SanctionsGuard is ALWAYS wired (screening on). Membership gating
 *     (POOL_PARTICIPANT_ROLE) is OFF by default to avoid bricking participation before that role's
 *     tiers are configured; enable it with ZKPOOL_ENABLE_MEMBERSHIP=1 (uses the recorded
 *     membershipManager) or ZKPOOL_MEMBERSHIP_MANAGER=0x...
 *   - screeningRequired defaults to true on mainnets (137, 61), false on testnets; override with
 *     ZKPOOL_SCREENING_REQUIRED=1|0. When true, both guards MUST be non-zero (init reverts otherwise).
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
const { getZkPoolConfig } = require("./lib/zkPoolConfig");

const MAINNETS = new Set([137, 61]);

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(60));
  console.log(`ZK-Wager Pools (spec 034) — targeted append-only deploy`);
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)}`);

  const cfg = getZkPoolConfig(chainId);

  // --- Load the existing deployment record; we APPEND to it ---
  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No existing deployment record at deployments/${filename}. Run the core deploy first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || (record.contracts = {});

  // --- Resolve the Semaphore singleton (canonical on Amoy/Polygon; self-deploy on ETC/Mordor) ---
  // Precedence: explicit env override > the address self-deploy recorded > zkPoolConfig canonical.
  const semaphore =
    process.env[`ZKPOOL_SEMAPHORE_${chainId}`] || contracts.zkWagerPoolSemaphore || cfg.semaphore;
  if (!semaphore || !ethers.isAddress(semaphore)) {
    throw new Error(
      cfg.selfDeploySemaphore
        ? `No Semaphore on chain ${chainId}. Run scripts/deploy/deploy-semaphore.js first ` +
          `(records zkWagerPoolSemaphore), or set ZKPOOL_SEMAPHORE_${chainId}.`
        : `No Semaphore address configured for chain ${chainId} in zkPoolConfig.js.`
    );
  }
  console.log(`Semaphore: ${semaphore}${cfg.selfDeploySemaphore ? " (self-deployed)" : " (canonical)"}`);

  const sanctionsGuard = contracts.sanctionsGuard;
  if (!sanctionsGuard || !ethers.isAddress(sanctionsGuard)) {
    throw new Error(`No sanctionsGuard in deployments/${filename}; pools require sanctions screening (FR-021a).`);
  }
  console.log(`SanctionsGuard: ${sanctionsGuard}`);

  // --- Compliance posture ---
  let membershipManager = ethers.ZeroAddress;
  if (process.env.ZKPOOL_MEMBERSHIP_MANAGER && ethers.isAddress(process.env.ZKPOOL_MEMBERSHIP_MANAGER)) {
    membershipManager = process.env.ZKPOOL_MEMBERSHIP_MANAGER;
  } else if (process.env.ZKPOOL_ENABLE_MEMBERSHIP === "1") {
    if (!contracts.membershipManager || !ethers.isAddress(contracts.membershipManager)) {
      throw new Error(`ZKPOOL_ENABLE_MEMBERSHIP=1 but no membershipManager in deployments/${filename}.`);
    }
    membershipManager = contracts.membershipManager;
  }
  const screeningRequired =
    process.env.ZKPOOL_SCREENING_REQUIRED != null
      ? process.env.ZKPOOL_SCREENING_REQUIRED === "1"
      : MAINNETS.has(chainId);
  console.log(`Membership gate: ${membershipManager === ethers.ZeroAddress ? "OFF (open participation)" : membershipManager}`);
  console.log(`screeningRequired: ${screeningRequired}`);
  if (screeningRequired && membershipManager === ethers.ZeroAddress) {
    throw new Error(
      `screeningRequired=true requires a membership manager (FR-021b). Configure POOL_PARTICIPANT_ROLE tiers ` +
        `then set ZKPOOL_ENABLE_MEMBERSHIP=1, or set ZKPOOL_SCREENING_REQUIRED=0 for an open testnet launch.`
    );
  }

  if (contracts.zkWagerPoolFactory) {
    console.log(`\n⚠️  zkWagerPoolFactory already recorded (${contracts.zkWagerPoolFactory}). To change logic, run an`);
    console.log(`   in-place upgrade (lib/upgradeable.js upgradeProxy), not this script. Aborting.`);
    return;
  }

  await ensureSingletonFactory();

  // 1) Immutable pool clone template (deterministic; constructor disables initializers).
  console.log("\nDeploying ZKWagerPool template...");
  const poolImpl = await deployDeterministic(
    "ZKWagerPool",
    [],
    generateSalt(SALT_PREFIXES.V2 + "ZKWagerPool"),
    deployer
  );

  // 2) ZKWagerPoolFactory behind a UUPS proxy, wired to Semaphore + the existing guard(s).
  console.log("\nDeploying ZKWagerPoolFactory behind a UUPS proxy...");
  const proxy = await deployProxy({
    name: "ZKWagerPoolFactory",
    initArgs: [deployer.address, poolImpl.address, semaphore, sanctionsGuard, membershipManager, screeningRequired],
  });
  if (typeof deployer.reset === "function") deployer.reset();

  // 3) APPEND to the record (preserve everything already there).
  contracts.zkWagerPoolFactory = proxy.proxy;
  contracts.zkWagerPoolFactoryImpl = proxy.implementation;
  contracts.poolImpl = poolImpl.address;
  contracts.zkWagerPoolSemaphore = semaphore;
  record.constructorArgs = record.constructorArgs || {};
  Object.assign(record.constructorArgs, { zkWagerPoolFactoryImpl: [], poolImpl: [] });
  record.zkWagerPoolsDeployedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  zkWagerPoolFactory      ${contracts.zkWagerPoolFactory}`);
  console.log(`  zkWagerPoolFactoryImpl  ${contracts.zkWagerPoolFactoryImpl}`);
  console.log(`  poolImpl                ${contracts.poolImpl}`);
  console.log(`  semaphore               ${semaphore}`);
  console.log(`\nNext: npm run sync:frontend-contracts -- --network ${networkName} --chainId ${chainId}`);
  console.log(`Then: publish the subgraph for ${networkName}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
