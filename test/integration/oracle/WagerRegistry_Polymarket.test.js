const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry } = require("../../helpers/proxy");

const Tier = { None: 0, Bronze: 1 };
const Resolution = {
  Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4,
  ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7,
};
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5, Draw: 6 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

// Coverage for Polymarket tie handling. The adapter's getOutcome still returns
// the unresolved sentinel (resolvedAt=0) on a 50/50 tie (it never picks a fixed
// side). Spec Kit 004: the registry now recognizes a *resolved* tie
// (isConditionResolved==true while getOutcome.resolvedAt==0) and settles a DRAW
// immediately — returning both stakes without waiting for the deadline.
describe("WagerRegistry + PolymarketOracleAdapter — tie handling (integration)", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    const wmatic = await MockERC20.deploy("Wrapped Matic", "WMATIC", 0);

    const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await Ctf.deploy();
    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const pmAdapter = await PolymarketAdapter.deploy(admin.address, await ctf.getAddress());

    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    const mgr = await MembershipManager.deploy(admin.address, await usdcToken.getAddress(), treasury.address);
    await mgr.connect(admin).setTier(
      WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30,
      { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 }, true
    );

    const reg = await deployWagerRegistry([
      admin.address, await mgr.getAddress(), await pmAdapter.getAddress(),
      [await usdcToken.getAddress(), await wmatic.getAddress()]
    ]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    }

    return { reg, mgr, usdcToken, ctf, pmAdapter, admin, alice, bob, charlie };
  }

  // Prepares an (unresolved) CTF condition, opens a Polymarket wager on it, and accepts.
  async function makeWager(fx, { creatorIsYes = true } = {}) {
    const { ctf, reg, alice, bob, usdcToken, admin } = fx;
    const oracle = admin.address;
    const questionId = ethers.id("q-" + Math.random());
    const conditionId = await ctf.getConditionId(oracle, questionId, 2);
    await ctf.prepareCondition(oracle, questionId, 2);

    const now = await time.latest();
    const resolveDeadline = now + 7200;
    const tx = await reg.connect(alice).createWager(
      bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
      usdc(10), usdc(10), now + 1800, resolveDeadline,
      Resolution.Polymarket, conditionId, creatorIsYes, ethers.id("meta"), ""
    );
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "WagerCreated");
    const wagerId = Number(ev.args.wagerId);
    await reg.connect(bob).acceptWager(wagerId);
    return { wagerId, conditionId, resolveDeadline };
  }

  it("TIE: getOutcome returns the unresolved sentinel (uncached AND cached)", async () => {
    const fx = await loadFixture(deployFixture);
    const { conditionId } = await makeWager(fx);
    await fx.ctf.resolveCondition(conditionId, [1, 1]); // 50/50 tie

    // Uncached path (read live from CTF) — this is what autoResolveFromPolymarket uses.
    let res = await fx.pmAdapter.getOutcome(conditionId);
    expect(res[2]).to.equal(0n); // resolvedAt == 0 => "not decidable"

    // Cached path — populate the cache then re-read.
    await fx.pmAdapter.fetchResolution(conditionId);
    res = await fx.pmAdapter.getOutcome(conditionId);
    expect(res[2]).to.equal(0n);
  });

  it("TIE: autoResolveFromPolymarket settles a DRAW immediately, returning both stakes (no deadline wait)", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId } = await makeWager(fx, { creatorIsYes: true });
    await fx.ctf.resolveCondition(conditionId, [1, 1]); // 50/50 tie

    const aBefore = await fx.usdcToken.balanceOf(fx.alice.address);
    const bBefore = await fx.usdcToken.balanceOf(fx.bob.address);
    // Anyone may trigger; settles a draw without advancing past the deadline.
    await expect(fx.reg.connect(fx.charlie).autoResolveFromPolymarket(wagerId))
      .to.emit(fx.reg, "WagerDrawn").withArgs(wagerId, fx.alice.address, fx.bob.address, fx.charlie.address);

    expect((await fx.reg.getWager(wagerId)).status).to.equal(Status.Draw);
    expect((await fx.usdcToken.balanceOf(fx.alice.address)) - aBefore).to.equal(usdc(10));
    expect((await fx.usdcToken.balanceOf(fx.bob.address)) - bBefore).to.equal(usdc(10));
  });

  it("TIE settles a DRAW regardless of creatorIsYes (not a fixed-side win)", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId } = await makeWager(fx, { creatorIsYes: false });
    await fx.ctf.resolveCondition(conditionId, [1, 1]);
    const aBefore = await fx.usdcToken.balanceOf(fx.alice.address);
    const bBefore = await fx.usdcToken.balanceOf(fx.bob.address);
    await fx.reg.connect(fx.charlie).autoResolveFromPolymarket(wagerId);
    expect((await fx.reg.getWager(wagerId)).status).to.equal(Status.Draw);
    expect((await fx.usdcToken.balanceOf(fx.alice.address)) - aBefore).to.equal(usdc(10));
    expect((await fx.usdcToken.balanceOf(fx.bob.address)) - bBefore).to.equal(usdc(10));
  });

  // Note: a real "invalid"/disputed Polymarket market resolves with EQUAL payout
  // numerators (e.g. [1,1]) — the Gnosis/Polymarket CTF forbids an all-zero
  // payout (denominator must be > 0), so [0,0] is not a representable state. The
  // equal-numerator "invalid" case is the tie case covered above.

  it("UNRESOLVED market still reverts ConditionNotResolved (no draw, no win)", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId } = await makeWager(fx, { creatorIsYes: true });
    // condition prepared but never resolved on the CTF
    await expect(fx.reg.connect(fx.charlie).autoResolveFromPolymarket(wagerId))
      .to.be.revertedWithCustomError(fx.reg, "ConditionNotResolved");
  });

  it("NON-TIE: creator wins when YES is favored and creatorIsYes=true", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId } = await makeWager(fx, { creatorIsYes: true });
    await fx.ctf.resolveCondition(conditionId, [1, 0]); // YES/PASS wins
    await fx.reg.connect(fx.charlie).autoResolveFromPolymarket(wagerId);
    const w = await fx.reg.getWager(wagerId);
    expect(w.status).to.equal(Status.Resolved);
    expect(w.winner).to.equal(fx.alice.address);
    const before = await fx.usdcToken.balanceOf(fx.alice.address);
    await fx.reg.connect(fx.alice).claimPayout(wagerId);
    expect((await fx.usdcToken.balanceOf(fx.alice.address)) - before).to.equal(usdc(20));
  });

  it("NON-TIE: opponent wins when NO is favored and creatorIsYes=true", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId } = await makeWager(fx, { creatorIsYes: true });
    await fx.ctf.resolveCondition(conditionId, [0, 1]); // NO/FAIL wins
    await fx.reg.connect(fx.charlie).autoResolveFromPolymarket(wagerId);
    expect((await fx.reg.getWager(wagerId)).winner).to.equal(fx.bob.address);
  });
});
