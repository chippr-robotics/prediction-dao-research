const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Targeted tests for the new oracle-registry surface on WagerRegistry:
//   - setOracleAdapter validation
//   - autoResolveFromOracle dispatch
//   - createWager validation for the three new ResolutionType values
// The end-to-end happy paths live in the per-adapter integration files.

const Tier = { Bronze: 1 };
const Resolution = {
  Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4,
  ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7,
};
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("WagerRegistry oracle registry", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USDC", "USDC", 0);

    const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await Ctf.deploy();
    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const pmAdapter = await PolymarketAdapter.deploy(await ctf.getAddress());

    const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed = await Agg.deploy(0n, 8, await time.latest());
    const ClAdapter = await ethers.getContractFactory("ChainlinkDataFeedOracleAdapter");
    const clAdapter = await ClAdapter.deploy(admin.address);
    await clAdapter.setFeedAllowed(await feed.getAddress(), true);

    const Membership = await ethers.getContractFactory("MembershipManager");
    const mgr = await Membership.deploy(admin.address, await usdcToken.getAddress(), treasury.address);
    await mgr.connect(admin).setTier(
      WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30,
      { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 }, true
    );

    const WagerRegistry = await ethers.getContractFactory("WagerRegistry");
    const reg = await WagerRegistry.deploy(
      admin.address, await mgr.getAddress(), await pmAdapter.getAddress(),
      [await usdcToken.getAddress()]
    );
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    }

    return { reg, mgr, usdcToken, clAdapter, feed, pmAdapter, admin, alice, bob, charlie };
  }

  describe("setOracleAdapter", () => {
    it("only an admin can call (caller without DEFAULT_ADMIN_ROLE reverts)", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(
        fx.reg.connect(fx.alice).setOracleAdapter(Resolution.UMA, await fx.clAdapter.getAddress())
      ).to.be.revertedWithCustomError(fx.reg, "AccessControlUnauthorizedAccount");
    });

    it("rejects non-extensible enum values (Either/Creator/Opponent/ThirdParty/Polymarket)", async () => {
      const fx = await loadFixture(deployFixture);
      const addr = await fx.clAdapter.getAddress();
      for (const rt of [Resolution.Either, Resolution.Creator, Resolution.Opponent, Resolution.ThirdParty, Resolution.Polymarket]) {
        await expect(fx.reg.connect(fx.admin).setOracleAdapter(rt, addr))
          .to.be.revertedWithCustomError(fx.reg, "UnsupportedOracleResolutionType");
      }
    });

    it("stores the adapter and emits OracleAdapterUpdated for each new oracle type", async () => {
      const fx = await loadFixture(deployFixture);
      const addr = await fx.clAdapter.getAddress();
      for (const rt of [Resolution.ChainlinkDataFeed, Resolution.ChainlinkFunctions, Resolution.UMA]) {
        await expect(fx.reg.connect(fx.admin).setOracleAdapter(rt, addr))
          .to.emit(fx.reg, "OracleAdapterUpdated").withArgs(rt, addr);
        expect(await fx.reg.oracleAdapters(rt)).to.equal(addr);
      }
    });

    it("setting an adapter to zero disables that resolution type", async () => {
      const fx = await loadFixture(deployFixture);
      const addr = await fx.clAdapter.getAddress();
      await fx.reg.connect(fx.admin).setOracleAdapter(Resolution.ChainlinkDataFeed, addr);
      await fx.reg.connect(fx.admin).setOracleAdapter(Resolution.ChainlinkDataFeed, ethers.ZeroAddress);
      expect(await fx.reg.oracleAdapters(Resolution.ChainlinkDataFeed)).to.equal(ethers.ZeroAddress);
    });
  });

  describe("createWager validation for new oracle types", () => {
    async function tryCreate(fx, resolutionType, conditionId) {
      const now = await time.latest();
      return fx.reg.connect(fx.alice).createWager(
        fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
        usdc(10), usdc(10), now + 1800, now + 7200,
        resolutionType, conditionId, true, ethers.id("meta")
      );
    }

    it("requires a non-zero conditionId for each new oracle type", async () => {
      const fx = await loadFixture(deployFixture);
      const addr = await fx.clAdapter.getAddress();
      // Set all three adapters so OracleAdapterNotSet doesn't shadow the conditionId check
      for (const rt of [Resolution.ChainlinkDataFeed, Resolution.ChainlinkFunctions, Resolution.UMA]) {
        await fx.reg.connect(fx.admin).setOracleAdapter(rt, addr);
        await expect(tryCreate(fx, rt, ethers.ZeroHash))
          .to.be.revertedWithCustomError(fx.reg, "OracleConditionRequired");
      }
    });

    it("rejects non-oracle types passed a conditionId (PolymarketDisallowed)", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(tryCreate(fx, Resolution.Either, ethers.id("foo")))
        .to.be.revertedWithCustomError(fx.reg, "PolymarketDisallowed");
      await expect(tryCreate(fx, Resolution.Creator, ethers.id("foo")))
        .to.be.revertedWithCustomError(fx.reg, "PolymarketDisallowed");
    });
  });

  describe("autoResolveFromOracle dispatch", () => {
    it("rejects on legacy resolution types (Either/Creator/Opponent/ThirdParty)", async () => {
      const fx = await loadFixture(deployFixture);
      const now = await time.latest();
      const tx = await fx.reg.connect(fx.alice).createWager(
        fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
        usdc(10), usdc(10), now + 1800, now + 7200,
        Resolution.Either, ethers.ZeroHash, true, ethers.id("meta")
      );
      const rcpt = await tx.wait();
      const ev = rcpt.logs.map(l => { try { return fx.reg.interface.parseLog(l); } catch { return null; } })
        .find(p => p && p.name === "WagerCreated");
      const wagerId = Number(ev.args.wagerId);
      await fx.reg.connect(fx.bob).acceptWager(wagerId);
      await expect(fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId))
        .to.be.revertedWithCustomError(fx.reg, "NotAuthorized");
    });

    it("rejects on Polymarket type (use autoResolveFromPolymarket instead)", async () => {
      const fx = await loadFixture(deployFixture);
      const oracle = "0x0000000000000000000000000000000000000001";
      const qid = ethers.id("Q-pm");
      const pmAdapterAddr = await fx.reg.polymarketAdapter();
      const pmAdapter = await ethers.getContractAt("PolymarketOracleAdapter", pmAdapterAddr);
      const ctf = await ethers.getContractAt("MockPolymarketCTF", await pmAdapter.polymarketCTF());
      await ctf.prepareCondition(oracle, qid, 2);
      const cid = ethers.keccak256(ethers.solidityPacked(["address", "bytes32", "uint256"], [oracle, qid, 2]));
      const now = await time.latest();
      const tx = await fx.reg.connect(fx.alice).createWager(
        fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
        usdc(10), usdc(10), now + 1800, now + 7200,
        Resolution.Polymarket, cid, true, ethers.id("meta")
      );
      const rcpt = await tx.wait();
      const ev = rcpt.logs.map(l => { try { return fx.reg.interface.parseLog(l); } catch { return null; } })
        .find(p => p && p.name === "WagerCreated");
      const wagerId = Number(ev.args.wagerId);
      await fx.reg.connect(fx.bob).acceptWager(wagerId);
      await expect(fx.reg.connect(fx.charlie).autoResolveFromOracle(wagerId))
        .to.be.revertedWithCustomError(fx.reg, "NotAuthorized");
    });
  });
});
