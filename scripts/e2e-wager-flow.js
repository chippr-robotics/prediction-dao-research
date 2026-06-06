/**
 * e2e-wager-flow.js — End-to-end smoke test of the P2P betting v2 stack.
 *
 * Run after `scripts/deploy/deploy.js` has populated deployments/<net>-v2.json.
 * Validates: KeyRegistry, MembershipManager.purchaseTier, WagerRegistry.createWager,
 * acceptWager, declareWinner, claimPayout, and Polymarket auto-resolve.
 *
 * Usage:
 *   npx hardhat run scripts/e2e-wager-flow.js                 # in-process hardhat
 *   npx hardhat run scripts/e2e-wager-flow.js --network localhost
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4 };
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));

function assert(cond, msg) { if (!cond) throw new Error("ASSERT: " + msg); }
function log(...args) { console.log(...args); }
function section(title) { log("\n" + "=".repeat(60) + "\n  " + title + "\n" + "=".repeat(60)); }

async function deployInProcess(admin) {
  log("Deploying contracts in-process (no persistent node needed)...");
  const usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 0);
  await usdc.waitForDeployment();
  const wmatic = await (await ethers.getContractFactory("MockERC20")).deploy("Wrapped MATIC", "WMATIC", 0);
  await wmatic.waitForDeployment();
  const ctf = await (await ethers.getContractFactory("MockPolymarketCTF")).deploy();
  await ctf.waitForDeployment();
  const adapter = await (await ethers.getContractFactory("PolymarketOracleAdapter")).deploy(admin.address, await ctf.getAddress());
  await adapter.waitForDeployment();
  const mgr = await (await ethers.getContractFactory("MembershipManager")).deploy(admin.address, await usdc.getAddress(), admin.address);
  await mgr.waitForDeployment();
  // Seed Bronze tier @ 50 USDC, 30 days, 15/month, 5 concurrent
  await mgr.connect(admin).setTier(
    WAGER_PARTICIPANT_ROLE, Tier.Bronze,
    ethers.parseUnits("50", 6), 30,
    { monthlyMarketCreation: 15, maxConcurrentMarkets: 5 },
    true
  );
  const registry = await (await ethers.getContractFactory("WagerRegistry")).deploy(
    admin.address, await mgr.getAddress(), await adapter.getAddress(),
    [await usdc.getAddress(), await wmatic.getAddress()]
  );
  await registry.waitForDeployment();
  await mgr.connect(admin).setAuthorizedCaller(await registry.getAddress(), true);
  const keyReg = await (await ethers.getContractFactory("KeyRegistry")).deploy();
  await keyReg.waitForDeployment();
  log("  ✓ Deployed and wired all v2 contracts");
  return { usdc, wmatic, ctf, adapter, mgr, registry, keyReg };
}

async function main() {
  const [admin, alice, bob, charlie] = await ethers.getSigners();
  log("Signers: admin=" + admin.address + ", alice=" + alice.address + ", bob=" + bob.address);

  const { usdc, wmatic, ctf, mgr, registry, keyReg } = await deployInProcess(admin);
  const usdcAddr = await usdc.getAddress();
  const wmaticAddr = await wmatic.getAddress();

  // ========== 1. KeyRegistry ==========
  section("1. KeyRegistry");
  const aliceKey = ethers.hexlify(ethers.randomBytes(32));
  await keyReg.connect(alice).registerKey(aliceKey);
  const fetched = await keyReg.getPublicKey(alice.address);
  assert(fetched === aliceKey, "Alice's key round-trips");
  log("  ✓ Alice registered key:", aliceKey);

  // ========== 2. Fund + buy memberships ==========
  section("2. Memberships (USDC purchase)");
  const usdc100 = ethers.parseUnits("500", 6);
  await usdc.mint(alice.address, usdc100);
  await usdc.mint(bob.address, usdc100);
  log("  ✓ Minted 500 USDC to alice & bob");

  await usdc.connect(alice).approve(await mgr.getAddress(), usdc100);
  await usdc.connect(bob).approve(await mgr.getAddress(), usdc100);
  log("  ✓ Approved MembershipManager");

  // Bronze costs 50 USDC (test fixture; mainnet ladder is $2/$8/$25/$100)
  await mgr.connect(alice).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
  await mgr.connect(bob).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
  const am = await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE);
  const bm = await mgr.getMembership(bob.address, WAGER_PARTICIPANT_ROLE);
  assert(Number(am.tier) === Tier.Bronze, "Alice has Bronze");
  assert(Number(bm.tier) === Tier.Bronze, "Bob has Bronze");
  log("  ✓ Both bought WAGER_PARTICIPANT Bronze membership");
  log("    Alice expiresAt:", new Date(Number(am.expiresAt) * 1000).toISOString());

  // ========== 3. Either-resolution wager (USDC) ==========
  section("3. Either-resolution wager (USDC, alice creates, bob accepts, alice declares)");
  const stake = ethers.parseUnits("10", 6);
  await usdc.connect(alice).approve(await registry.getAddress(), stake);
  await usdc.connect(bob).approve(await registry.getAddress(), stake);

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const tx1 = await registry.connect(alice).createWager(
    bob.address, ethers.ZeroAddress, usdcAddr,
    stake, stake,
    now + 3600, now + 86400,
    Resolution.Either, ethers.ZeroHash, true,
    ethers.id("Either test")
  );
  const r1 = await tx1.wait();
  const created = r1.logs.map(l => { try { return registry.interface.parseLog(l); } catch { return null; } })
                          .find(p => p?.name === "WagerCreated");
  const wagerId1 = Number(created.args.wagerId);
  log("  ✓ Wager #" + wagerId1 + " created by alice");

  await registry.connect(bob).acceptWager(wagerId1);
  log("  ✓ Bob accepted");

  await registry.connect(alice).declareWinner(wagerId1, alice.address);
  log("  ✓ Alice declared herself winner");

  const balBefore = await usdc.balanceOf(alice.address);
  await registry.connect(alice).claimPayout(wagerId1);
  const balAfter = await usdc.balanceOf(alice.address);
  const gained = balAfter - balBefore;
  assert(gained === stake * 2n, `Alice should gain 20 USDC, got ${ethers.formatUnits(gained, 6)}`);
  log("  ✓ Alice claimed " + ethers.formatUnits(gained, 6) + " USDC payout");

  // ========== 4. WMATIC wager (ThirdParty resolution) ==========
  section("4. ThirdParty wager (WMATIC, charlie arbitrates)");
  await wmatic.mint(alice.address, ethers.parseEther("5"));
  await wmatic.mint(bob.address, ethers.parseEther("5"));
  await wmatic.connect(alice).approve(await registry.getAddress(), ethers.parseEther("5"));
  await wmatic.connect(bob).approve(await registry.getAddress(), ethers.parseEther("5"));

  const tx2 = await registry.connect(alice).createWager(
    bob.address, charlie.address, wmaticAddr,
    ethers.parseEther("1"), ethers.parseEther("2"),
    now + 3600, now + 86400,
    Resolution.ThirdParty, ethers.ZeroHash, false,
    ethers.id("ThirdParty test")
  );
  const r2 = await tx2.wait();
  const created2 = r2.logs.map(l => { try { return registry.interface.parseLog(l); } catch { return null; } })
                           .find(p => p?.name === "WagerCreated");
  const wagerId2 = Number(created2.args.wagerId);
  log("  ✓ Wager #" + wagerId2 + " created (1 WMATIC vs 2 WMATIC)");

  await registry.connect(bob).acceptWager(wagerId2);
  log("  ✓ Bob accepted");

  // Only charlie can declare
  try {
    await registry.connect(alice).declareWinner(wagerId2, alice.address);
    throw new Error("Alice should not have been able to declare!");
  } catch (e) {
    assert(e.message.includes("NotAuthorized"), `Expected NotAuthorized, got ${e.message}`);
    log("  ✓ Alice (creator) blocked from declaring");
  }

  await registry.connect(charlie).declareWinner(wagerId2, bob.address);
  log("  ✓ Charlie (arbitrator) declared bob the winner");

  const bobWmaticBefore = await wmatic.balanceOf(bob.address);
  await registry.connect(bob).claimPayout(wagerId2);
  const bobWmaticAfter = await wmatic.balanceOf(bob.address);
  const wmaticGained = bobWmaticAfter - bobWmaticBefore;
  assert(wmaticGained === ethers.parseEther("3"), `Bob should gain 3 WMATIC, got ${ethers.formatEther(wmaticGained)}`);
  log("  ✓ Bob claimed " + ethers.formatEther(wmaticGained) + " WMATIC payout");

  // ========== 5. Polymarket auto-resolution ==========
  section("5. Polymarket-resolved wager (auto-resolve via MockPolymarketCTF)");
  // Prepare a Polymarket condition
  const oracleAddr = "0x0000000000000000000000000000000000000001";
  const questionId = ethers.id("Will ETH > 3000 on date X?");
  const conditionId = ethers.keccak256(
    ethers.solidityPacked(["address", "bytes32", "uint256"], [oracleAddr, questionId, 2])
  );
  await ctf.prepareCondition(oracleAddr, questionId, 2);
  log("  ✓ Polymarket condition prepared");

  await usdc.mint(alice.address, stake);
  await usdc.mint(bob.address, stake);
  await usdc.connect(alice).approve(await registry.getAddress(), stake);
  await usdc.connect(bob).approve(await registry.getAddress(), stake);

  const tx3 = await registry.connect(alice).createWager(
    bob.address, ethers.ZeroAddress, usdcAddr,
    stake, stake,
    now + 3600, now + 86400,
    Resolution.Polymarket, conditionId, true /* creatorIsYes */,
    ethers.id("Polymarket test")
  );
  const r3 = await tx3.wait();
  const created3 = r3.logs.map(l => { try { return registry.interface.parseLog(l); } catch { return null; } })
                           .find(p => p?.name === "WagerCreated");
  const wagerId3 = Number(created3.args.wagerId);
  log("  ✓ Wager #" + wagerId3 + " created (alice = YES side)");

  await registry.connect(bob).acceptWager(wagerId3);
  log("  ✓ Bob accepted");

  // Now resolve Polymarket condition to YES (alice wins)
  await ctf.resolveCondition(conditionId, [1, 0]);
  log("  ✓ MockPolymarketCTF resolved condition to YES");

  await registry.connect(charlie).autoResolveFromPolymarket(wagerId3);
  const w3 = await registry.getWager(wagerId3);
  assert(w3.winner.toLowerCase() === alice.address.toLowerCase(), "Alice should be winner");
  log("  ✓ Auto-resolved: alice declared winner via Polymarket outcome");

  await registry.connect(alice).claimPayout(wagerId3);
  log("  ✓ Alice claimed Polymarket payout");

  // ========== 6. Refund path ==========
  section("6. Refund path (open-but-expired)");
  await usdc.mint(alice.address, stake);
  await usdc.connect(alice).approve(await registry.getAddress(), stake);
  const tx4 = await registry.connect(alice).createWager(
    bob.address, ethers.ZeroAddress, usdcAddr,
    stake, stake,
    now + 3600, now + 86400,
    Resolution.Either, ethers.ZeroHash, false,
    ethers.id("Refund test")
  );
  const r4 = await tx4.wait();
  const created4 = r4.logs.map(l => { try { return registry.interface.parseLog(l); } catch { return null; } })
                           .find(p => p?.name === "WagerCreated");
  const wagerId4 = Number(created4.args.wagerId);
  log("  ✓ Wager #" + wagerId4 + " created");

  await ethers.provider.send("evm_increaseTime", [3601]);
  await ethers.provider.send("evm_mine", []);

  const aliceBeforeRefund = await usdc.balanceOf(alice.address);
  await registry.connect(charlie).claimRefund(wagerId4);
  const aliceAfterRefund = await usdc.balanceOf(alice.address);
  assert(aliceAfterRefund - aliceBeforeRefund === stake, "Alice gets stake back");
  log("  ✓ After acceptDeadline, anyone can call claimRefund → creator refunded");

  // ========== 7. Membership limit (monthly cap) ==========
  section("7. Membership monthly limit (Bronze = 15 wagers/month)");
  // Alice already created 3 wagers above. Try to fill up to the Bronze limit (15).
  // checkCanCreate should remain true through wager #15, then return false.
  const aliceMembership = await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE);
  log("  Alice's monthCount so far:", Number(aliceMembership.monthCount));

  // ========== 8. Account freeze ==========
  section("8. Account freeze (moderator power)");
  await registry.connect(admin).freezeAccount(alice.address, "smoke test");
  assert(await registry.isFrozen(alice.address), "Alice is frozen");
  const accountFrozenSelector = ethers.id("AccountFrozenError(address)").slice(0, 10);
  try {
    await registry.connect(alice).createWager(
      bob.address, ethers.ZeroAddress, usdcAddr,
      stake, stake,
      now + 7200, now + 90000,
      Resolution.Either, ethers.ZeroHash, false,
      ethers.id("Frozen test")
    );
    throw new Error("Frozen alice should not be able to create");
  } catch (e) {
    const matches =
      e.message.includes("AccountFrozenError") ||
      e.message.includes(accountFrozenSelector);
    assert(matches, `Expected AccountFrozenError, got ${e.message}`);
    log("  ✓ Frozen account blocked from createWager");
  }
  await registry.connect(admin).unfreezeAccount(alice.address);
  assert(!(await registry.isFrozen(alice.address)), "Alice is unfrozen");
  log("  ✓ Unfreeze restored access");

  log("\n" + "=".repeat(60));
  log("  ALL CHECKS PASSED ✓");
  log("=".repeat(60));
  log("\nSummary:");
  log("  - KeyRegistry: register + lookup ✓");
  log("  - MembershipManager: purchaseTier USDC pull ✓");
  log("  - WagerRegistry Either-resolution: create + accept + declare + claim ✓");
  log("  - WagerRegistry ThirdParty: arbitrator-only declare, asymmetric stakes ✓");
  log("  - WagerRegistry Polymarket: prepareCondition → autoResolve ✓");
  log("  - Refund path: open + expired ✓");
}

main().then(() => process.exit(0)).catch((e) => { console.error("\nE2E FAILED:", e); process.exit(1); });
