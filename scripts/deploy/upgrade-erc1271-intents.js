/**
 * Spec 041 T013 — ship the ERC-1271 intent-signer enablement as IN-PLACE upgrades
 * (the SignerIntentBase change is logic-only: no storage changes, no typehash changes,
 * no reinitializers — the EIP-712 domains are already set).
 *
 *   1. WagerRegistry proxy → new implementation (inherits the updated SignerIntentBase).
 *   2. Redeploy the WagerRegistryIntents extension facet + re-point setIntentExtension
 *      (both facets MUST carry the same verification logic — house rule, specs 035/041).
 *   3. MembershipManager proxy → new implementation (same inherited change).
 *   4. Where a WagerPoolFactory exists: deploy a NEW WagerPool template and setTemplate,
 *      so FUTURE pool clones accept ERC-1271 …WithSig intents. EXISTING clones are
 *      immutable and stay ECDSA-only for the WithSig twins (documented limitation —
 *      passkey accounts still act on old pools via direct account transactions).
 *
 *   GAS_PRICE_WEI=... npx hardhat run scripts/deploy/upgrade-erc1271-intents.js --network <amoy|polygon|...>
 *
 * Storage safety: `npm run check:storage-layout` MUST be green first (CI-gating);
 * upgradeProxy re-validates append-only compatibility against the deployed impl on-chain.
 * Requires the deployer to hold UPGRADER_ROLE on both proxies and DEFAULT_ADMIN_ROLE on
 * the pool factory (floppy admin / .env fallback).
 * Then: npm run sync:frontend-contracts:<net>.
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
    `ERC-1271 intents upgrade on ${networkName} (chainId ${Number(network.chainId)}) — deployer ${deployer.address}`
  );

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) throw new Error(`No deployment record at deployments/${filename}`);
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const c = record.contracts || {};
  if (!c.wagerRegistry || !ethers.isAddress(c.wagerRegistry)) {
    throw new Error(`No wagerRegistry proxy in deployments/${filename}.`);
  }
  if (!c.membershipManager || !ethers.isAddress(c.membershipManager)) {
    throw new Error(`No membershipManager proxy in deployments/${filename}.`);
  }

  // 1) WagerRegistry main facet: in-place upgrade (append-only storage validated on the way).
  console.log(`\nUpgrading WagerRegistry proxy ${c.wagerRegistry}...`);
  const regUpgrade = await upgradeProxy({ name: "WagerRegistry", proxyAddress: c.wagerRegistry });
  c.wagerRegistryImpl = regUpgrade.implementation;

  // 2) Intents facet: redeploy + re-point (facet pair must share verification logic).
  console.log("\nRedeploying WagerRegistryIntents extension facet...");
  const IntentsFactory = await ethers.getContractFactory("WagerRegistryIntents");
  const intents = await IntentsFactory.deploy();
  await intents.waitForDeployment();
  const intentsAddress = await intents.getAddress();
  await (await regUpgrade.contract.connect(deployer).setIntentExtension(intentsAddress)).wait();
  c.wagerRegistryIntents = intentsAddress;
  console.log(`  ✓ WagerRegistryIntents facet: ${intentsAddress}`);

  // 3) MembershipManager: in-place upgrade — logic-only, NO reinitializer this time.
  console.log(`\nUpgrading MembershipManager proxy ${c.membershipManager}...`);
  const mgrUpgrade = await upgradeProxy({ name: "MembershipManager", proxyAddress: c.membershipManager });
  c.membershipManagerImpl = mgrUpgrade.implementation;

  // 4) Pool template for FUTURE clones (existing clones are immutable by design).
  if (c.wagerPoolFactory && ethers.isAddress(c.wagerPoolFactory)) {
    console.log(`\nDeploying new WagerPool template for factory ${c.wagerPoolFactory}...`);
    const Pool = await ethers.getContractFactory("WagerPool");
    const pool = await Pool.deploy();
    await pool.waitForDeployment();
    const poolImplAddress = await pool.getAddress();
    const factory = await ethers.getContractAt("WagerPoolFactory", c.wagerPoolFactory);
    await (await factory.connect(deployer).setTemplate(poolImplAddress)).wait();
    c.poolImpl = poolImplAddress;
    console.log(`  ✓ WagerPool template (ERC-1271-capable, future clones only): ${poolImplAddress}`);
  } else {
    console.log("\nNo wagerPoolFactory on this network — skipping pool template refresh.");
  }

  record.constructorArgs = record.constructorArgs || {};
  Object.assign(record.constructorArgs, {
    wagerRegistryImpl: [],
    wagerRegistryIntents: [],
    membershipManagerImpl: [],
    ...(c.poolImpl ? { poolImpl: [] } : {}),
  });
  record.erc1271IntentsUpgradedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  wagerRegistryImpl (new)     ${c.wagerRegistryImpl}`);
  console.log(`  wagerRegistryIntents (new)  ${c.wagerRegistryIntents}`);
  console.log(`  membershipManagerImpl (new) ${c.membershipManagerImpl}`);
  if (c.poolImpl) console.log(`  poolImpl (new template)     ${c.poolImpl}`);
  console.log(`\nNext: npm run sync:frontend-contracts${networkName === "mordor" ? "" : ":" + networkName}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
