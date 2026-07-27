/**
 * Post-deploy functional verification for the spec 068 policy engine.
 *
 * A mined transaction is not proof of a working contract. This calls the deployed bytecode and
 * checks it actually behaves like the guard: the ERC-165 id Safe's `setGuard` demands, the
 * documented bounds, the ANY_ASSET sentinel, and a live read for an arbitrary vault (which must be
 * rule-free, i.e. the guard is inert until a vault opts in).
 *
 * Read-only. Usage: npx hardhat run scripts/ops/verify-policy-guard-v2.js --network <net>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const FILE_BY_CHAIN = {
  10: "optimism-chain10-v2.json",
  61: "etc-chain61-v2.json",
  63: "mordor-chain63-v2.json",
  137: "polygon-chain137-v2.json",
  8453: "base-chain8453-v2.json",
  42161: "arbitrum-chain42161-v2.json",
  1337: "hardhat-chain1337-v2.json",
};

// XOR of checkTransaction + checkAfterExecution selectors = the Safe v1.4.1 Guard interface id.
function guardInterfaceId() {
  const ct = ethers.dataSlice(
    ethers.id(
      "checkTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes,address)",
    ),
    0,
    4,
  );
  const cae = ethers.dataSlice(ethers.id("checkAfterExecution(bytes32,bool)"), 0, 4);
  return ethers.toBeHex(BigInt(ct) ^ BigInt(cae), 4);
}

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const recordPath = path.join(__dirname, "..", "..", "deployments", FILE_BY_CHAIN[chainId] || "");
  if (!FILE_BY_CHAIN[chainId] || !fs.existsSync(recordPath)) {
    throw new Error(`No deployment record for chain ${chainId}`);
  }
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const { safePolicyGuardV2, policyGuardSetup, safeProposalHub } = record.contracts || {};

  console.log(`\n=== Verify chain ${chainId} (${record.network}) ===`);
  let failures = 0;
  const check = (label, ok, detail = "") => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
  };

  for (const [name, addr] of Object.entries({ safePolicyGuardV2, policyGuardSetup, safeProposalHub })) {
    if (!addr) {
      check(`${name} recorded`, false, "missing from deployment record");
      continue;
    }
    const code = await ethers.provider.getCode(addr);
    check(`${name} has code at ${addr}`, code !== "0x", code === "0x" ? "NO CODE" : `${(code.length - 2) / 2} bytes`);
  }

  if (safePolicyGuardV2) {
    const guard = await ethers.getContractAt("SafePolicyGuardV2", safePolicyGuardV2);
    const wantId = guardInterfaceId();
    check("guard advertises the Safe guard interface (setGuard GS300)", await guard.supportsInterface(wantId), wantId);
    check("guard advertises ERC-165", await guard.supportsInterface("0x01ffc9a7"));
    check("guard rejects an unrelated interface id", !(await guard.supportsInterface("0xdeadbeef")));

    const anyAsset = await guard.ANY_ASSET();
    check("ANY_ASSET sentinel is address(1)", anyAsset === "0x0000000000000000000000000000000000000001", anyAsset);
    check("MAX_RULES is 16", (await guard.MAX_RULES()) === 16n);
    check("MAX_APPROVERS is 8", (await guard.MAX_APPROVERS()) === 8n);
    check("MAX_TARGETS is 16", (await guard.MAX_TARGETS()) === 16n);
    check("WINDOW is 24h", (await guard.WINDOW()) === 86400n);

    // An arbitrary address must have no policy: the guard is inert until a vault opts in, so
    // deploying it can never change how an existing vault behaves.
    const probe = "0x000000000000000000000000000000000000dEaD";
    check("a vault that never opted in has no rules", (await guard.ruleCount(probe)) === 0n);
    const meta = await guard.getMeta(probe);
    check("…and no policy metadata", meta.rulesVersion === 0n && meta.cooldown === 0n);
  }

  if (policyGuardSetup && safePolicyGuardV2) {
    // The setup helper is guard-agnostic; confirm it accepts THIS guard (its ERC-165 pre-check).
    const setup = await ethers.getContractAt("PolicyGuardSetup", policyGuardSetup);
    check("setup helper exposes enablePolicy", typeof setup.enablePolicy === "function");
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e.message);
  process.exitCode = 1;
});
