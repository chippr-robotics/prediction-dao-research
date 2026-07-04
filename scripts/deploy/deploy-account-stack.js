/**
 * Spec 041 T008 — deterministic deployment of the passkey account stack.
 *
 * Deploys the vendored Coinbase Smart Wallet implementation + factory through the
 * canonical CREATE2 deterministic-deployment proxy (Arachnid, same address on every
 * EVM chain), so `accountFactory` lands at THE SAME ADDRESS on every platform
 * network — the hard FR-023 requirement behind chain-independent passkey account
 * addresses. Records `entryPoint` / `accountFactory` (and `p256Verifier`, where an
 * external verifier is ever required — the vendored WebAuthnSol inlines its FCL
 * fallback, so this stays null today) into the network's deployments/ file, then
 * CROSS-CHECKS the factory address against every other network record and FAILS
 * LOUDLY on divergence.
 *
 *   npx hardhat run scripts/deploy/deploy-account-stack.js --network <amoy|polygon|...>
 *   VERIFY_7212=1 … — also probe the RIP-7212 precompile with a known-good P-256
 *                     vector (constitution III: report the real chain capability).
 *
 * After running: npm run sync:frontend-contracts:<net> (carries the new keys to the
 * frontend config — constitution V: never hand-copied).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");

// Arachnid CREATE2 proxy — canonical singleton, same address on every EVM chain.
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
// Canonical ERC-4337 EntryPoint v0.6 (pairs with the vendored Coinbase Smart Wallet v1.1.0).
const ENTRYPOINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
// RIP-7212 P-256 precompile address + a known-good verification vector (from the RIP test set).
const P256_PRECOMPILE = "0x0000000000000000000000000000000000000100";
const P256_VECTOR =
  "0xbb5a52f42f9c9261ed4361f59422a1e30036e7c32b270c8807a419feca605023" + // sha256 msg hash
  "2ba3a8be6b94d5ec80a6d9d1190a436effe50d85a1eee859b8cc6af9bd5c2e18" + // r
  "4cd60b855d442f5b3c7b11eb6c4e0ae7525fe710fab9aa7c77a67f79e6fadd76" + // s
  "2927b10512bae3eddcfe467828128bad2903269919f7086069c8c4df6c732838" + // x
  "c7787964eaac00e5921fb1498a60f4606766b3d9685001558d1a974e7341513e"; // y

// Version-pinned salt: bump ONLY with a coordinated redeploy on EVERY network
// (a new salt means a new factory address ⇒ new account addresses).
const SALT = ethers.id("fairwins.041.account-stack.v1");

async function create2Deploy(deployer, initCode, label) {
  const initCodeHash = ethers.keccak256(initCode);
  const predicted = ethers.getCreate2Address(CREATE2_DEPLOYER, SALT, initCodeHash);
  if ((await ethers.provider.getCode(predicted)) !== "0x") {
    console.log(`${label}: already deployed at ${predicted} (idempotent)`);
    return predicted;
  }
  const tx = await deployer.sendTransaction({
    to: CREATE2_DEPLOYER,
    data: ethers.concat([SALT, initCode]),
  });
  await tx.wait();
  if ((await ethers.provider.getCode(predicted)) === "0x") {
    throw new Error(`${label}: CREATE2 deploy landed no code at ${predicted}`);
  }
  console.log(`${label}: deployed at ${predicted}`);
  return predicted;
}

async function verify7212() {
  const ret = await ethers.provider.call({ to: P256_PRECOMPILE, data: P256_VECTOR });
  const ok = ret && ret !== "0x" && BigInt(ret) === 1n;
  console.log(
    ok
      ? "RIP-7212 probe: precompile PRESENT (valid vector verified => cheap passkey path active)"
      : `RIP-7212 probe: precompile ABSENT or invalid (returned ${ret}) — WebAuthnSol will use the FCL Solidity fallback`
  );
  return ok;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();
  console.log(`Account-stack deploy on ${hre.network.name} (chainId ${chainId}) — deployer ${deployer.address}`);

  // Local dev chains have no Arachnid proxy; the stack is deployed per-run in tests
  // instead. Guard against silently recording a non-deterministic address.
  if ((await ethers.provider.getCode(CREATE2_DEPLOYER)) === "0x") {
    throw new Error(
      `CREATE2 deterministic deployer not present on this chain (${chainId}). ` +
        `On local dev use the test fixtures; on a new production network deploy the Arachnid proxy first.`
    );
  }

  // EntryPoint: canonical where present; on chains without it (future ETC/Mordor
  // increment) it must be self-deployed at the same address BEFORE this script runs.
  if ((await ethers.provider.getCode(ENTRYPOINT_V06)) === "0x") {
    throw new Error(
      `EntryPoint v0.6 not found at ${ENTRYPOINT_V06} on chain ${chainId}. ` +
        `Self-deploy the canonical EntryPoint first (deferred ETC/Mordor increment, spec 041 FR-022).`
    );
  }

  const Wallet = await ethers.getContractFactory("CoinbaseSmartWallet");
  const implAddr = await create2Deploy(deployer, Wallet.bytecode, "CoinbaseSmartWallet (implementation)");

  const Factory = await ethers.getContractFactory("CoinbaseSmartWalletFactory");
  const factoryInitCode = ethers.concat([
    Factory.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(["address"], [implAddr]),
  ]);
  const factoryAddr = await create2Deploy(deployer, factoryInitCode, "CoinbaseSmartWalletFactory");

  if (process.env.VERIFY_7212 === "1" || process.argv.includes("--verify-7212")) {
    await verify7212();
  }

  // Record into the network's v2 deployment file.
  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  const record = fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath, "utf8")) : { chainId, contracts: {} };
  record.contracts = record.contracts || {};
  record.contracts.entryPoint = ENTRYPOINT_V06;
  record.contracts.accountFactory = factoryAddr;
  record.contracts.accountImpl = implAddr;
  // WebAuthnSol needs no external verifier (FCL is inlined); keep the key explicit-null
  // so the frontend capability check stays honest.
  record.contracts.p256Verifier = record.contracts.p256Verifier || null;
  saveDeployment(filename, record);

  // HARD cross-network assertion (FR-023): every deployments/ record that carries an
  // accountFactory must carry THIS address.
  const deploymentsDir = path.join(process.cwd(), "deployments");
  const mismatches = [];
  for (const f of fs.readdirSync(deploymentsDir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const other = JSON.parse(fs.readFileSync(path.join(deploymentsDir, f), "utf8"));
      const addr = other?.contracts?.accountFactory;
      if (addr && addr.toLowerCase() !== factoryAddr.toLowerCase()) mismatches.push(`${f}: ${addr}`);
    } catch {
      /* non-record JSON — ignore */
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `FR-023 VIOLATION — accountFactory address diverges across networks (expected ${factoryAddr}):\n  ` +
        mismatches.join("\n  ") +
        `\nAccounts would get different addresses per chain. Fix the deployment (same salt, same bytecode) before proceeding.`
    );
  }
  console.log(`\nCross-network accountFactory assertion passed (${factoryAddr} everywhere it exists).`);
  console.log(`Next: npm run sync:frontend-contracts for this network.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
