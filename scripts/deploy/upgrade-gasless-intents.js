/**
 * Spec 035 (gasless intents): upgrade the two live UUPS proxies IN PLACE and wire the intents facet.
 *
 *   1. WagerRegistry proxy → new implementation (actor-threaded internals + fallback→extension;
 *      append-only storage: fee scalars + intentExtension, __gap 48→45). No reinitializer — the
 *      EIP-712 domain was already set by the feature-024 upgrade.
 *   2. Deploy the WagerRegistryIntents extension facet and point the proxy at it via
 *      setIntentExtension (UPGRADER_ROLE — same authority as the upgrade itself).
 *   3. MembershipManager proxy → new implementation (signer-attributed twins inline; append-only
 *      storage: fee scalars, __gap 49→47), running `initializeIntents` (reinitializer(2)) during
 *      the upgrade to set the "FairWins MembershipManager" EIP-712 domain.
 *
 *   GAS_PRICE_WEI=... npx hardhat run scripts/deploy/upgrade-gasless-intents.js --network <amoy|mordor|...>
 *
 * Storage safety: `npm run check:storage-layout` MUST be green first (CI-gating); upgradeProxy
 * re-validates append-only compatibility against the deployed impl before anything goes on-chain.
 * Requires the deployer to hold UPGRADER_ROLE on both proxies (floppy admin / .env fallback).
 * Then: npm run sync:frontend-contracts:<net>, and optionally scripts/operations/set-fee-netting.js.
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
  console.log(`Gasless-intents upgrade on ${networkName} (chainId ${Number(network.chainId)}) — deployer ${deployer.address}`);

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) throw new Error(`No deployment record at deployments/${filename}`);
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const c = record.contracts || {};
  if (!c.wagerRegistry || !ethers.isAddress(c.wagerRegistry)) {
    throw new Error(`No wagerRegistry proxy in deployments/${filename} — this network is pre-UUPS (spec 025 migration required first).`);
  }
  if (!c.membershipManager || !ethers.isAddress(c.membershipManager)) {
    throw new Error(`No membershipManager proxy in deployments/${filename} — spec 027 migration required first.`);
  }

  // 1) WagerRegistry: in-place upgrade (validates append-only storage against the deployed impl).
  console.log(`\nUpgrading WagerRegistry proxy ${c.wagerRegistry}...`);
  const regUpgrade = await upgradeProxy({ name: "WagerRegistry", proxyAddress: c.wagerRegistry });
  c.wagerRegistryImpl = regUpgrade.implementation;

  // 2) Deploy + wire the intents extension facet (twins + relocated batchExpireOpen/autoResolve*).
  console.log("\nDeploying WagerRegistryIntents extension facet...");
  const IntentsFactory = await ethers.getContractFactory("WagerRegistryIntents");
  const intents = await IntentsFactory.deploy();
  await intents.waitForDeployment();
  const intentsAddress = await intents.getAddress();
  console.log(`  ✓ WagerRegistryIntents facet: ${intentsAddress}`);

  console.log("Pointing the proxy fallback at the facet (setIntentExtension)...");
  await (await regUpgrade.contract.connect(deployer).setIntentExtension(intentsAddress)).wait();
  c.wagerRegistryIntents = intentsAddress;

  // 3) MembershipManager: in-place upgrade + one-time EIP-712 domain init (reinitializer(2)).
  console.log(`\nUpgrading MembershipManager proxy ${c.membershipManager}...`);
  const mgrUpgrade = await upgradeProxy({
    name: "MembershipManager",
    proxyAddress: c.membershipManager,
    call: { fn: "initializeIntents", args: [] },
  });
  c.membershipManagerImpl = mgrUpgrade.implementation;

  record.constructorArgs = record.constructorArgs || {};
  Object.assign(record.constructorArgs, {
    wagerRegistryImpl: [],
    wagerRegistryIntents: [],
    membershipManagerImpl: [],
  });
  record.gaslessIntentsUpgradedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  wagerRegistryImpl (new)     ${c.wagerRegistryImpl}`);
  console.log(`  wagerRegistryIntents (new)  ${c.wagerRegistryIntents}`);
  console.log(`  membershipManagerImpl (new) ${c.membershipManagerImpl}`);
  console.log(`\nNext: npm run sync:frontend-contracts${networkName === "mordor" ? "" : ":" + networkName}`);
  console.log("Optional: enable fee netting via scripts/operations/set-fee-netting.js");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
