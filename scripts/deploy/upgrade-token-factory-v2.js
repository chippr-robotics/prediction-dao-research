/**
 * Spec 028 expansion (Phase 9 / P2-a): upgrade an already-deployed TokenFactory proxy IN PLACE to the v2 impl
 * (adds the role-based v2 template slots + create entrypoints, append-only storage), deploy the three role-based
 * v2 clone templates, and register them via setV2Template. Existing v1 tokens (immutable clones) are untouched.
 *
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/upgrade-token-factory-v2.js --network mordor
 *
 * Then: npm run sync:frontend-contracts:<net>. Requires the deployer to hold UPGRADER_ROLE + DEFAULT_ADMIN_ROLE
 * on the factory (the floppy admin / .env fallback that deployed it).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { SALT_PREFIXES } = require("./lib/constants");
const { generateSalt, deployDeterministic, ensureSingletonFactory, saveDeployment, getDeploymentFilename } = require("./lib/helpers");
const { upgradeProxy } = require("./lib/upgradeable");

const STANDARD = { OPEN_ERC20: 0, OPEN_ERC721: 1, RESTRICTED_ERC1404: 2 };

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const [deployer] = await ethers.getSigners();
  console.log(`Token v2 upgrade on ${networkName} (chainId ${Number(network.chainId)}) — deployer ${deployer.address}`);

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) throw new Error(`No deployment record at deployments/${filename}`);
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const c = record.contracts || {};
  if (!c.tokenFactory || !ethers.isAddress(c.tokenFactory)) {
    throw new Error(`No tokenFactory proxy in deployments/${filename} — deploy the v1 factory first.`);
  }

  await ensureSingletonFactory();

  // 1) Upgrade the factory proxy in place (validates append-only storage against the deployed impl).
  console.log(`\nUpgrading TokenFactory proxy ${c.tokenFactory} to v2 impl...`);
  const upgraded = await upgradeProxy({ name: "TokenFactory", proxyAddress: c.tokenFactory });
  if (typeof deployer.reset === "function") deployer.reset();
  c.tokenFactoryImpl = upgraded.implementation;
  const factory = upgraded.contract;

  // 2) Deploy the three role-based v2 templates (immutable; constructors disable initializers).
  console.log("\nDeploying v2 templates...");
  const open20 = await deployDeterministic("OpenERC20V2", [], generateSalt(SALT_PREFIXES.V2 + "OpenERC20V2"), deployer);
  const open721 = await deployDeterministic("OpenERC721V2", [], generateSalt(SALT_PREFIXES.V2 + "OpenERC721V2"), deployer);
  const restricted20 = await deployDeterministic("RestrictedERC20V2", [], generateSalt(SALT_PREFIXES.V2 + "RestrictedERC20V2"), deployer);

  // 3) Register the v2 templates (admin).
  console.log("\nRegistering v2 templates via setV2Template...");
  await (await factory.connect(deployer).setV2Template(STANDARD.OPEN_ERC20, open20.address)).wait();
  await (await factory.connect(deployer).setV2Template(STANDARD.OPEN_ERC721, open721.address)).wait();
  await (await factory.connect(deployer).setV2Template(STANDARD.RESTRICTED_ERC1404, restricted20.address)).wait();

  // 4) Append the new addresses to the record (preserve everything else).
  c.openERC20V2Impl = open20.address;
  c.openERC721V2Impl = open721.address;
  c.restrictedERC20V2Impl = restricted20.address;
  record.constructorArgs = record.constructorArgs || {};
  Object.assign(record.constructorArgs, {
    tokenFactoryImpl: [],
    openERC20V2Impl: [],
    openERC721V2Impl: [],
    restrictedERC20V2Impl: [],
  });
  record.tokenV2UpgradedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  tokenFactoryImpl (new)  ${c.tokenFactoryImpl}`);
  console.log(`  openERC20V2Impl         ${c.openERC20V2Impl}`);
  console.log(`  openERC721V2Impl        ${c.openERC721V2Impl}`);
  console.log(`  restrictedERC20V2Impl   ${c.restrictedERC20V2Impl}`);
  console.log(`\nNext: npm run sync:frontend-contracts${networkName === "mordor" ? "" : ":" + networkName}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
