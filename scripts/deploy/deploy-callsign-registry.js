/**
 * Targeted spec-054 deploy: add the CallsignRegistry to an ALREADY-deployed network WITHOUT touching
 * existing core contracts. Reuses the network's recorded MembershipManager + SanctionsGuard and APPENDS
 * the new addresses to its `deployments/<net>-chain<id>-v2.json` record (never overwrites).
 *
 * The registry is a single UUPS proxy (UUPSManaged + SignerIntentBase); it holds no funds. Eligibility is
 * the Gold-tier gate on WAGER_PARTICIPANT_ROLE (the only user-purchasable role). After deploy it seeds the
 * reserved-term list from config/reserved-callsigns.json (FR-004).
 *
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/deploy-callsign-registry.js --network mordor
 *   npx hardhat run scripts/deploy/deploy-callsign-registry.js --network polygon
 *
 * Then: npm run sync:frontend-contracts  (frontend picks up the callsignRegistry address).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");
const { deployProxy } = require("./lib/upgradeable");

const WAGER_PARTICIPANT_ROLE = ethers.id("WAGER_PARTICIPANT_ROLE");

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("Callsign Registry (spec 054) — targeted deploy");
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
    throw new Error(`No membershipManager in deployments/${filename}; cannot wire the Gold-tier gate.`);
  }
  // SanctionsGuard is optional (e.g. Mordor without a Chainalysis oracle) — pass zero to disable screening.
  const sanctionsGuard = contracts.sanctionsGuard && ethers.isAddress(contracts.sanctionsGuard)
    ? contracts.sanctionsGuard
    : ethers.ZeroAddress;
  console.log(`Reusing MembershipManager: ${membershipManager}`);
  console.log(`SanctionsGuard:            ${sanctionsGuard === ethers.ZeroAddress ? "(disabled)" : sanctionsGuard}`);

  if (contracts.callsignRegistry) {
    console.log(`\n⚠️  callsignRegistry already recorded (${contracts.callsignRegistry}). To change logic,`);
    console.log(`   run an in-place upgrade (lib/upgradeable.js upgradeProxy), not this script. Aborting.`);
    return;
  }

  console.log("\nDeploying CallsignRegistry behind a UUPS proxy...");
  const proxy = await deployProxy({
    name: "CallsignRegistry",
    initArgs: [deployer.address, membershipManager, sanctionsGuard, WAGER_PARTICIPANT_ROLE],
  });

  // Seed reserved terms (FR-004). Hash each canonical term; batch setReserved. Deployer holds
  // DEFAULT_ADMIN_ROLE from initialize but must self-grant REGISTRY_CURATOR_ROLE first.
  const reg = proxy.contract;
  const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config", "reserved-callsigns.json"), "utf8"));
  const terms = (seed.reserved || []).filter((t) => typeof t === "string" && t.length >= 3 && t.length <= 20);
  if (terms.length) {
    const curatorRole = await reg.REGISTRY_CURATOR_ROLE();
    await (await reg.grantRole(curatorRole, deployer.address)).wait();
    const hashes = terms.map((t) => ethers.keccak256(ethers.toUtf8Bytes(t)));
    await (await reg.setReserved(hashes, true)).wait();
    console.log(`  ✓ seeded ${hashes.length} reserved terms`);
  }

  // APPEND to the record (preserve everything already there).
  contracts.callsignRegistry = proxy.proxy;
  contracts.callsignRegistryImpl = proxy.implementation;
  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.callsignRegistryImpl = [];
  record.callsignRegistryDeployedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  callsignRegistry     ${contracts.callsignRegistry}`);
  console.log(`  callsignRegistryImpl ${contracts.callsignRegistryImpl}`);
  console.log(`\nNext: npm run sync:frontend-contracts (frontend reads the address)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
