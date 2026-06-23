/**
 * Spec 028 expansion: (re)deploy the role-based v2 clone templates and register any that changed via
 * setV2Template — WITHOUT upgrading the factory impl. Use after a v2 TEMPLATE's logic changes (before any tokens
 * use it). Deterministic deploys are idempotent: unchanged bytecode keeps its CREATE2 address (skipped); changed
 * bytecode gets a new address and is re-registered. Existing issued tokens (immutable clones) are unaffected.
 *
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/sync-token-templates-v2.js --network mordor
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { SALT_PREFIXES } = require("./lib/constants");
const { generateSalt, deployDeterministic, ensureSingletonFactory, saveDeployment, getDeploymentFilename } = require("./lib/helpers");

const TEMPLATES = [
  { name: "OpenERC20V2", key: "openERC20V2Impl", standard: 0 },
  { name: "OpenERC721V2", key: "openERC721V2Impl", standard: 1 },
  { name: "RestrictedERC20V2", key: "restrictedERC20V2Impl", standard: 2 },
];

async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const c = record.contracts;
  if (!c.tokenFactory) throw new Error(`No tokenFactory in deployments/${filename}`);

  await ensureSingletonFactory();
  const factory = await ethers.getContractAt("TokenFactory", c.tokenFactory);

  for (const t of TEMPLATES) {
    const d = await deployDeterministic(t.name, [], generateSalt(SALT_PREFIXES.V2 + t.name), deployer);
    const onChain = await factory[t.key]();
    if (onChain.toLowerCase() !== d.address.toLowerCase()) {
      console.log(`Registering ${t.name} -> ${d.address} (was ${onChain})`);
      await (await factory.connect(deployer).setV2Template(t.standard, d.address)).wait();
    } else {
      console.log(`${t.name} unchanged (${d.address})`);
    }
    c[t.key] = d.address;
  }

  record.tokenV2TemplatesSyncedAt = new Date().toISOString();
  saveDeployment(filename, record);
  console.log(`\nSynced v2 templates into deployments/${filename}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
