/**
 * Pre-launch lockdown / unlock for the Spec 007 cutover.
 *
 * After the 007 contracts are deployed, wired, synced, and the membership
 * migration has run, the app is still NOT live. Per the launch plan the new
 * contracts must be PAUSED until go-live so no user can wager or buy a
 * membership before everything (geo-block, sanctions wiring, frontend) is in
 * place. This script applies — and later reverses — that lockdown.
 *
 * WHAT IT TOUCHES
 *   - WagerRegistry IS Pausable. lock => pause(), unlock => unpause().
 *     Pausing blocks createWager / acceptWager / batchExpireOpen. Exit paths
 *     (claim, refund, draw) intentionally stay open even while paused.
 *   - MembershipManager is NOT Pausable. To stop *purchases* we deactivate the
 *     seeded WAGER_PARTICIPANT tiers (setTier active=false). purchaseTier /
 *     upgradeTier / extendMembership revert with TierInactive() while inactive.
 *     grantMembership does NOT check `active`, so the membership migration still
 *     works during lockdown — that is deliberate. lock => active=false,
 *     unlock => active=true. Price / duration / limits are read from the live
 *     TierConfig and preserved across the toggle.
 *   - KeyRegistry / SanctionsGuard have no pause concept and are left untouched
 *     (key registration is harmless pre-launch; the guard should stay live).
 *
 * SAFETY
 *   - DRY_RUN defaults to TRUE — it only PRINTS the planned actions.
 *   - Idempotent: skips a step already in the target state (e.g. re-running lock
 *     when already paused).
 *   - Reversible: ACTION=unlock undoes everything for go-live.
 *   - Requires GUARDIAN_ROLE (pause) and DEFAULT_ADMIN_ROLE (setTier) on the new
 *     contracts → run with the floppy keystore admin on the production network.
 *
 * USAGE
 *   # dry run, lock (default action):
 *   npx hardhat run scripts/operations/prelaunch-lockdown-007.js --network polygon
 *   # execute the lockdown (floppy mounted):
 *   DRY_RUN=false npx hardhat run scripts/operations/prelaunch-lockdown-007.js --network polygon
 *   # at go-live, reverse it:
 *   DRY_RUN=false ACTION=unlock npx hardhat run scripts/operations/prelaunch-lockdown-007.js --network polygon
 *
 *   Optional: LOCK_MEMBERSHIPS=false to ONLY pause/unpause WagerRegistry and
 *   leave the membership tiers as-is.
 *
 * Addresses are read from deployments/<network>-chain<id>-v2.json (written by
 * the 007 deploy).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// WAGER_PARTICIPANT_ROLE — the only role with seeded, purchasable tiers.
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const GUARDIAN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE"));
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
// Tier enum: None=0, Bronze=1, Silver=2, Gold=3, Platinum=4. Seeded: 1..4.
const SEEDED_TIERS = [1, 2, 3, 4];
const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"];

const WAGER_ABI = [
  "function pause() external",
  "function unpause() external",
  "function paused() view returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
];

const MM_ABI = [
  "function getTierConfig(bytes32 role, uint8 tier) view returns (tuple(uint128 priceUSDC, uint32 durationDays, bool active, tuple(uint32 monthlyMarketCreation, uint32 maxConcurrentMarkets) limits))",
  "function setTier(bytes32 role, uint8 tier, uint128 priceUSDC, uint32 durationDays, tuple(uint32 monthlyMarketCreation, uint32 maxConcurrentMarkets) limits, bool active) external",
  "function hasRole(bytes32 role, address account) view returns (bool)",
];

async function main() {
  const net = hre.network.name;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const dryRun = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
  const action = (process.env.ACTION ?? "lock").toLowerCase();
  const lockMemberships = (process.env.LOCK_MEMBERSHIPS ?? "true").toLowerCase() !== "false";
  if (action !== "lock" && action !== "unlock") {
    throw new Error(`ACTION must be 'lock' or 'unlock' (got '${action}').`);
  }
  const lock = action === "lock";
  // lock => want paused=true / tier active=false; unlock => paused=false / active=true.
  const wantPaused = lock;
  const wantActive = !lock;

  const depFile = path.join(__dirname, "..", "..", "deployments", `${net}-chain${chainId}-v2.json`);
  if (!fs.existsSync(depFile)) throw new Error(`Deployment file not found: ${depFile} (run the 007 deploy first).`);
  const contracts = JSON.parse(fs.readFileSync(depFile, "utf8")).contracts || {};
  const wagerAddr = contracts.wagerRegistry;
  const mmAddr = contracts.membershipManager;
  if (!wagerAddr) throw new Error("wagerRegistry missing from deployment file.");
  if (lockMemberships && !mmAddr) throw new Error("membershipManager missing from deployment file (or set LOCK_MEMBERSHIPS=false).");

  const [rawSigner] = await ethers.getSigners();
  // Wrap in a client-side NonceManager so the sequential pause + setTier txs
  // don't re-fetch a stale nonce from a load-balanced public RPC ("nonce too
  // low"). The base nonce is fetched once, then incremented locally.
  let signer = rawSigner;
  if (rawSigner) {
    const { NonceManager } = require("ethers");
    signer = new NonceManager(rawSigner);
    signer.address = await rawSigner.getAddress();
  }
  console.log("=".repeat(64));
  console.log(`Pre-launch ${action.toUpperCase()} | ${net} (${chainId}) | DRY_RUN=${dryRun}`);
  console.log("=".repeat(64));
  console.log(`WagerRegistry:     ${wagerAddr}`);
  console.log(`MembershipManager: ${lockMemberships ? mmAddr : "(skipped — LOCK_MEMBERSHIPS=false)"}`);
  console.log(`Signer:            ${signer ? signer.address : "(none — dry run only)"}`);
  console.log("");

  const provider = ethers.provider;
  const wager = new ethers.Contract(wagerAddr, WAGER_ABI, signer || provider);
  const mm = new ethers.Contract(mmAddr, MM_ABI, signer || provider);

  // ---- 1. WagerRegistry pause / unpause -------------------------------------
  const isPaused = await wager.paused();
  if (isPaused === wantPaused) {
    console.log(`WagerRegistry already ${wantPaused ? "paused" : "unpaused"} — skipping.`);
  } else {
    if (signer && !dryRun) {
      const ok = await wager.hasRole(GUARDIAN_ROLE, signer.address);
      if (!ok) throw new Error(`Signer ${signer.address} lacks GUARDIAN_ROLE on WagerRegistry.`);
    }
    console.log(`${dryRun ? "[would]" : "[exec]"} WagerRegistry.${wantPaused ? "pause" : "unpause"}()`);
    if (!dryRun) {
      const tx = wantPaused ? await wager.pause() : await wager.unpause();
      await tx.wait();
      console.log(`    ↳ ${(await wager.paused()) ? "paused" : "unpaused"} (tx ${tx.hash})`);
    }
  }

  // ---- 2. MembershipManager tier (de)activation -----------------------------
  if (lockMemberships) {
    if (signer && !dryRun) {
      const ok = await mm.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
      if (!ok) throw new Error(`Signer ${signer.address} lacks DEFAULT_ADMIN_ROLE on MembershipManager.`);
    }
    for (const tier of SEEDED_TIERS) {
      const cfg = await mm.getTierConfig(WAGER_PARTICIPANT_ROLE, tier);
      if (Number(cfg.priceUSDC) === 0 && Number(cfg.durationDays) === 0) {
        console.log(`Tier ${TIER_NAMES[tier]}: not seeded — skipping.`);
        continue;
      }
      if (cfg.active === wantActive) {
        console.log(`Tier ${TIER_NAMES[tier]}: already active=${wantActive} — skipping.`);
        continue;
      }
      console.log(
        `${dryRun ? "[would]" : "[exec]"} setTier ${TIER_NAMES[tier]} active=${wantActive} ` +
        `(price=${ethers.formatUnits(cfg.priceUSDC, 6)} USDC, ${cfg.durationDays}d, ` +
        `${cfg.limits.monthlyMarketCreation || "∞"}/mo, ${cfg.limits.maxConcurrentMarkets || "∞"} concurrent)`
      );
      if (!dryRun) {
        const tx = await mm.setTier(
          WAGER_PARTICIPANT_ROLE,
          tier,
          cfg.priceUSDC,
          cfg.durationDays,
          { monthlyMarketCreation: cfg.limits.monthlyMarketCreation, maxConcurrentMarkets: cfg.limits.maxConcurrentMarkets },
          wantActive
        );
        await tx.wait();
        console.log(`    ↳ active=${wantActive} (tx ${tx.hash})`);
      }
    }
  }

  console.log("");
  if (dryRun) {
    console.log("DRY RUN — no transactions sent. Re-run with DRY_RUN=false (floppy mounted) to apply.");
  } else {
    console.log(lock
      ? "Lockdown applied. WagerRegistry paused; membership purchases blocked. grantMembership (migration) still works."
      : "Lockdown lifted. WagerRegistry live; membership tiers active. Go-live ready.");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
