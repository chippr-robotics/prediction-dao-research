/**
 * Membership migration for Spec 007 cutover.
 *
 * The 007 redeploy creates a NEW MembershipManager (sanctions screening + on-chain terms
 * recording). Existing active memberships live on the OLD contract. This script re-grants
 * each still-active membership onto the NEW MembershipManager so members keep access after
 * the cutover (full-cutover migration).
 *
 * SAFETY:
 *   - DRY_RUN defaults to TRUE — it only LISTS what it would grant. Set DRY_RUN=false to execute.
 *   - Idempotent: skips users already active on the new contract.
 *   - Respects the new sanctions guard: grantMembership screens the grantee, so a sanctioned
 *     old member is correctly NOT migrated (logged as skipped).
 *   - Granting requires ROLE_MANAGER_ROLE on the NEW contract → run with the floppy keystore
 *     admin on a production network.
 *
 * USAGE:
 *   # dry run (default):
 *   OLD_MEMBERSHIP_MANAGER=0x... START_BLOCK=<oldMMdeployBlock> \
 *     npx hardhat run scripts/operations/migrate-memberships-007.js --network polygon
 *   # execute (after reviewing the dry-run output), with the floppy mounted:
 *   DRY_RUN=false OLD_MEMBERSHIP_MANAGER=0x... START_BLOCK=<oldMMdeployBlock> \
 *     npx hardhat run scripts/operations/migrate-memberships-007.js --network polygon
 *
 * The NEW MembershipManager address is read from deployments/<network>-chain<id>-v2.json
 * (written by the 007 deploy). The OLD address must be supplied (it is the pre-007 live one).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DAY = 86400n;
const CHUNK = 45_000;

const ABI = [
  "event MembershipPurchased(address indexed user, bytes32 indexed role, uint8 tier, uint128 price, uint64 expiresAt)",
  "event MembershipGranted(address indexed user, bytes32 indexed role, uint8 tier, uint64 expiresAt)",
  "function getMembership(address user, bytes32 role) view returns (tuple(uint8 tier, uint64 expiresAt, uint32 monthCount, uint64 monthAnchor, uint32 activeCount))",
  "function grantMembership(address user, bytes32 role, uint8 tier, uint32 durationDays) external",
];

async function main() {
  const net = hre.network.name;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const dryRun = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
  const oldAddr = process.env.OLD_MEMBERSHIP_MANAGER;
  const startBlock = Number(process.env.START_BLOCK || 0);

  if (!oldAddr || !ethers.isAddress(oldAddr)) {
    throw new Error("Set OLD_MEMBERSHIP_MANAGER to the pre-007 MembershipManager address.");
  }

  const depFile = path.join(__dirname, "..", "..", "deployments", `${net}-chain${chainId}-v2.json`);
  if (!fs.existsSync(depFile)) throw new Error(`Deployment file not found: ${depFile} (run the 007 deploy first).`);
  const newAddr = JSON.parse(fs.readFileSync(depFile, "utf8")).contracts?.membershipManager;
  if (!newAddr) throw new Error("membershipManager missing from deployment file.");
  if (newAddr.toLowerCase() === oldAddr.toLowerCase()) throw new Error("OLD and NEW MembershipManager are identical — nothing to migrate.");

  const [signer] = await ethers.getSigners();
  console.log(`Network: ${net} (${chainId}) | DRY_RUN=${dryRun}`);
  console.log(`OLD MembershipManager: ${oldAddr}`);
  console.log(`NEW MembershipManager: ${newAddr}`);
  console.log(`Signer: ${signer ? signer.address : "(none — dry run only)"}`);

  const provider = ethers.provider;
  const oldMM = new ethers.Contract(oldAddr, ABI, provider);
  const newMM = new ethers.Contract(newAddr, ABI, signer || provider);

  // 1. Enumerate unique (user, role) from the old contract's grant-creating events (paged).
  const latest = await provider.getBlockNumber();
  const seen = new Set();
  const pairs = [];
  for (const evName of ["MembershipPurchased", "MembershipGranted"]) {
    const filter = oldMM.filters[evName]();
    let to = latest;
    while (to >= startBlock) {
      const from = Math.max(startBlock, to - CHUNK + 1);
      const logs = await oldMM.queryFilter(filter, from, to);
      for (const l of logs) {
        const k = `${l.args.user.toLowerCase()}|${l.args.role}`;
        if (!seen.has(k)) { seen.add(k); pairs.push({ user: l.args.user, role: l.args.role }); }
      }
      if (from === startBlock) break;
      to = from - 1;
    }
  }
  console.log(`Found ${pairs.length} unique (user, role) memberships in old contract history.`);

  // 2. Re-grant still-active ones onto the new contract (idempotent + sanctions-aware).
  const now = BigInt(Math.floor(Date.now() / 1000));
  let migrated = 0, skippedInactive = 0, skippedExisting = 0, blocked = 0, failed = 0;
  for (const { user, role } of pairs) {
    const m = await oldMM.getMembership(user, role);
    if (Number(m.tier) === 0 || BigInt(m.expiresAt) <= now) { skippedInactive++; continue; }
    const existing = await newMM.getMembership(user, role);
    if (Number(existing.tier) !== 0 && BigInt(existing.expiresAt) > now) { skippedExisting++; continue; }
    const remainingDays = Number((BigInt(m.expiresAt) - now + DAY - 1n) / DAY); // ceil
    console.log(`  ${dryRun ? "[would grant]" : "[grant]"} ${user} role=${role.slice(0, 10)}… tier=${m.tier} days=${remainingDays}`);
    if (dryRun) { migrated++; continue; }
    try {
      const tx = await newMM.grantMembership(user, role, m.tier, remainingDays);
      await tx.wait();
      migrated++;
    } catch (e) {
      const msg = e.shortMessage || e.message || "";
      if (/Sanctioned/i.test(msg)) { blocked++; console.log(`    ↳ skipped (sanctioned): ${user}`); }
      else { failed++; console.error(`    ↳ FAILED ${user}: ${msg}`); }
    }
  }
  console.log(`\nSummary: ${dryRun ? "would migrate" : "migrated"}=${migrated} | already-active=${skippedExisting} | inactive=${skippedInactive} | sanctioned-blocked=${blocked} | failed=${failed}`);
  if (dryRun) console.log("DRY RUN — no transactions sent. Re-run with DRY_RUN=false (floppy mounted) to execute.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
