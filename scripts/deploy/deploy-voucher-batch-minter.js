/**
 * Targeted deploy: VoucherBatchMinter only (spec 026 — buy-a-quantity / gift rail).
 *
 * The full deploy.js stands up the entire stack and (for the UUPS contracts) mints NEW proxies — running it
 * against a live network would strand the existing WagerRegistry/MembershipManager proxies. This script
 * deploys ONLY the immutable `VoucherBatchMinter`, pointed at the network's already-deployed
 * `membershipVoucher`, using the SAME deterministic CREATE2 salt as deploy.js so the address matches what a
 * fresh full deploy would produce. It then records the address (+ constructor args + deploy block) into the
 * existing `deployments/<net>-chain<id>-v2.json` without disturbing any other field.
 *
 * Usage: npx hardhat run scripts/deploy/deploy-voucher-batch-minter.js --network <amoy|mordor>
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

  const voucher = record.contracts?.membershipVoucher;
  if (!voucher) throw new Error(`membershipVoucher not found in ${fileName} — deploy the voucher first.`);

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:   ${record.network} (chainId ${chainId})`);
  console.log(`Deployer:  ${deployer.address}  (balance ${ethers.formatEther(bal)})`);
  console.log(`Voucher:   ${voucher}`);

  if (record.contracts.voucherBatchMinter) {
    const existingCode = await ethers.provider.getCode(record.contracts.voucherBatchMinter);
    if (existingCode !== "0x") {
      console.log(`\n✓ VoucherBatchMinter already recorded + on-chain at ${record.contracts.voucherBatchMinter} — nothing to do.`);
      return;
    }
  }

  const salt = generateSalt(SALT_PREFIXES.V2 + "VoucherBatchMinter");
  const result = await deployDeterministic("VoucherBatchMinter", [voucher], salt, deployer);
  const address = result.address;

  // Resolve the deploy block (best-effort) for the bounded event-scan tooling.
  let deployBlock = 0;
  try {
    deployBlock = await ethers.provider.getBlockNumber();
  } catch { /* non-fatal */ }

  // Surgical record update — preserve every other field/format.
  record.contracts.voucherBatchMinter = address;
  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.voucherBatchMinter = [voucher];
  record.deployBlocks = record.deployBlocks || {};
  if (deployBlock) record.deployBlocks.voucherBatchMinter = deployBlock;
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");

  console.log(`\n✓ VoucherBatchMinter deployed: ${address}`);
  console.log(`  recorded in deployments/${fileName}${deployBlock ? ` (deployBlock ${deployBlock})` : ""}`);
  console.log(`\nNext: npm run sync:frontend-contracts -- --network ${record.network} --chainId ${chainId}`);
  console.log(`      npx hardhat verify --network ${record.network} ${address} ${voucher}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
