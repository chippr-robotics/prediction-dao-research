/**
 * Self-deploy Semaphore V4 on a network that lacks the canonical singleton — i.e. Ethereum Classic
 * (chainId 61) / Mordor (63). Amoy/Polygon use the canonical Semaphore singleton and do NOT need this
 * (zkPoolConfig.js carries those addresses). Run this BEFORE deploy-zk-wager-pool-factory.js.
 *
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/deploy-semaphore.js --network mordor
 *
 * Semaphore V4's group merkle tree (LeanIMT) hashes with the `poseidon-solidity` PoseidonT3 library,
 * whose `hash(uint[2])` is a PUBLIC library function — so it is NOT inlined and MUST be deployed once
 * and LINKED into the Semaphore bytecode. Deploy order:
 *   1) PoseidonT3        (library, no constructor)
 *   2) SemaphoreVerifier (no constructor; Groth16 verifier using the bn128 precompiles ETC has had
 *                         since Atlantis)
 *   3) Semaphore(verifier)  with PoseidonT3 linked
 *
 * The resolved Semaphore address is APPENDED to deployments/<net>-chain<id>-v2.json as
 * `zkWagerPoolSemaphore` (alongside `semaphoreVerifier` + `poseidonT3`). deploy-zk-wager-pool-factory.js
 * reads it from there (or from ZKPOOL_SEMAPHORE_<chainId>). Idempotent: re-running with a recorded
 * Semaphore is a no-op unless FORCE_REDEPLOY_SEMAPHORE=1.
 *
 * ETC/Mordor are pre-Cancun (Spiral gives PUSH0 but not mcopy); solc 0.8.24 here defaults to the
 * `shanghai` target (PUSH0, no mcopy), so the emitted bytecode is Mordor-safe.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");

// Fully-qualified names so getContractFactory never has to guess across the package + mock copies.
const FQN_POSEIDON = "poseidon-solidity/PoseidonT3.sol:PoseidonT3";
const FQN_VERIFIER = "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol:SemaphoreVerifier";
const FQN_SEMAPHORE = "@semaphore-protocol/contracts/Semaphore.sol:Semaphore";

// Networks that have a canonical Semaphore singleton — self-deploy is a mistake there.
const CANONICAL_SEMAPHORE_CHAINS = new Set([137, 80002]);

async function deployPlain(factory, label, args = []) {
  console.log(`\nDeploying ${label}...`);
  const c = await factory.deploy(...args);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`  ${label}: ${addr}`);
  return addr;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(60));
  console.log("Semaphore V4 self-deploy (spec 034 — ETC/Mordor)");
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)}`);

  if (CANONICAL_SEMAPHORE_CHAINS.has(chainId)) {
    throw new Error(
      `Chain ${chainId} has a canonical Semaphore singleton (see zkPoolConfig.js). Do NOT self-deploy; ` +
        `the factory deploy will use the canonical address.`
    );
  }

  // Append to the existing network record (created by the core deploy).
  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No existing deployment record at deployments/${filename}. Run the core deploy first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || (record.contracts = {});

  if (contracts.zkWagerPoolSemaphore && ethers.isAddress(contracts.zkWagerPoolSemaphore) && process.env.FORCE_REDEPLOY_SEMAPHORE !== "1") {
    console.log(`\n⚠️  Semaphore already recorded (${contracts.zkWagerPoolSemaphore}). Set FORCE_REDEPLOY_SEMAPHORE=1`);
    console.log(`   to deploy a fresh one. Aborting (no-op).`);
    console.log(`\nFor the factory deploy: ZKPOOL_SEMAPHORE_${chainId}=${contracts.zkWagerPoolSemaphore}`);
    return;
  }

  // 1) PoseidonT3 library (linked into Semaphore below).
  const poseidonFactory = await ethers.getContractFactory(FQN_POSEIDON, deployer);
  const poseidonAddr = await deployPlain(poseidonFactory, "PoseidonT3 (library)");

  // 2) SemaphoreVerifier (Groth16 verifier).
  const verifierFactory = await ethers.getContractFactory(FQN_VERIFIER, deployer);
  const verifierAddr = await deployPlain(verifierFactory, "SemaphoreVerifier");

  // 3) Semaphore(verifier), linking PoseidonT3.
  const semaphoreFactory = await ethers.getContractFactory(FQN_SEMAPHORE, {
    signer: deployer,
    libraries: { [FQN_POSEIDON]: poseidonAddr },
  });
  const semaphoreAddr = await deployPlain(semaphoreFactory, "Semaphore", [verifierAddr]);

  // Append to the record (preserve everything already there).
  contracts.zkWagerPoolSemaphore = semaphoreAddr;
  contracts.semaphoreVerifier = verifierAddr;
  contracts.poseidonT3 = poseidonAddr;
  record.semaphoreSelfDeployedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  zkWagerPoolSemaphore  ${semaphoreAddr}`);
  console.log(`  semaphoreVerifier     ${verifierAddr}`);
  console.log(`  poseidonT3            ${poseidonAddr}`);
  console.log(`\nNext: deploy the factory (reads the recorded Semaphore automatically):`);
  console.log(`  ZKPOOL_SEMAPHORE_${chainId}=${semaphoreAddr} \\`);
  console.log(`    npx hardhat run scripts/deploy/deploy-zk-wager-pool-factory.js --network ${networkName}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
