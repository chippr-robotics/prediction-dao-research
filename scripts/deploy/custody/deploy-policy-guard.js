/**
 * Targeted deploy: SafePolicyGuard + PolicyGuardSetup (spec 049 — multisig policy engine).
 *
 * The guard is an immutable, admin-free, non-upgradeable Safe v1.4.1 transaction guard enforcing
 * per-vault fund policies (per-tx limit, 24h-window limit, recipient allowlist, cooldown); the
 * setup helper is the stateless Safe.setup delegatecall target that attaches the guard + initial
 * rules at vault creation. Like the SafeProposalHub deploy, this script deploys ONLY these two
 * contracts with deterministic CREATE2 salts and records them into the existing
 * `deployments/<net>-chain<id>-v2.json` under `safePolicyGuard` / `policyGuardSetup` without
 * disturbing any other field. It never touches the UUPS proxies.
 *
 * Rollout follows custody support: Mordor (63) then Polygon (137); hardhat/localhost (1337) is
 * wired for the local quickstart. Neither contract has admin or funds, so only the deploy signs.
 *
 * Usage: npx hardhat run scripts/deploy/custody/deploy-policy-guard.js --network <localhost|mordor|polygon>
 * Next:  npm run sync:frontend-contracts -- --network <net> --chainId <id>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { deployDeterministic, ensureSingletonFactory, generateSalt } = require("../lib/helpers");
const { SALT_PREFIXES } = require("../lib/constants");

const TARGETS = [
  { contract: "SafePolicyGuard", key: "safePolicyGuard" },
  { contract: "PolicyGuardSetup", key: "policyGuardSetup" },
];

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  const deploymentsDir = path.join(__dirname, "..", "..", "..", "deployments");
  const fileByChain = {
    63: "mordor-chain63-v2.json",
    137: "polygon-chain137-v2.json",
    1337: "hardhat-chain1337-v2.json",
  };
  const fileName = fileByChain[chainId];
  if (!fileName) throw new Error(`Policy engine deploys to custody-supported chains (63, 137) or local 1337; got ${chainId}`);
  const recordPath = path.join(deploymentsDir, fileName);
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));

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
