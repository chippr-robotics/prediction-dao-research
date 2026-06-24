/**
 * Targeted spec-030 deploy: add the ClearPath ExternalDAORegistry to an ALREADY-deployed network WITHOUT
 * touching existing core contracts. Reuses the network's recorded MembershipManager and APPENDS the new
 * addresses to its `deployments/<net>-chain<id>-v2.json` record (never overwrites).
 *
 * This deploys ONLY the external-DAO registry (pillar B of spec 030). Native standard DAOs are deferred:
 * OZ 5.4.0 GovernorUpgradeable pulls in the Cancun `mcopy` opcode (via SignatureChecker -> Bytes.sol) and is
 * not deployable on pre-Cancun ETC/Mordor (see memory `oz-governor-mcopy-mordor`). The registry imports only the
 * IGovernor INTERFACE, so it is paris-safe and deploys on Mordor + Amoy.
 *
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/deploy-clearpath.js --network mordor
 *   npx hardhat run scripts/deploy/deploy-clearpath.js --network amoy
 *
 * Then: npm run sync:frontend-contracts  (frontend picks up the externalDAORegistry address).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");
const { deployProxy } = require("./lib/upgradeable");

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(60));
  console.log("ClearPath (spec 030) — ExternalDAORegistry targeted deploy");
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)}`);

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No existing deployment record at deployments/${filename}. Run the core deploy first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || (record.contracts = {});

  const membershipManager = contracts.membershipManager;
  if (!membershipManager || !ethers.isAddress(membershipManager)) {
    throw new Error(`No membershipManager in deployments/${filename}; cannot wire ClearPath tier gating.`);
  }
  console.log(`Reusing MembershipManager: ${membershipManager}`);

  if (contracts.externalDAORegistry) {
    console.log(`\n⚠️  externalDAORegistry already recorded (${contracts.externalDAORegistry}). To change logic,`);
    console.log(`   run an in-place upgrade (lib/upgradeable.js upgradeProxy), not this script. Aborting.`);
    return;
  }

  console.log("\nDeploying ExternalDAORegistry behind a UUPS proxy...");
  const proxy = await deployProxy({
    name: "ExternalDAORegistry",
    initArgs: [deployer.address, membershipManager],
  });

  // APPEND to the record (preserve everything already there).
  contracts.externalDAORegistry = proxy.proxy;
  contracts.externalDAORegistryImpl = proxy.implementation;
  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.externalDAORegistryImpl = [];
  record.clearpathDeployedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  externalDAORegistry     ${contracts.externalDAORegistry}`);
  console.log(`  externalDAORegistryImpl ${contracts.externalDAORegistryImpl}`);
  console.log(`\nNext: npm run sync:frontend-contracts (frontend reads the address)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
