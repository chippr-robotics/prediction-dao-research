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
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("WagerRegistry + UMAOptimisticOracleV3Adapter (integration)", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    const wmatic = await MockERC20.deploy("Wrapped Matic", "WMATIC", 0);

    const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await Ctf.deploy();
    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const pmAdapter = await PolymarketAdapter.deploy(await ctf.getAddress());

    const OO = await ethers.getContractFactory("MockOptimisticOracleV3");
    const oo = await OO.deploy();
    const UmaAdapter = await ethers.getContractFactory("UMAOptimisticOracleV3Adapter");
    const umaAdapter = await UmaAdapter.deploy(admin.address, await oo.getAddress());

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
    await reg.connect(admin).setOracleAdapter(Resolution.UMA, await umaAdapter.getAddress());

    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await umaAdapter.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    }

    return { reg, mgr, usdcToken, umaAdapter, oo, admin, alice, bob, charlie };
  }

  async function setupWager(fx, opts = {}) {
    const { umaAdapter, reg, alice, bob, usdcToken } = fx;
    const conditionId = ethers.id("c-" + Math.random());
    await umaAdapter.registerCondition(
      conditionId,
      ethers.toUtf8Bytes("The Mets won game 7 on 2026-04-15"),
      await usdcToken.getAddress(),
      usdc(10),
      7200
    );
    const now = await time.latest();
    const tx = await reg.connect(alice).createWager(
      bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
      usdc(10), usdc(10),
      now + 1800, now + 14400,
      Resolution.UMA,
      conditionId,
      opts.creatorIsYes ?? true,
      ethers.id("meta"),
      ""
    );
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "WagerCreated");
    const wagerId = Number(ev.args.wagerId);
    await reg.connect(bob).acceptWager(wagerId);
    return { wagerId, conditionId };
  }

  async function assertAndResolve(fx, conditionId, asserter, truth) {
    const tx = await fx.umaAdapter.connect(asserter).assertResolution(conditionId, asserter.address);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return fx.umaAdapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "AssertionMade");
    await fx.oo.mockResolve(ev.args.assertionId, truth);
    return ev.args.assertionId;
  }

  it("end-to-end: creator wins when UMA assertion resolves true and creatorIsYes=true", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId } = await setupWager(fx, { creatorIsYes: true });
    await assertAndResolve(fx, conditionId, fx.alice, true);
    await fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId);
    const w = await fx.reg.getWager(wagerId);
    expect(w.status).to.equal(Status.Resolved);
    expect(w.winner).to.equal(fx.alice.address);
    const balBefore = await fx.usdcToken.balanceOf(fx.alice.address);
    await fx.reg.connect(fx.alice).claimPayout(wagerId);
    expect(await fx.usdcToken.balanceOf(fx.alice.address) - balBefore).to.equal(usdc(20));
  });

  it("opponent wins when assertion resolves false", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId } = await setupWager(fx, { creatorIsYes: true });
    await assertAndResolve(fx, conditionId, fx.alice, false);
    await fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId);
    expect((await fx.reg.getWager(wagerId)).winner).to.equal(fx.bob.address);
  });

  it("bond flows: asserter pays bond up-front, gets it back on settlement", async () => {
    const fx = await loadFixture(deployFixture);
    const { conditionId } = await setupWager(fx);
    const aliceBefore = await fx.usdcToken.balanceOf(fx.alice.address);
    const ooBefore = await fx.usdcToken.balanceOf(await fx.oo.getAddress());
    const tx = await fx.umaAdapter.connect(fx.alice).assertResolution(conditionId, fx.alice.address);
    const rcpt = await tx.wait();
    expect(await fx.usdcToken.balanceOf(await fx.oo.getAddress()) - ooBefore).to.equal(usdc(10));
    expect(aliceBefore - await fx.usdcToken.balanceOf(fx.alice.address)).to.equal(usdc(10));
    const ev = rcpt.logs.map(l => { try { return fx.umaAdapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "AssertionMade");
    await fx.oo.mockResolve(ev.args.assertionId, true);
    // Bond is back with alice
    expect(await fx.usdcToken.balanceOf(fx.alice.address)).to.equal(aliceBefore);
  });

  it("autoResolveFromOracle reverts before UMA settles", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId } = await setupWager(fx);
    await expect(fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId))
      .to.be.revertedWithCustomError(fx.reg, "ConditionNotResolved");
  });

  it("createWager reverts when adapter is unset", async () => {
    const fx = await loadFixture(deployFixture);
    await fx.reg.connect(fx.admin).setOracleAdapter(Resolution.UMA, ethers.ZeroAddress);
    const now = await time.latest();
    await expect(fx.reg.connect(fx.alice).createWager(
      fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
      usdc(10), usdc(10), now + 1800, now + 7200,
      Resolution.UMA, ethers.id("c"), true, ethers.id("meta"), ""
    )).to.be.revertedWithCustomError(fx.reg, "OracleAdapterNotSet");
  });
});
