/**
 * Spec 035/036 Tier 2 (gasless group pools): upgrade the live WagerPoolFactory UUPS proxy IN PLACE,
 * adding the factory-forwarder relayer surface — createPoolWithSig + the nine …WithSigFor / …For
 * forwarders + SignerIntentBase. Runs `initializeIntents` (reinitializer(2)) during the upgrade to set
 * the "FairWins WagerPoolFactory" EIP-712 domain that createPoolWithSig verifies against.
 *
 *   GAS_PRICE_WEI=... npx hardhat run scripts/deploy/upgrade-pool-factory-intents.js --network <mordor|polygon>
 *
 * Storage safety: APPEND-ONLY (SignerIntentBase is ERC-7201 namespaced — zero sequential slots, __gap
 * untouched). `npm run check:storage-layout` MUST be green first (CI-gating); upgradeProxy re-validates
 * append-only compatibility against the deployed impl before anything goes on-chain. Requires the
 * deployer to hold the proxy's upgrade authority (floppy admin / .env fallback).
 * Then: npm run sync:frontend-contracts:<net> (refresh the factory ABI) and commit the updated
 * deployments/ record + .openzeppelin manifest.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");
const { upgradeProxy } = require("./lib/upgradeable");

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const [deployer] = await ethers.getSigners();
  console.log(
    `Tier-2 pool-factory upgrade on ${networkName} (chainId ${Number(network.chainId)}) — deployer ${deployer.address}`
  );

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) throw new Error(`No deployment record at deployments/${filename}`);
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const c = record.contracts || {};
  if (!c.wagerPoolFactory || !ethers.isAddress(c.wagerPoolFactory)) {
    throw new Error(
      `No wagerPoolFactory proxy in deployments/${filename} — deploy it first (deploy-wager-pool-factory.js).`
    );
  }

  console.log(`\nUpgrading WagerPoolFactory proxy ${c.wagerPoolFactory}...`);
  const upgrade = await upgradeProxy({
    name: "WagerPoolFactory",
    proxyAddress: c.wagerPoolFactory,
    call: { fn: "initializeIntents", args: [] },
  });
  c.wagerPoolFactoryImpl = upgrade.implementation;

  // Sanity: the factory's EIP-712 domain must now be live (createPoolWithSig verifies against it), and
  // the forwarder surface reachable. A non-zero DOMAIN_SEPARATOR confirms initializeIntents ran.
  const factory = await ethers.getContractAt("WagerPoolFactory", c.wagerPoolFactory);
  const sep = await factory.DOMAIN_SEPARATOR();
  if (!sep || sep === ethers.ZeroHash) throw new Error("DOMAIN_SEPARATOR is zero — initializeIntents did not run");
  console.log(`  ✓ EIP-712 domain wired (DOMAIN_SEPARATOR ${sep.slice(0, 10)}…)`);

  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.wagerPoolFactoryImpl = [];
  record.tier2PoolIntentsUpgradedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  wagerPoolFactory (proxy)    ${c.wagerPoolFactory}`);
  console.log(`  wagerPoolFactoryImpl (new)  ${c.wagerPoolFactoryImpl}`);
  console.log(`\nNext: npm run sync:frontend-contracts${networkName === "mordor" ? "" : ":" + networkName}`);
  console.log("Then add the factory to the relayer engine whitelist + redeploy the gateway (see PR).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
