/**
 * Pre-flight audit for the spec 068 policy-engine rollout.
 *
 * Read-only. For each custody chain it reports everything that decides whether a deploy can
 * proceed — RPC reachability, deployer balance, the deterministic CREATE2 target, whether the
 * contracts are already on-chain, and the singleton factory's presence — so a live deploy is never
 * started on a chain that is not ready.
 *
 * Usage: npx hardhat run scripts/ops/preflight-policy-guard-v2.js --network <net>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { generateSalt } = require("../deploy/lib/helpers");
const { SALT_PREFIXES } = require("../deploy/lib/constants");

const SINGLETON_FACTORY = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

const TARGETS = [
  { contract: "SafePolicyGuardV2", key: "safePolicyGuardV2" },
  { contract: "PolicyGuardSetup", key: "policyGuardSetup" },
  { contract: "SafeProposalHub", key: "safeProposalHub" },
];

const FILE_BY_CHAIN = {
  10: "optimism-chain10-v2.json",
  61: "etc-chain61-v2.json",
  63: "mordor-chain63-v2.json",
  137: "polygon-chain137-v2.json",
  8453: "base-chain8453-v2.json",
  42161: "arbitrum-chain42161-v2.json",
  1337: "hardhat-chain1337-v2.json",
};

// Custody is only offered where Safe v1.4.1 itself exists. These canonical addresses are identical
// on every chain the Safe Singleton Factory reached — but "should be there" is not "is there", so
// the pre-flight verifies them on-chain before we consider a chain a custody target.
const SAFE_V1_4_1 = {
  singleton: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
  singletonL2: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
};

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  console.log(`\n=== Pre-flight: chainId ${chainId} (${hre.network.name}) ===`);
  console.log(`RPC: ${hre.network.config.url || "in-process"}`);

  // Block + gas: proves the RPC actually answers, and shows what a deploy would cost.
  const block = await ethers.provider.getBlockNumber();
  const fee = await ethers.provider.getFeeData();
  console.log(`Head block: ${block}`);
  console.log(
    `Gas: gasPrice=${fee.gasPrice ? ethers.formatUnits(fee.gasPrice, "gwei") : "n/a"} gwei` +
      `  maxFee=${fee.maxFeePerGas ? ethers.formatUnits(fee.maxFeePerGas, "gwei") : "n/a"} gwei`,
  );

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    console.log("DEPLOYER: none available (no floppy keystore, no PRIVATE_KEY) — cannot deploy");
    return;
  }
  const [deployer] = signers;
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)}`);

  const factoryCode = await ethers.provider.getCode(SINGLETON_FACTORY);
  console.log(`Singleton factory ${SINGLETON_FACTORY}: ${factoryCode === "0x" ? "MISSING" : "present"}`);

  // Safe v1.4.1 presence — custody is meaningless on a chain without it.
  let safeOk = true;
  for (const [name, addr] of Object.entries(SAFE_V1_4_1)) {
    const present = (await ethers.provider.getCode(addr)) !== "0x";
    if (!present) safeOk = false;
    console.log(`  Safe ${name.padEnd(16)} ${addr}: ${present ? "present" : "MISSING"}`);
  }
  console.log(`Safe v1.4.1 usable here: ${safeOk ? "YES" : "NO — do not offer custody on this chain"}`);

  const recordPath = path.join(__dirname, "..", "..", "deployments", FILE_BY_CHAIN[chainId] || "");
  const record = FILE_BY_CHAIN[chainId] && fs.existsSync(recordPath)
    ? JSON.parse(fs.readFileSync(recordPath, "utf8"))
    : null;
  console.log(`Deployment record: ${record ? `deployments/${FILE_BY_CHAIN[chainId]}` : "NONE (will be created)"}`);

  let totalGas = 0n;
  for (const { contract, key } of TARGETS) {
    const artifact = await hre.artifacts.readArtifact(contract);
    const salt = generateSalt(SALT_PREFIXES.V2 + contract);
    const initCodeHash = ethers.keccak256(artifact.bytecode);
    const predicted = ethers.getCreate2Address(SINGLETON_FACTORY, salt, initCodeHash);
    const code = await ethers.provider.getCode(predicted);
    const recorded = record?.contracts?.[key];
    const deployed = code !== "0x";
    if (!deployed) {
      // Rough deploy cost: init code length is a decent proxy when we cannot estimate directly.
      const gas = BigInt(Math.ceil(artifact.bytecode.length / 2) * 200 + 32000);
      totalGas += gas;
    }
    console.log(
      `\n  ${contract}` +
        `\n    predicted: ${predicted}` +
        `\n    on-chain:  ${deployed ? "YES (skip)" : "no (will deploy)"}` +
        `\n    recorded:  ${recorded || "—"}${recorded && recorded !== predicted ? "  ⚠️ MISMATCH" : ""}`,
    );
  }

  if (totalGas > 0n && fee.gasPrice) {
    const cost = totalGas * fee.gasPrice;
    console.log(`\nEstimated deploy cost (rough): ${ethers.formatEther(cost)} native`);
    console.log(`Sufficient balance: ${balance > cost * 2n ? "YES" : "⚠️  TIGHT OR INSUFFICIENT"}`);
  } else if (totalGas === 0n) {
    console.log("\nNothing to deploy — all three contracts are already on-chain here.");
  }
}

main().catch((e) => {
  console.error("PRE-FLIGHT FAILED:", e.message);
  process.exitCode = 1;
});
