/**
 * Targeted deploy: SafeProposalHub only (spec 043 — Safe multisig custody).
 *
 * The hub is an immutable, value-free, events-only helper that broadcasts a proposed Safe transaction's
 * preimage so co-owners can discover and approve it on-chain without a hosted Safe Transaction Service. Like
 * the BackupPointerRegistry deploy, this script deploys ONLY the hub using a deterministic CREATE2 salt (so the
 * address matches a fresh full deploy) and records it into the existing `deployments/<net>-chain<id>-v2.json`
 * under `safeProposalHub` without disturbing any other field. It never touches the UUPS proxies.
 *
 * Custody launch networks: Mordor (63) and Polygon (137), where Safe v1.4.1 is verified live. The contract has
 * no admin/funds, so only the deploy itself signs.
 *
 * Usage: npx hardhat run scripts/deploy/custody/deploy-safe-proposal-hub.js --network <mordor|polygon>
 * Next:  npm run sync:frontend-contracts -- --network <net> --chainId <id>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { deployDeterministic, generateSalt } = require("../lib/helpers");
const { SALT_PREFIXES } = require("../lib/constants");

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  const deploymentsDir = path.join(__dirname, "..", "..", "..", "deployments");
  const fileByChain = {
    63: "mordor-chain63-v2.json",
    137: "polygon-chain137-v2.json",
  };
  const fileName = fileByChain[chainId];
  if (!fileName) throw new Error(`SafeProposalHub is only deployed to Custody-supported chains (63, 137); got ${chainId}`);
  const recordPath = path.join(deploymentsDir, fileName);
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:   ${record.network} (chainId ${chainId})`);
  console.log(`Deployer:  ${deployer.address}  (balance ${ethers.formatEther(bal)})`);

  if (record.contracts?.safeProposalHub) {
    const existingCode = await ethers.provider.getCode(record.contracts.safeProposalHub);
    if (existingCode !== "0x") {
      console.log(`\n✓ SafeProposalHub already recorded + on-chain at ${record.contracts.safeProposalHub} — nothing to do.`);
      return;
    }
  }

  const salt = generateSalt(SALT_PREFIXES.V2 + "SafeProposalHub");
  const result = await deployDeterministic("SafeProposalHub", [], salt, deployer);
  const address = result.address;

  let deployBlock = 0;
  try {
    deployBlock = await ethers.provider.getBlockNumber();
  } catch { /* non-fatal */ }

  // Surgical record update — preserve every other field/format.
  record.contracts = record.contracts || {};
  record.contracts.safeProposalHub = address;
  record.constructorArgs = record.constructorArgs || {};
  record.constructorArgs.safeProposalHub = [];
  record.deployBlocks = record.deployBlocks || {};
  if (deployBlock) record.deployBlocks.safeProposalHub = deployBlock;
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");

  console.log(`\n✓ SafeProposalHub deployed: ${address}`);
  console.log(`  recorded in deployments/${fileName}${deployBlock ? ` (deployBlock ${deployBlock})` : ""}`);
  console.log(`\nNext: npm run sync:frontend-contracts -- --network ${record.network} --chainId ${chainId}`);
  console.log(`      npx hardhat verify --network ${record.network} ${address}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
