const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const Tier = { None: 0, Bronze: 1 };
const Resolution = {
  Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4,
  ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7,
};
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const Op = { GT: 0, GTE: 1, LT: 2, LTE: 3, EQ: 4 };
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("WagerRegistry + ChainlinkDataFeedOracleAdapter (integration)", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    const wmatic = await MockERC20.deploy("Wrapped Matic", "WMATIC", 0);

    // Polymarket CTF still required by WagerRegistry ctor (zero-adapter would also work).
    const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await Ctf.deploy();
    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const pmAdapter = await PolymarketAdapter.deploy(await ctf.getAddress());

    const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed = await Agg.deploy(0n, 8, await time.latest());
    const ClAdapter = await ethers.getContractFactory("ChainlinkDataFeedOracleAdapter");
    const clAdapter = await ClAdapter.deploy();
    await clAdapter.setFeedAllowed(await feed.getAddress(), true);

    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    const mgr = await MembershipManager.deploy(admin.address, await usdcToken.getAddress(), treasury.address);
    await mgr.connect(admin).setTier(
      WAGER_PARTICIPANT_ROLE, Tier.Bronze,
      usdc(50), 30,
      { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 },
      true
    );

    const WagerRegistry = await ethers.getContractFactory("WagerRegistry");
    const reg = await WagerRegistry.deploy(
      admin.address, await mgr.getAddress(), await pmAdapter.getAddress(),
      [await usdcToken.getAddress(), await wmatic.getAddress()]
    );
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);
    await reg.connect(admin).setOracleAdapter(Resolution.ChainlinkDataFeed, await clAdapter.getAddress());

    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    }

    return { reg, mgr, usdcToken, clAdapter, feed, admin, alice, bob, charlie };
  }

  async function setupWager(fx, opts = {}) {
    const { clAdapter, feed, reg, alice, bob, usdcToken } = fx;
    const conditionId = ethers.id("c-" + Math.random());
    const evalDeadline = (await time.latest()) + 3600;
    await clAdapter.registerCondition(conditionId, await feed.getAddress(), opts.threshold ?? 2500_00000000n, opts.op ?? Op.GT, evalDeadline);
    const now = await time.latest();
    const tx = await reg.connect(alice).createWager(
      bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
      usdc(10), usdc(10),
      now + 1800, now + 7200,
      Resolution.ChainlinkDataFeed,
      conditionId,
      opts.creatorIsYes ?? true,
      ethers.id("meta")
    );
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "WagerCreated");
    const wagerId = Number(ev.args.wagerId);
    await reg.connect(bob).acceptWager(wagerId);
    return { wagerId, conditionId, evalDeadline };
  }

  it("end-to-end: creator wins when ETH price exceeds threshold and creatorIsYes=true", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId, evalDeadline } = await setupWager(fx, { creatorIsYes: true });
    await time.increaseTo(evalDeadline + 1);
    await fx.feed.setAnswer(3000_00000000n, evalDeadline + 1);
    await fx.clAdapter.evaluate(conditionId);
    await fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId);
    const w = await fx.reg.getWager(wagerId);
    expect(w.status).to.equal(Status.Resolved);
    expect(w.winner).to.equal(fx.alice.address);
    const balBefore = await fx.usdcToken.balanceOf(fx.alice.address);
    await fx.reg.connect(fx.alice).claimPayout(wagerId);
    expect(await fx.usdcToken.balanceOf(fx.alice.address) - balBefore).to.equal(usdc(20));
  });

  it("opponent wins when price falls short", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId, evalDeadline } = await setupWager(fx, { creatorIsYes: true });
    await time.increaseTo(evalDeadline + 1);
    await fx.feed.setAnswer(2000_00000000n, evalDeadline + 1);
    await fx.clAdapter.evaluate(conditionId);
    await fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId);
    expect((await fx.reg.getWager(wagerId)).winner).to.equal(fx.bob.address);
  });

  it("autoResolveFromOracle reverts before evaluate (ConditionNotResolved)", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId } = await setupWager(fx);
    await expect(fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId))
      .to.be.revertedWithCustomError(fx.reg, "ConditionNotResolved");
  });

  it("createWager reverts when adapter is unset", async () => {
    const fx = await loadFixture(deployFixture);
    await fx.reg.connect(fx.admin).setOracleAdapter(Resolution.ChainlinkDataFeed, ethers.ZeroAddress);
    const conditionId = ethers.id("cz");
    const now = await time.latest();
    await expect(fx.reg.connect(fx.alice).createWager(
      fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
      usdc(10), usdc(10), now + 1800, now + 7200,
      Resolution.ChainlinkDataFeed, conditionId, true, ethers.id("meta")
    )).to.be.revertedWithCustomError(fx.reg, "OracleAdapterNotSet");
  });

  it("createWager reverts when condition is already resolved (stale-condition mitigation)", async () => {
    const fx = await loadFixture(deployFixture);
    const conditionId = ethers.id("c-stale");
    const evalDeadline = (await time.latest()) + 600;
    await fx.clAdapter.registerCondition(conditionId, await fx.feed.getAddress(), 0n, Op.GTE, evalDeadline);
    await time.increaseTo(evalDeadline + 1);
    await fx.feed.setAnswer(1n, evalDeadline + 1);
    await fx.clAdapter.evaluate(conditionId);
    const now = await time.latest();
    await expect(fx.reg.connect(fx.alice).createWager(
      fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
      usdc(10), usdc(10), now + 1800, now + 7200,
      Resolution.ChainlinkDataFeed, conditionId, true, ethers.id("meta")
    )).to.be.revertedWithCustomError(fx.reg, "ConditionAlreadyResolved");
  });

  it("declareWinner is blocked for ChainlinkDataFeed wagers", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId } = await setupWager(fx);
    await expect(fx.reg.connect(fx.alice).declareWinner(wagerId, fx.alice.address))
      .to.be.revertedWithCustomError(fx.reg, "NotAuthorized");
  });
});
