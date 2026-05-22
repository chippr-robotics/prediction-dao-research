const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const Tier = { None: 0, Bronze: 1 };
const Resolution = {
  Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4,
  ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7,
};
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3 };
const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);
const DON_ID = "0x" + Buffer.from("fun-polygon-amoy-1").toString("hex").padEnd(64, "0");

describe("WagerRegistry + ChainlinkFunctionsOracleAdapter (integration)", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    const wmatic = await MockERC20.deploy("Wrapped Matic", "WMATIC", 0);

    const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await Ctf.deploy();
    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const pmAdapter = await PolymarketAdapter.deploy(await ctf.getAddress());

    const Router = await ethers.getContractFactory("MockFunctionsRouter");
    const router = await Router.deploy();
    const FnAdapter = await ethers.getContractFactory("ChainlinkFunctionsOracleAdapter");
    const fnAdapter = await FnAdapter.deploy(await router.getAddress());

    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    const mgr = await MembershipManager.deploy(admin.address, await usdcToken.getAddress(), treasury.address);
    await mgr.connect(admin).setTier(
      FRIEND_MARKET_ROLE, Tier.Bronze,
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
    await reg.connect(admin).setOracleAdapter(Resolution.ChainlinkFunctions, await fnAdapter.getAddress());

    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
    }

    return { reg, mgr, usdcToken, fnAdapter, router, admin, alice, bob, charlie };
  }

  async function setupWager(fx, opts = {}) {
    const { fnAdapter, reg, alice, bob, usdcToken } = fx;
    const conditionId = ethers.id("c-" + Math.random());
    const src = ethers.toUtf8Bytes("source");
    await fnAdapter.registerCondition(conditionId, src, ethers.keccak256(src), 1, 300_000, DON_ID);
    const now = await time.latest();
    const tx = await reg.connect(alice).createWager(
      bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
      usdc(10), usdc(10),
      now + 1800, now + 7200,
      Resolution.ChainlinkFunctions,
      conditionId,
      opts.creatorIsYes ?? true,
      ethers.id("meta")
    );
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "WagerCreated");
    const wagerId = Number(ev.args.wagerId);
    await reg.connect(bob).acceptWager(wagerId);
    return { wagerId, conditionId };
  }

  async function fulfill(adapter, router, conditionId, response) {
    const tx = await adapter.requestResolution(conditionId);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "ResolutionRequested");
    await router.fulfill(ev.args.requestId, response, "0x");
  }

  it("end-to-end: creator wins when DON returns true and creatorIsYes=true", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId } = await setupWager(fx, { creatorIsYes: true });
    await fulfill(fx.fnAdapter, fx.router, conditionId, "0x01");
    await fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId);
    const w = await fx.reg.getWager(wagerId);
    expect(w.status).to.equal(Status.Resolved);
    expect(w.winner).to.equal(fx.alice.address);
    const balBefore = await fx.usdcToken.balanceOf(fx.alice.address);
    await fx.reg.connect(fx.alice).claimPayout(wagerId);
    expect(await fx.usdcToken.balanceOf(fx.alice.address) - balBefore).to.equal(usdc(20));
  });

  it("opponent wins when DON returns false", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId, conditionId } = await setupWager(fx, { creatorIsYes: true });
    await fulfill(fx.fnAdapter, fx.router, conditionId, "0x00");
    await fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId);
    expect((await fx.reg.getWager(wagerId)).winner).to.equal(fx.bob.address);
  });

  it("autoResolveFromOracle reverts before DON fulfillment", async () => {
    const fx = await loadFixture(deployFixture);
    const { wagerId } = await setupWager(fx);
    await expect(fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId))
      .to.be.revertedWithCustomError(fx.reg, "ConditionNotResolved");
  });

  it("createWager reverts when adapter is unset", async () => {
    const fx = await loadFixture(deployFixture);
    await fx.reg.connect(fx.admin).setOracleAdapter(Resolution.ChainlinkFunctions, ethers.ZeroAddress);
    const now = await time.latest();
    await expect(fx.reg.connect(fx.alice).createWager(
      fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
      usdc(10), usdc(10), now + 1800, now + 7200,
      Resolution.ChainlinkFunctions, ethers.id("c"), true, ethers.id("meta")
    )).to.be.revertedWithCustomError(fx.reg, "OracleAdapterNotSet");
  });
});
