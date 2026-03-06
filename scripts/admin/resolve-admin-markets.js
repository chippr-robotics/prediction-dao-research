#!/usr/bin/env node
/**
 * resolve-admin-markets.js
 *
 * Discovers all friend markets for a given admin address and resolves/cancels them.
 * - PendingAcceptance → cancelPendingMarket (refund)
 * - Active → resolveFriendMarket(id, false) (creator loses, starts challenge period)
 * - PendingResolution (past deadline) → finalizeResolution
 * - Challenged → resolveDispute(id, false) (owner-only)
 * - OracleTimedOut → forceOracleResolution(id, false) (owner-only)
 * - Already terminal (Resolved/Cancelled/Refunded) → skip
 *
 * Usage:
 *   npx hardhat run scripts/admin/resolve-admin-markets.js --network mordor
 *
 * Environment:
 *   ADMIN_ADDRESS - override the target address (default: signer address)
 *   DRY_RUN=1     - only report, don't execute transactions
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

const STATUS_NAMES = [
  "PendingAcceptance",  // 0
  "Active",             // 1
  "PendingResolution",  // 2
  "Challenged",         // 3
  "Resolved",           // 4
  "Cancelled",          // 5
  "Refunded",           // 6
  "OracleTimedOut",     // 7
];

const TERMINAL_STATUSES = new Set([4, 5, 6]); // Resolved, Cancelled, Refunded

async function main() {
  const dryRun = process.env.DRY_RUN === "1";

  console.log("=".repeat(60));
  console.log("Resolve Admin Friend Markets");
  console.log("=".repeat(60));
  if (dryRun) console.log("*** DRY RUN MODE — no transactions will be sent ***\n");

  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${hre.network.name} (Chain ID: ${network.chainId})`);

  const [signer] = await ethers.getSigners();
  const adminAddress = process.env.ADMIN_ADDRESS || signer.address;
  console.log("Signer:", signer.address);
  console.log("Target admin:", adminAddress);

  // Contract address — FriendGroupMarketFactory on Mordor
  const FRIEND_GROUP_FACTORY = "0xE1eC8d34b36f55015ed636337121CA8EFbA96227";

  // Use minimal ABI matching the actual contract return types
  const minimalABI = [
    "event MemberAdded(uint256 indexed friendMarketId, address indexed member)",
    "function friendMarketCount() view returns (uint256)",
    "function getFriendMarketWithStatus(uint256) view returns (uint256 marketId, uint8 marketType, address creator, address[] members, address arbitrator, uint8 status, uint256 acceptanceDeadline, uint256 stakePerParticipant, address stakeToken, uint256 acceptedCount, uint256 minThreshold, uint16 opponentOddsMultiplier, string description, uint8 resolutionType)",
    "function pendingResolutions(uint256) view returns (bool proposedOutcome, address proposer, uint256 proposedAt, uint256 challengeDeadline, address challenger, uint256 challengeBondPaid)",
    "function cancelPendingMarket(uint256)",
    "function resolveFriendMarket(uint256, bool)",
    "function finalizeResolution(uint256)",
    "function resolveDispute(uint256, bool)",
    "function forceOracleResolution(uint256, bool)",
  ];
  const contract = new ethers.Contract(FRIEND_GROUP_FACTORY, minimalABI, signer);

  // Step 1: Discover all markets for admin via MemberAdded events
  console.log("\n--- Step 1: Discover markets via MemberAdded events ---");

  const currentBlock = await ethers.provider.getBlockNumber();
  const filter = contract.filters.MemberAdded(null, adminAddress);

  // Scan in chunks to avoid RPC limits
  const CHUNK_SIZE = 10000;
  const START_BLOCK = 0; // Scan from genesis for completeness
  const marketIds = new Set();

  for (let from = START_BLOCK; from <= currentBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    try {
      const events = await contract.queryFilter(filter, from, to);
      for (const event of events) {
        marketIds.add(Number(event.args.friendMarketId));
      }
    } catch (err) {
      // Retry with smaller chunks
      const SMALL_CHUNK = 1000;
      for (let sf = from; sf <= to; sf += SMALL_CHUNK) {
        const st = Math.min(sf + SMALL_CHUNK - 1, to);
        try {
          const events = await contract.queryFilter(filter, sf, st);
          for (const event of events) {
            marketIds.add(Number(event.args.friendMarketId));
          }
        } catch (innerErr) {
          console.warn(`  Failed to scan blocks ${sf}-${st}:`, innerErr.message);
        }
      }
    }
  }

  const sortedIds = [...marketIds].sort((a, b) => a - b);
  console.log(`Found ${sortedIds.length} markets for ${adminAddress}`);
  console.log("Market IDs:", sortedIds.join(", "));

  // Step 2: Fetch status for each market
  console.log("\n--- Step 2: Fetch market statuses ---");

  const marketsByStatus = {};
  for (const name of STATUS_NAMES) marketsByStatus[name] = [];

  for (const id of sortedIds) {
    try {
      const result = await contract.getFriendMarketWithStatus(id);
      const status = Number(result.status);
      const statusName = STATUS_NAMES[status] || `Unknown(${status})`;
      marketsByStatus[statusName] = marketsByStatus[statusName] || [];
      marketsByStatus[statusName].push({
        id,
        status,
        statusName,
        creator: result.creator,
        description: result.description?.substring(0, 60) + (result.description?.length > 60 ? "..." : ""),
        resolutionType: Number(result.resolutionType),
      });
      console.log(`  Market #${id}: ${statusName} (resType=${result.resolutionType})`);
    } catch (err) {
      console.warn(`  Market #${id}: ERROR fetching — ${err.message}`);
    }
  }

  // Step 3: Resolve markets
  console.log("\n--- Step 3: Resolve/Cancel markets ---");

  const results = { resolved: [], cancelled: [], finalized: [], disputed: [], skipped: [], failed: [], pendingFinalization: [] };

  // 3a: Cancel PendingAcceptance markets
  for (const market of marketsByStatus.PendingAcceptance || []) {
    if (dryRun) {
      console.log(`  [DRY RUN] Would cancel market #${market.id}`);
      results.cancelled.push(market.id);
      continue;
    }
    try {
      console.log(`  Cancelling market #${market.id}...`);
      const tx = await contract.cancelPendingMarket(market.id);
      await tx.wait();
      console.log(`  ✓ Cancelled market #${market.id} (tx: ${tx.hash})`);
      results.cancelled.push(market.id);
    } catch (err) {
      console.error(`  ✗ Failed to cancel market #${market.id}: ${err.message}`);
      results.failed.push({ id: market.id, action: "cancel", error: err.message });
    }
  }

  // 3b: Resolve Active markets (outcome=false, creator loses)
  for (const market of marketsByStatus.Active || []) {
    if (dryRun) {
      console.log(`  [DRY RUN] Would resolve market #${market.id} (outcome=false)`);
      results.pendingFinalization.push(market.id);
      continue;
    }
    try {
      console.log(`  Resolving market #${market.id} (outcome=false)...`);
      const tx = await contract.resolveFriendMarket(market.id, false);
      await tx.wait();
      console.log(`  ✓ Proposed resolution for market #${market.id} (tx: ${tx.hash})`);
      console.log(`    → Now PendingResolution. Needs finalizeResolution after challenge period.`);
      results.pendingFinalization.push(market.id);
    } catch (err) {
      console.error(`  ✗ Failed to resolve market #${market.id}: ${err.message}`);
      results.failed.push({ id: market.id, action: "resolve", error: err.message });
    }
  }

  // 3c: Finalize PendingResolution markets (if past challenge deadline)
  const now = Math.floor(Date.now() / 1000);
  for (const market of marketsByStatus.PendingResolution || []) {
    try {
      const pending = await contract.pendingResolutions(market.id);
      const deadline = Number(pending.challengeDeadline);

      if (deadline > 0 && now >= deadline) {
        if (dryRun) {
          console.log(`  [DRY RUN] Would finalize market #${market.id} (deadline passed)`);
          results.finalized.push(market.id);
          continue;
        }
        console.log(`  Finalizing market #${market.id} (challenge deadline passed)...`);
        const tx = await contract.finalizeResolution(market.id);
        await tx.wait();
        console.log(`  ✓ Finalized market #${market.id} (tx: ${tx.hash})`);
        results.finalized.push(market.id);
      } else {
        const remaining = deadline - now;
        const hours = Math.ceil(remaining / 3600);
        console.log(`  ⏳ Market #${market.id}: challenge deadline in ~${hours}h, cannot finalize yet`);
        results.pendingFinalization.push(market.id);
      }
    } catch (err) {
      console.error(`  ✗ Failed to finalize market #${market.id}: ${err.message}`);
      results.failed.push({ id: market.id, action: "finalize", error: err.message });
    }
  }

  // 3d: Resolve Challenged markets (owner resolves dispute)
  for (const market of marketsByStatus.Challenged || []) {
    if (dryRun) {
      console.log(`  [DRY RUN] Would resolve dispute for market #${market.id} (outcome=false)`);
      results.disputed.push(market.id);
      continue;
    }
    try {
      console.log(`  Resolving dispute for market #${market.id} (outcome=false)...`);
      const tx = await contract.resolveDispute(market.id, false);
      await tx.wait();
      console.log(`  ✓ Dispute resolved for market #${market.id} (tx: ${tx.hash})`);
      results.disputed.push(market.id);
    } catch (err) {
      console.error(`  ✗ Failed to resolve dispute for market #${market.id}: ${err.message}`);
      results.failed.push({ id: market.id, action: "resolveDispute", error: err.message });
    }
  }

  // 3e: Force-resolve OracleTimedOut markets
  for (const market of marketsByStatus.OracleTimedOut || []) {
    if (dryRun) {
      console.log(`  [DRY RUN] Would force-resolve market #${market.id} (outcome=false)`);
      results.resolved.push(market.id);
      continue;
    }
    try {
      console.log(`  Force-resolving oracle-timed-out market #${market.id} (outcome=false)...`);
      const tx = await contract.forceOracleResolution(market.id, false);
      await tx.wait();
      console.log(`  ✓ Force-resolved market #${market.id} (tx: ${tx.hash})`);
      results.resolved.push(market.id);
    } catch (err) {
      console.error(`  ✗ Failed to force-resolve market #${market.id}: ${err.message}`);
      results.failed.push({ id: market.id, action: "forceOracleResolution", error: err.message });
    }
  }

  // Skip terminal markets
  for (const statusName of ["Resolved", "Cancelled", "Refunded"]) {
    for (const market of marketsByStatus[statusName] || []) {
      results.skipped.push(market.id);
    }
  }

  // Step 4: Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log(`  Cancelled (PendingAcceptance): ${results.cancelled.length} — [${results.cancelled.join(", ")}]`);
  console.log(`  Finalized (PendingResolution):  ${results.finalized.length} — [${results.finalized.join(", ")}]`);
  console.log(`  Disputes resolved (Challenged): ${results.disputed.length} — [${results.disputed.join(", ")}]`);
  console.log(`  Force-resolved (OracleTimeout):  ${results.resolved.length} — [${results.resolved.join(", ")}]`);
  console.log(`  Skipped (already terminal):      ${results.skipped.length} — [${results.skipped.join(", ")}]`);
  console.log(`  Failed:                          ${results.failed.length}`);
  for (const f of results.failed) {
    console.log(`    Market #${f.id} (${f.action}): ${f.error}`);
  }

  if (results.pendingFinalization.length > 0) {
    console.log(`\n  ⏳ Awaiting finalization (run this script again after challenge period):`);
    console.log(`     [${results.pendingFinalization.join(", ")}]`);
  }

  console.log();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
