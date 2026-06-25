/**
 * Targeted deploy: BackupPointerRegistry only (spec 032 — encrypted data backup & restore).
 *
 * The full deploy.js stands up the entire stack and (for the UUPS contracts) mints NEW proxies — running it
 * against a live network would strand the existing WagerRegistry/MembershipManager proxies. This script
 * deploys ONLY the immutable, value-free `BackupPointerRegistry` using a deterministic CREATE2 salt so the
 * address matches what a fresh full deploy would produce, then records the address (+ empty constructor args
 * + deploy block) into the existing `deployments/<net>-chain<id>-v2.json` without disturbing any other field.
 *
 * Canonical network for the unified backup pointer is Polygon mainnet (137); also deployable to Amoy/Mordor
 * (same CREATE2 address) for testing. The contract has no admin/funds, so only the deploy itself signs.
 *
 * Usage: npx hardhat run scripts/deploy/deploy-backup-pointer-registry.js --network <polygon|amoy|mordor>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { deployDeterministic, generateSalt } = require("./lib/helpers");
const { SALT_PREFIXES } = require("./lib/constants");

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments");
  const fileByChain = {
    80002: "amoy-chain80002-v2.json",
    63: "mordor-chain63-v2.json",
    137: "polygon-chain137-v2.json",
  };
  const fileName = fileByChain[chainId];
  if (!fileName) throw new Error(`No deployment record mapping for chainId ${chainId}`);
  const recordPath = path.join(deploymentsDir, fileName);
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:   ${record.network} (chainId ${chainId})`);
  console.log(`Deployer:  ${deployer.address}  (balance ${ethers.formatEther(bal)})`);

  if (record.contracts?.backupPointerRegistry) {
    const existingCode = await ethers.provider.getCode(record.contracts.backupPointerRegistry);
    if (existingCode !== "0x") {
      console.log(`\n✓ BackupPointerRegistry already recorded + on-chain at ${record.contracts.backupPointerRegistry} — nothing to do.`);
      return;
    }
  }

  const salt = generateSalt(SALT_PREFIXES.V2 + "BackupPointerRegistry");
  const result = await deployDeterministic("BackupPointerRegistry", [], salt, deployer);
  const address = result.address;

  let deployBlock = 0;
  try {
    deployBlock = await ethers.provider.getBlockNumber();
  } catch { /* non-fatal */ }

  // Surgical record update — preserve every other field/format.
  record.contracts = record.contracts || {};
  record.contracts.backupPointerRegistry = address;
  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.backupPointerRegistry = [];
  record.deployBlocks = record.deployBlocks || {};
  if (deployBlock) record.deployBlocks.backupPointerRegistry = deployBlock;
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");

  console.log(`\n✓ BackupPointerRegistry deployed: ${address}`);
  console.log(`  recorded in deployments/${fileName}${deployBlock ? ` (deployBlock ${deployBlock})` : ""}`);
  console.log(`\nNext: npm run sync:frontend-contracts -- --network ${record.network} --chainId ${chainId}`);
  console.log(`      npx hardhat verify --network ${record.network} ${address}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
