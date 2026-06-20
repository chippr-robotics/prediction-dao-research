const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry } = require("../../helpers/proxy");

// End-to-end USER-FLOW coverage: full lifecycle journeys through the deployed
// stack (MembershipManager + PolymarketOracleAdapter + WagerRegistry), proving
// the happy and unhappy paths users actually take, with real token transfers
// and membership accounting. Complements the per-function WagerRegistry unit
// tests by exercising the flows end-to-end.
const Tier = { None: 0, Bronze: 1 };
const Resolution = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4 };
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5 };
const ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

async function buildStack(concurrentLimit) {
  const [admin, alice, bob, carol, treasury] = await ethers.getSigners();
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy("USD Coin", "USDC", 0);
  const wmatic = await MockERC20.deploy("Wrapped Matic", "WMATIC", 0);

  const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
  const ctf = await Ctf.deploy();
  const Adapter = await ethers.getContractFactory("PolymarketOracleAdapter");
  const adapter = await Adapter.deploy(admin.address, await ctf.getAddress());

  const Mgr = await ethers.getContractFactory("MembershipManager");
  const mgr = await Mgr.deploy(admin.address, await token.getAddress(), treasury.address);
  await mgr.connect(admin).setTier(ROLE, Tier.Bronze, usdc(50), 30,
    { monthlyMarketCreation: 1000, maxConcurrentMarkets: concurrentLimit }, true);

  const reg = await deployWagerRegistry([admin.address, await mgr.getAddress(), await adapter.getAddress(),
    [await token.getAddress(), await wmatic.getAddress()]]);
  await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

  for (const u of [alice, bob, carol]) {
    await token.mint(u.address, usdc(100_000));
    await token.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
    await token.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
    await mgr.connect(u).purchaseTier(ROLE, Tier.Bronze);
  }
  return { reg, mgr, token, ctf, adapter, admin, alice, bob, carol };
}
const fix = () => buildStack(10);
const lowLimitFix = () => buildStack(2);

async function open(fx, opts = {}) {
  const { reg, token, alice, bob } = fx;
  const now = await time.latest();
  const resType = opts.resType ?? Resolution.Either;
  let conditionId = ethers.ZeroHash;
  if (resType === Resolution.Polymarket) {
    const qid = ethers.id("q-" + Math.random());
    conditionId = await fx.ctf.getConditionId(fx.admin.address, qid, 2);
    await fx.ctf.prepareCondition(fx.admin.address, qid, 2);
  }
  const tx = await reg.connect(alice).createWager(
    bob.address, ethers.ZeroAddress, await token.getAddress(),
    usdc(10), usdc(10), now + 1800, now + 7200,
    resType, conditionId, opts.creatorIsYes ?? true, ethers.id("m"), ""
  );
  const rc = await tx.wait();
  const id = Number(rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
    .find((p) => p && p.name === "WagerCreated").args.wagerId);
  return { id, conditionId };
}

describe("FairWins lifecycle (end-to-end user flows)", function () {
  it("HAPPY: membership → create → accept → manual resolve (Either) → claim payout", async () => {
    const fx = await loadFixture(fix);
    const { id } = await open(fx);
    await fx.reg.connect(fx.bob).acceptWager(id);
    expect((await fx.reg.getWager(id)).status).to.equal(Status.Active);
    await fx.reg.connect(fx.alice).declareWinner(id, fx.alice.address);
    const before = await fx.token.balanceOf(fx.alice.address);
    await fx.reg.connect(fx.alice).claimPayout(id);
    expect((await fx.token.balanceOf(fx.alice.address)) - before).to.equal(usdc(20));
    expect((await fx.reg.getWager(id)).status).to.equal(Status.Resolved);
  });

  it("HAPPY: Polymarket oracle wager → accept → auto-resolve YES → creator claims", async () => {
    const fx = await loadFixture(fix);
    const { id, conditionId } = await open(fx, { resType: Resolution.Polymarket, creatorIsYes: true });
    await fx.reg.connect(fx.bob).acceptWager(id);
    await fx.ctf.resolveCondition(conditionId, [1, 0]); // YES wins
    await fx.reg.connect(fx.carol).autoResolveFromPolymarket(id); // permissionless
    expect((await fx.reg.getWager(id)).winner).to.equal(fx.alice.address);
    const before = await fx.token.balanceOf(fx.alice.address);
    await fx.reg.connect(fx.alice).claimPayout(id);
    expect((await fx.token.balanceOf(fx.alice.address)) - before).to.equal(usdc(20));
  });

  it("UNHAPPY: opponent never accepts → creator refunded after accept deadline", async () => {
    const fx = await loadFixture(fix);
    const { id } = await open(fx);
    const before = await fx.token.balanceOf(fx.alice.address);
    await time.increase(1801);
    await fx.reg.connect(fx.alice).claimRefund(id);
    expect((await fx.token.balanceOf(fx.alice.address)) - before).to.equal(usdc(10));
    expect((await fx.reg.getWager(id)).status).to.equal(Status.Refunded);
  });

  it("UNHAPPY: oracle never resolves → both parties refunded after resolve deadline", async () => {
    const fx = await loadFixture(fix);
    const { id } = await open(fx, { resType: Resolution.Polymarket });
    await fx.reg.connect(fx.bob).acceptWager(id);
    const aB = await fx.token.balanceOf(fx.alice.address);
    const bB = await fx.token.balanceOf(fx.bob.address);
    await time.increase(7201);
    await fx.reg.connect(fx.carol).claimRefund(id);
    expect((await fx.token.balanceOf(fx.alice.address)) - aB).to.equal(usdc(10));
    expect((await fx.token.balanceOf(fx.bob.address)) - bB).to.equal(usdc(10));
  });

  it("MEMBERSHIP: concurrent-limit enforced, freed when a wager closes", async () => {
    const fx = await loadFixture(lowLimitFix); // maxConcurrentMarkets = 2
    const a = await open(fx);
    const b = await open(fx);
    // third create exceeds the concurrent limit
    await expect(open(fx)).to.be.revertedWithCustomError(fx.reg, "MembershipDenied");
    // close one (cancel the still-Open wager) → frees a slot
    await fx.reg.connect(fx.alice).cancelOpen(a.id);
    await expect(open(fx)).to.not.be.reverted;
  });

  it("ADMIN PAUSE: blocks new wagers but in-flight settlement + claim still work", async () => {
    const fx = await loadFixture(fix);
    const { id } = await open(fx);
    await fx.reg.connect(fx.bob).acceptWager(id);
    await fx.reg.connect(fx.admin).pause();
    await expect(open(fx)).to.be.revertedWithCustomError(fx.reg, "EnforcedPause");
    // settlement + claim are intentionally NOT pause-gated
    await fx.reg.connect(fx.alice).declareWinner(id, fx.bob.address);
    await expect(fx.reg.connect(fx.bob).claimPayout(id)).to.not.be.reverted;
    await fx.reg.connect(fx.admin).unpause();
    await expect(open(fx)).to.not.be.reverted;
  });

  it("ADMIN FREEZE: a frozen winner cannot claim until unfrozen", async () => {
    const fx = await loadFixture(fix);
    const { id } = await open(fx);
    await fx.reg.connect(fx.bob).acceptWager(id);
    await fx.reg.connect(fx.alice).declareWinner(id, fx.alice.address);
    await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "review");
    await expect(fx.reg.connect(fx.alice).claimPayout(id)).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    await fx.reg.connect(fx.admin).unfreezeAccount(fx.alice.address);
    await expect(fx.reg.connect(fx.alice).claimPayout(id)).to.not.be.reverted;
  });
});
