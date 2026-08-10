/**
 * Targeted deploy: SafePolicyGuardV2 (+ PolicyGuardSetup where missing) — spec 068.
 *
 * SafePolicyGuardV2 is the ordered, approver-aware policy engine succeeding spec 049's
 * SafePolicyGuard. Like v1 it is immutable, admin-free and non-upgradeable: an upgrade key over a
 * policy guard would be a backdoor across every vault, so version migration is vault-consented
 * (owners adopt the new guard with a threshold-approved `setGuard`). Both guards therefore stay
 * deployed side by side — v1 keeps enforcing for vaults that have not adopted V2.
 *
 * PolicyGuardSetup is guard-AGNOSTIC (it takes the guard address as a parameter and ERC-165-checks
 * it), so it is reused as-is; this script only deploys it on chains where it is missing.
 *
 * Rollout follows custody support: Mordor (63) → ETC (61) → Polygon (137) → the L2s the app gained
 * with spec 067's bridge work, Base (8453) / Optimism (10) / Arbitrum (42161); hardhat/localhost
 * (1337) is wired for the local quickstart. Neither contract has admin or funds, so only the deploy
 * signs. Addresses are deterministic (CREATE2), so the guard lands on the SAME address everywhere.
 *
 * Usage: npx hardhat run scripts/deploy/custody/deploy-policy-guard-v2.js --network <localhost|mordor|etc|polygon|base|optimism|arbitrum>
 * Next:  npm run sync:frontend-contracts -- --network <net> --chainId <id>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { deployDeterministic, ensureSingletonFactory, generateSalt } = require("../lib/helpers");
const { SALT_PREFIXES } = require("../lib/constants");

const TARGETS = [
  { contract: "SafePolicyGuardV2", key: "safePolicyGuardV2" },
  { contract: "PolicyGuardSetup", key: "policyGuardSetup" },
];

// Custody chains (see frontend/src/config/safeContracts.js SAFE_CONTRACTS) plus local. Safe v1.4.1
// and the Safe Singleton Factory are verified present on every entry here — run
// scripts/ops/preflight-policy-guard-v2.js before adding a chain.
const FILE_BY_CHAIN = {
  10: "optimism-chain10-v2.json",
  61: "etc-chain61-v2.json",
  63: "mordor-chain63-v2.json",
  137: "polygon-chain137-v2.json",
  8453: "base-chain8453-v2.json",
  42161: "arbitrum-chain42161-v2.json",
  1337: "hardhat-chain1337-v2.json",
};

const NETWORK_LABEL = {
  10: "optimism",
  61: "etc",
  63: "mordor",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  1337: "hardhat",
};

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  const deploymentsDir = path.join(__dirname, "..", "..", "..", "deployments");
  const fileName = FILE_BY_CHAIN[chainId];
  if (!fileName) {
    throw new Error(
      `SafePolicyGuardV2 deploys to custody-supported chains (10, 61, 63, 137, 8453, 42161) or local 1337; got ${chainId}`,
    );
  }
  const recordPath = path.join(deploymentsDir, fileName);

  // A brand-new custody chain (e.g. ETC 61) may have no record file yet — create a minimal one
  // rather than failing, so the deploy is not blocked on hand-authoring JSON.
  let record;
  if (fs.existsSync(recordPath)) {
    record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  } else {
    record = { network: NETWORK_LABEL[chainId], chainId, contracts: {}, constructorArgs: {}, deployBlocks: {} };
    console.log(`No deployment record at deployments/${fileName} — creating one.`);
  }

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:   ${record.network} (chainId ${chainId})`);
  console.log(`Deployer:  ${deployer.address}  (balance ${ethers.formatEther(bal)})`);

  await ensureSingletonFactory(); // bootstraps the CREATE2 factory on local sessions

  record.contracts = record.contracts || {};
  record.constructorArgs = record.constructorArgs || {};
  record.deployBlocks = record.deployBlocks || {};

  let changed = false;
  for (const { contract, key } of TARGETS) {
    const existing = record.contracts[key];
    if (existing) {
      const code = await ethers.provider.getCode(existing);
      if (code !== "0x") {
        console.log(`\n✓ ${contract} already recorded + on-chain at ${existing} — skipping.`);
        continue;
      }
    }
    const salt = generateSalt(SALT_PREFIXES.V2 + contract);
    const result = await deployDeterministic(contract, [], salt, deployer);
    record.contracts[key] = result.address;
    record.constructorArgs[key] = [];
    try {
      record.deployBlocks[key] = await ethers.provider.getBlockNumber();
    } catch { /* non-fatal */ }
    changed = true;
    console.log(`\n✓ ${contract} deployed: ${result.address}`);
  }

  if (changed) {
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
    console.log(`\nRecorded in deployments/${fileName}`);
    console.log(`Next: npm run sync:frontend-contracts -- --network ${record.network} --chainId ${chainId}`);
    for (const { key } of TARGETS) {
      console.log(`      npx hardhat verify --network ${record.network} ${record.contracts[key]}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
