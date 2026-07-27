/**
 * Find pending SafeProposalHub proposals for a vault, verify each one's hash against the Safe's own
 * derivation, and report who has approved.
 *
 * Read-only. The hub is an events-only broadcaster and the proposer supplies the hash, so a
 * proposal is NOT trusted as posted: every one is re-hashed from its preimage via the Safe's own
 * getTransactionHash and discarded if it does not match. That is the whole reason the preimage is in
 * the event.
 *
 * Usage: SAFE=0x… npx hardhat run scripts/ops/find-safe-proposals.js --network <net>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { getDeploymentFilename } = require("../deploy/lib/helpers");

const HUB_ABI = [
  "event Proposed(address indexed safe, address indexed proposer, bytes32 indexed safeTxHash, address to, uint256 value, bytes data, uint8 operation, uint256 nonce)",
  "event Cancelled(address indexed safe, address indexed proposer, bytes32 indexed safeTxHash)",
];
const SAFE_ABI = [
  "function nonce() view returns (uint256)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function approvedHashes(address owner, bytes32 hash) view returns (uint256)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
];

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const safeAddress = ethers.getAddress(process.env.SAFE || "");

  const record = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "deployments", getDeploymentFilename(network, "v2")), "utf8"),
  );
  const hubAddress = record.contracts?.safeProposalHub;
  if (!hubAddress) throw new Error(`no safeProposalHub recorded on chain ${chainId}`);
  const fromBlock = record.deployBlocks?.safeProposalHub || 0;

  const hub = new ethers.Contract(hubAddress, HUB_ABI, ethers.provider);
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, ethers.provider);
  const [currentNonce, threshold, owners] = await Promise.all([
    safe.nonce(),
    safe.getThreshold(),
    safe.getOwners(),
  ]);

  console.log(`chain ${chainId} — Safe ${safeAddress}`);
  console.log(`  threshold ${threshold} of ${owners.length}, current nonce ${currentNonce}`);
  console.log(`  hub ${hubAddress} (from block ${fromBlock})`);

  const proposed = await hub.queryFilter(hub.filters.Proposed(safeAddress), fromBlock, "latest");
  const cancelled = new Set(
    (await hub.queryFilter(hub.filters.Cancelled(safeAddress), fromBlock, "latest")).map((e) => e.args.safeTxHash),
  );
  if (proposed.length === 0) return console.log("\n  no proposals found");

  for (const ev of proposed) {
    const { proposer, safeTxHash, to, value, data, operation, nonce } = ev.args;

    // Re-derive the hash from the preimage. A mismatch means the posted hash does not describe the
    // posted transaction — approving on the strength of the event alone would be approving unknown
    // calldata.
    const derived = await safe.getTransactionHash(
      to, value, data, operation, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, nonce,
    );
    const authentic = derived === safeTxHash;

    const status = cancelled.has(safeTxHash)
      ? "cancelled"
      : Number(nonce) < Number(currentNonce)
        ? "superseded/executed"
        : "PENDING";

    console.log(`\n  ${status}  nonce ${nonce}  ${safeTxHash}`);
    console.log(`    hash verifies against the Safe: ${authentic ? "YES" : "NO — DO NOT APPROVE"}`);
    console.log(`    proposer: ${proposer}`);
    console.log(`    to:       ${to}`);
    console.log(`    value:    ${ethers.formatEther(value)} native`);
    console.log(`    operation:${Number(operation) === 0 ? " CALL" : " DELEGATECALL ⚠️"}`);
    console.log(`    data:     ${data === "0x" ? "(none — plain transfer)" : data.slice(0, 74) + (data.length > 74 ? "…" : "")}`);

    if (status === "PENDING" && authentic) {
      let have = 0;
      for (const o of owners) {
        const approved = (await safe.approvedHashes(o, safeTxHash)) === 1n;
        if (approved) have++;
        console.log(`      ${approved ? "✓" : "·"} ${o}`);
      }
      console.log(`    approvals: ${have} of ${threshold} needed${have >= Number(threshold) ? " — READY TO EXECUTE" : ""}`);
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
