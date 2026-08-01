/**
 * Targeted spec-073 deploy: add the MiniAppRegistry to an ALREADY-deployed network WITHOUT touching
 * existing core contracts. Reuses the network's recorded MembershipManager + SanctionsGuard and APPENDS
 * the new addresses to its `deployments/<net>-chain<id>-v2.json` record (never overwrites).
 *
 * The registry is a single UUPS proxy (UUPSManaged); it holds no funds. It is the catalog and the
 * curation authority for the mini-app platform: hosts read it at launch, fetch ONLY a record's
 * `approved` package tuple, and verify its manifest hash before executing a single byte.
 *
 * Vendor eligibility is a tier gate on WAGER_PARTICIPANT_ROLE (the only user-purchasable role),
 * defaulting to Silver — high enough that listing is a deliberate act, low enough that it is not a
 * second curation gate. Curation itself is APP_CURATOR_ROLE, which is the platform's supply-chain
 * trust boundary: this script self-grants it to the deployer ONLY so first-party apps can be seeded,
 * and prints the handover reminder. Transfer it to the compliance multisig before opening submissions.
 *
 *   MINIAPP_MIN_TIER=2 npx hardhat run scripts/deploy/deploy-miniapp-registry.js --network mordor
 *   npx hardhat run scripts/deploy/deploy-miniapp-registry.js --network polygon
 *
 * Then: npm run sync:frontend-contracts  (frontend picks up the miniAppRegistry address).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");
const { deployProxy } = require("./lib/upgradeable");

const WAGER_PARTICIPANT_ROLE = ethers.id("WAGER_PARTICIPANT_ROLE");
// IMembershipManager.Tier ordinals: None 0, Bronze 1, Silver 2, Gold 3, Platinum 4.
const DEFAULT_MIN_TIER = 2; // Silver

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();

  const minTier = Number(process.env.MINIAPP_MIN_TIER ?? DEFAULT_MIN_TIER);
  if (!Number.isInteger(minTier) || minTier < 0 || minTier > 4) {
    throw new Error(`MINIAPP_MIN_TIER must be a Tier ordinal 0-4 (got ${process.env.MINIAPP_MIN_TIER}).`);
  }

  console.log("=".repeat(60));
  console.log("Mini-App Registry (spec 073) — targeted deploy");
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

  const membershipManager = contracts.membershipManager;
  if (!membershipManager || !ethers.isAddress(membershipManager)) {
    throw new Error(`No membershipManager in deployments/${filename}; cannot wire the vendor tier gate.`);
  }
  // SanctionsGuard is optional (e.g. Mordor without a Chainalysis oracle) — pass zero to disable screening.
  const sanctionsGuard = contracts.sanctionsGuard && ethers.isAddress(contracts.sanctionsGuard)
    ? contracts.sanctionsGuard
    : ethers.ZeroAddress;
  console.log(`Reusing MembershipManager: ${membershipManager}`);
  console.log(`SanctionsGuard:            ${sanctionsGuard === ethers.ZeroAddress ? "(disabled)" : sanctionsGuard}`);
  console.log(`Vendor tier floor:         ${minTier} (0=None 1=Bronze 2=Silver 3=Gold 4=Platinum)`);

  if (contracts.miniAppRegistry) {
    console.log(`\n⚠️  miniAppRegistry already recorded (${contracts.miniAppRegistry}). To change logic,`);
    console.log(`   run an in-place upgrade (lib/upgradeable.js upgradeProxy), not this script. Aborting.`);
    return;
  }

  console.log("\nDeploying MiniAppRegistry behind a UUPS proxy...");
  const proxy = await deployProxy({
    name: "MiniAppRegistry",
    initArgs: [deployer.address, membershipManager, WAGER_PARTICIPANT_ROLE, minTier, sanctionsGuard],
  });

  // Seed curation. The deployer holds DEFAULT_ADMIN_ROLE from initialize but NOT the curator role —
  // it is granted deliberately here so the first-party apps can be approved, and handed over after.
  const reg = proxy.contract;
  const curatorRole = await reg.APP_CURATOR_ROLE();
  await (await reg.grantRole(curatorRole, deployer.address)).wait();
  console.log(`  ✓ granted APP_CURATOR_ROLE to the deployer (seeding only)`);

  // APPEND to the record (preserve everything already there).
  contracts.miniAppRegistry = proxy.proxy;
  contracts.miniAppRegistryImpl = proxy.implementation;
  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.miniAppRegistryImpl = [];
  record.miniAppRegistryDeployedAt = new Date().toISOString();
  const deployBlock = await ethers.provider.getBlockNumber();
  record.deployBlocks = record.deployBlocks || {};
  record.deployBlocks.miniAppRegistry = deployBlock;
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  miniAppRegistry     ${contracts.miniAppRegistry}`);
  console.log(`  miniAppRegistryImpl ${contracts.miniAppRegistryImpl}`);
  console.log(`  deployBlock         ${deployBlock}`);
  console.log(`\n⚠️  HANDOVER REQUIRED — APP_CURATOR_ROLE decides what code operations staff execute.`);
  console.log(`   Grant it to the compliance multisig and renounce the deployer's copy:`);
  console.log(`     reg.grantRole("${curatorRole}", <multisig>)`);
  console.log(`     reg.renounceRole("${curatorRole}", "${deployer.address}")`);
  console.log(`\nNext: npm run sync:frontend-contracts (frontend reads the address)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
