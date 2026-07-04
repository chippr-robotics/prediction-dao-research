/**
 * Ops: resync the WagerPool clone template on an already-deployed network.
 *
 * The WagerPoolFactory (UUPS proxy) is upgradeable, but each pool is an IMMUTABLE ERC-1167 clone of the
 * recorded `poolImpl` template. To ship new pool logic you deploy a fresh WagerPool template and point the
 * factory at it via `setTemplate` — existing pools are unaffected; only pools created AFTER the swap use it.
 * (Contrast: the factory's OWN logic changes are an in-place UUPS upgrade.)
 *
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/set-pool-template.js --network mordor
 *
 * Requires: an existing deployments/<net>-chain<id>-v2.json with `wagerPoolFactory`, and the caller to be
 * the factory's DEFAULT_ADMIN_ROLE (the deployer). Deterministic template deploy — same salt, new address
 * (initcode changed). No-op if the freshly-built template already matches the recorded `poolImpl`.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { SALT_PREFIXES } = require("./lib/constants");
const { generateSalt, deployDeterministic, ensureSingletonFactory, getDeploymentFilename } = require("./lib/helpers");

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log(`WagerPool template resync — ${hre.network.name} (chainId ${chainId})`);
  console.log("=".repeat(60));
  console.log(`Deployer/admin: ${deployer.address}`);
  console.log(`Balance:        ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`);

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) throw new Error(`No deployment record at deployments/${filename}.`);
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || {};
  const factoryAddr = contracts.wagerPoolFactory;
  if (!factoryAddr || !ethers.isAddress(factoryAddr)) {
    throw new Error(`No wagerPoolFactory in deployments/${filename}; deploy the factory first.`);
  }
  console.log(`Factory:        ${factoryAddr}`);
  console.log(`Current poolImpl: ${contracts.poolImpl}`);

  await ensureSingletonFactory();

  console.log("\nDeploying fresh WagerPool template (deterministic; new code => new address)...");
  const poolImpl = await deployDeterministic("WagerPool", [], generateSalt(SALT_PREFIXES.V2 + "WagerPool"), deployer);
  console.log(`New template:   ${poolImpl.address}`);

  if (poolImpl.address.toLowerCase() === String(contracts.poolImpl).toLowerCase()) {
    console.log("\nTemplate already matches the recorded poolImpl — nothing to resync.");
    return;
  }

  const factory = await ethers.getContractAt("WagerPoolFactory", factoryAddr, deployer);
  const DEFAULT_ADMIN_ROLE = "0x" + "00".repeat(32);
  if (!(await factory.hasRole(DEFAULT_ADMIN_ROLE, deployer.address))) {
    throw new Error(`Deployer ${deployer.address} lacks DEFAULT_ADMIN_ROLE on the factory; cannot setTemplate.`);
  }

  console.log("\nCalling factory.setTemplate(newTemplate)...");
  const tx = await factory.setTemplate(poolImpl.address);
  const rcpt = await tx.wait();
  console.log(`  ✓ setTemplate in tx ${rcpt.hash} (block ${rcpt.blockNumber})`);

  const onChain = await factory.poolImpl();
  if (onChain.toLowerCase() !== poolImpl.address.toLowerCase()) {
    throw new Error(`Post-check failed: factory.poolImpl()=${onChain} != ${poolImpl.address}`);
  }
  console.log(`  ✓ factory.poolImpl() == ${onChain}`);

  contracts.poolImpl = poolImpl.address;
  record.contracts = contracts;
  record.deployBlocks = record.deployBlocks || {};
  record.deployBlocks.poolImpl = rcpt.blockNumber;
  record.poolTemplateResyncedAt = new Date(Number((await ethers.provider.getBlock(rcpt.blockNumber)).timestamp) * 1000).toISOString();
  fs.writeFileSync(filepath, JSON.stringify(record, null, 2) + "\n");

  console.log("\n" + "=".repeat(60));
  console.log(`Updated deployments/${filename}: poolImpl -> ${poolImpl.address}`);
  console.log("=".repeat(60));
  console.log(`Next: verify the template — npx hardhat verify --network ${hre.network.name} ${poolImpl.address}`);
  console.log(`Then: npm run sync:frontend-contracts -- --network ${hre.network.name} --chainId ${chainId}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
