const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4 };
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5 };
const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));

const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("WagerRegistry", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    const wmatic = await MockERC20.deploy("Wrapped Matic", "WMATIC", 0);
    await usdcToken.waitForDeployment();
    await wmatic.waitForDeployment();

    const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await MockPolymarketCTF.deploy();
    await ctf.waitForDeployment();

    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const adapter = await PolymarketAdapter.deploy(await ctf.getAddress());
    await adapter.waitForDeployment();

    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    const mgr = await MembershipManager.deploy(admin.address, await usdcToken.getAddress(), treasury.address);
    await mgr.waitForDeployment();
    // Bronze: monthly=100, concurrent=10 — generous for tests
    await mgr.connect(admin).setTier(
      FRIEND_MARKET_ROLE, Tier.Bronze,
      usdc(50), 30,
      { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 },
      true
    );

    const WagerRegistry = await ethers.getContractFactory("WagerRegistry");
    const reg = await WagerRegistry.deploy(
      admin.address,
      await mgr.getAddress(),
      await adapter.getAddress(),
      [await usdcToken.getAddress(), await wmatic.getAddress()]
    );
    await reg.waitForDeployment();

    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

    // Give everyone tokens + approvals
    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await wmatic.mint(u.address, ethers.parseEther("100"));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await wmatic.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
    }

    return { reg, mgr, usdcToken, wmatic, ctf, adapter, admin, alice, bob, charlie, treasury };
  }

  async function createDefault(reg, fx, overrides = {}) {
    const { alice, bob, usdcToken } = fx;
    const now = await time.latest();
    const params = {
      opponent: bob.address,
      arbitrator: ethers.ZeroAddress,
      token: await usdcToken.getAddress(),
      creatorStake: usdc(10),
      opponentStake: usdc(10),
      acceptDeadline: now + 3600,
      resolveDeadline: now + 86400,
      resolutionType: Resolution.Either,
      polymarketConditionId: ethers.ZeroHash,
      creatorIsYes: false,
      metadataHash: ethers.id("test"),
      ...overrides,
    };
    const signer = overrides._signer || alice;
    const tx = await reg.connect(signer).createWager(
      params.opponent, params.arbitrator, params.token,
      params.creatorStake, params.opponentStake,
      params.acceptDeadline, params.resolveDeadline,
      params.resolutionType, params.polymarketConditionId,
      params.creatorIsYes, params.metadataHash
    );
    const receipt = await tx.wait();
    // Find WagerCreated event and extract wagerId
    const ev = receipt.logs.map(l => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "WagerCreated");
    return Number(ev.args.wagerId);
  }

  describe("createWager", () => {
    it("creates a wager, pulls creator stake, increments membership counter", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, usdcToken, mgr } = fx;
      const balBefore = await usdcToken.balanceOf(alice.address);
      const wagerId = await createDefault(reg, fx);
      const balAfter = await usdcToken.balanceOf(alice.address);
      expect(balBefore - balAfter).to.equal(usdc(10));
      expect(wagerId).to.equal(1);
      const w = await reg.getWager(wagerId);
      expect(w.status).to.equal(Status.Open);
      expect(w.creator).to.equal(alice.address);
      const m = await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE);
      expect(m.activeCount).to.equal(1);
      expect(m.monthCount).to.equal(1);
    });

    it("rejects SelfWager", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(createDefault(fx.reg, fx, { opponent: fx.alice.address }))
        .to.be.revertedWithCustomError(fx.reg, "SelfWager");
    });

    it("rejects zero opponent", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(createDefault(fx.reg, fx, { opponent: ethers.ZeroAddress }))
        .to.be.revertedWithCustomError(fx.reg, "ZeroAddress");
    });

    it("rejects non-allowlisted token", async () => {
      const fx = await loadFixture(deployFixture);
      const Other = await ethers.getContractFactory("MockERC20");
      const other = await Other.deploy("Other", "OTH", 0);
      await expect(createDefault(fx.reg, fx, { token: await other.getAddress() }))
        .to.be.revertedWithCustomError(fx.reg, "NotAllowedToken");
    });

    it("rejects zero stakes", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(createDefault(fx.reg, fx, { creatorStake: 0 }))
        .to.be.revertedWithCustomError(fx.reg, "ZeroStake");
      await expect(createDefault(fx.reg, fx, { opponentStake: 0 }))
        .to.be.revertedWithCustomError(fx.reg, "ZeroStake");
    });

    it("rejects bad deadlines", async () => {
      const fx = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(createDefault(fx.reg, fx, { acceptDeadline: now - 1 }))
        .to.be.revertedWithCustomError(fx.reg, "BadDeadlines");
      await expect(createDefault(fx.reg, fx, { acceptDeadline: now + 100, resolveDeadline: now + 50 }))
        .to.be.revertedWithCustomError(fx.reg, "BadDeadlines");
    });

    it("ThirdParty requires arbitrator; non-ThirdParty disallows it", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(createDefault(fx.reg, fx, { resolutionType: Resolution.ThirdParty, arbitrator: ethers.ZeroAddress }))
        .to.be.revertedWithCustomError(fx.reg, "ArbitratorRequired");
      await expect(createDefault(fx.reg, fx, { resolutionType: Resolution.Either, arbitrator: fx.charlie.address }))
        .to.be.revertedWithCustomError(fx.reg, "ArbitratorDisallowed");
      await expect(createDefault(fx.reg, fx, { resolutionType: Resolution.ThirdParty, arbitrator: fx.alice.address }))
        .to.be.revertedWithCustomError(fx.reg, "ArbitratorDisallowed");
    });

    it("Polymarket requires conditionId and non-stale; others disallow", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(createDefault(fx.reg, fx, { resolutionType: Resolution.Polymarket, polymarketConditionId: ethers.ZeroHash }))
        .to.be.revertedWithCustomError(fx.reg, "PolymarketRequired");
      await expect(createDefault(fx.reg, fx, { polymarketConditionId: ethers.id("some-id") }))
        .to.be.revertedWithCustomError(fx.reg, "PolymarketDisallowed");
    });

    it("blocks if Polymarket condition is already resolved (stale-condition mitigation)", async () => {
      const fx = await loadFixture(deployFixture);
      const { ctf, alice } = fx;
      const oracle = "0x0000000000000000000000000000000000000001";
      const qid = ethers.id("Q1");
      await ctf.prepareCondition(oracle, qid, 2);
      const cid = ethers.keccak256(ethers.solidityPacked(["address", "bytes32", "uint256"], [oracle, qid, 2]));
      await ctf.resolveCondition(cid, [1, 0]);
      await expect(createDefault(fx.reg, fx, { resolutionType: Resolution.Polymarket, polymarketConditionId: cid }))
        .to.be.revertedWithCustomError(fx.reg, "ConditionAlreadyResolved");
    });

    it("rejects if membership inactive", async () => {
      const fx = await loadFixture(deployFixture);
      const { mgr, reg, alice } = fx;
      // Let alice's membership lapse
      await time.increase(31 * 24 * 3600);
      await expect(createDefault(reg, fx)).to.be.revertedWithCustomError(reg, "MembershipDenied");
    });
  });

  describe("acceptWager", () => {
    it("opponent accepts, pulls stake, moves to Active", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, bob, usdcToken } = fx;
      const id = await createDefault(reg, fx);
      const balBefore = await usdcToken.balanceOf(bob.address);
      await reg.connect(bob).acceptWager(id);
      expect(balBefore - await usdcToken.balanceOf(bob.address)).to.equal(usdc(10));
      expect((await reg.getWager(id)).status).to.equal(Status.Active);
    });

    it("rejects non-opponent", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await expect(fx.reg.connect(fx.charlie).acceptWager(id))
        .to.be.revertedWithCustomError(fx.reg, "NotOpponent");
    });

    it("rejects after accept deadline", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await time.increase(3601);
      await expect(fx.reg.connect(fx.bob).acceptWager(id))
        .to.be.revertedWithCustomError(fx.reg, "AcceptExpired");
    });
  });

  describe("cancelOpen", () => {
    it("refunds creator and closes membership slot", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, usdcToken, mgr } = fx;
      const id = await createDefault(reg, fx);
      const balBefore = await usdcToken.balanceOf(alice.address);
      await reg.connect(alice).cancelOpen(id);
      expect(await usdcToken.balanceOf(alice.address) - balBefore).to.equal(usdc(10));
      const m = await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE);
      expect(m.activeCount).to.equal(0);
    });

    it("rejects non-creator", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await expect(fx.reg.connect(fx.bob).cancelOpen(id))
        .to.be.revertedWithCustomError(fx.reg, "NotCreator");
    });

    it("cannot cancel after acceptance", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await fx.reg.connect(fx.bob).acceptWager(id);
      await expect(fx.reg.connect(fx.alice).cancelOpen(id))
        .to.be.revertedWithCustomError(fx.reg, "NotOpen");
    });
  });

  describe("declareWinner (Either)", () => {
    it("either party can declare", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await reg.connect(alice).declareWinner(id, alice.address);
      const w = await reg.getWager(id);
      expect(w.status).to.equal(Status.Resolved);
      expect(w.winner).to.equal(alice.address);
    });

    it("rejects winner that is neither creator nor opponent", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob, charlie } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await expect(reg.connect(alice).declareWinner(id, charlie.address))
        .to.be.revertedWithCustomError(reg, "WinnerNotParticipant");
    });

    it("rejects third-party caller for Either type", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, bob, charlie } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await expect(reg.connect(charlie).declareWinner(id, fx.alice.address))
        .to.be.revertedWithCustomError(reg, "NotAuthorized");
    });

    it("rejects after resolve deadline", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await time.increase(86401);
      await expect(reg.connect(alice).declareWinner(id, alice.address))
        .to.be.revertedWithCustomError(reg, "ResolveExpired");
    });
  });

  describe("declareWinner (Creator/Opponent/ThirdParty auth)", () => {
    it("Creator type: only creator can declare", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob } = fx;
      const id = await createDefault(reg, fx, { resolutionType: Resolution.Creator });
      await reg.connect(bob).acceptWager(id);
      await expect(reg.connect(bob).declareWinner(id, bob.address))
        .to.be.revertedWithCustomError(reg, "NotAuthorized");
      await reg.connect(alice).declareWinner(id, alice.address);
      expect((await reg.getWager(id)).status).to.equal(Status.Resolved);
    });

    it("Opponent type: only opponent can declare", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob } = fx;
      const id = await createDefault(reg, fx, { resolutionType: Resolution.Opponent });
      await reg.connect(bob).acceptWager(id);
      await expect(reg.connect(alice).declareWinner(id, alice.address))
        .to.be.revertedWithCustomError(reg, "NotAuthorized");
      await reg.connect(bob).declareWinner(id, bob.address);
    });

    it("ThirdParty type: only arbitrator can declare", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob, charlie } = fx;
      const id = await createDefault(reg, fx, { resolutionType: Resolution.ThirdParty, arbitrator: charlie.address });
      await reg.connect(bob).acceptWager(id);
      await expect(reg.connect(alice).declareWinner(id, alice.address))
        .to.be.revertedWithCustomError(reg, "NotAuthorized");
      await reg.connect(charlie).declareWinner(id, bob.address);
      expect((await reg.getWager(id)).winner).to.equal(bob.address);
    });
  });

  describe("Polymarket auto-resolve", () => {
    async function setupPolymarketWager(fx, opts = {}) {
      const { ctf, reg } = fx;
      const oracle = "0x0000000000000000000000000000000000000001";
      const qid = ethers.id("Polymarket Q" + Math.random());
      await ctf.prepareCondition(oracle, qid, 2);
      const cid = ethers.keccak256(ethers.solidityPacked(["address", "bytes32", "uint256"], [oracle, qid, 2]));
      const id = await createDefault(reg, fx, {
        resolutionType: Resolution.Polymarket,
        polymarketConditionId: cid,
        creatorIsYes: opts.creatorIsYes ?? true,
      });
      await reg.connect(fx.bob).acceptWager(id);
      return { id, cid };
    }

    it("creator wins when outcome matches creatorIsYes", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, ctf, alice } = fx;
      const { id, cid } = await setupPolymarketWager(fx, { creatorIsYes: true });
      await ctf.resolveCondition(cid, [1, 0]); // YES wins
      await reg.connect(fx.charlie).autoResolveFromPolymarket(id);
      const w = await reg.getWager(id);
      expect(w.status).to.equal(Status.Resolved);
      expect(w.winner).to.equal(alice.address);
    });

    it("opponent wins when outcome opposes creatorIsYes", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, ctf, bob } = fx;
      const { id, cid } = await setupPolymarketWager(fx, { creatorIsYes: true });
      await ctf.resolveCondition(cid, [0, 1]); // NO wins
      await reg.connect(fx.charlie).autoResolveFromPolymarket(id);
      expect((await reg.getWager(id)).winner).to.equal(bob.address);
    });

    it("inverts mapping when creatorIsYes=false", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, ctf, alice } = fx;
      const { id, cid } = await setupPolymarketWager(fx, { creatorIsYes: false });
      await ctf.resolveCondition(cid, [0, 1]); // NO wins
      await reg.connect(fx.charlie).autoResolveFromPolymarket(id);
      expect((await reg.getWager(id)).winner).to.equal(alice.address);
    });

    it("reverts before Polymarket resolves", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg } = fx;
      const { id } = await setupPolymarketWager(fx);
      await expect(reg.connect(fx.charlie).autoResolveFromPolymarket(id))
        .to.be.revertedWithCustomError(reg, "ConditionNotResolved");
    });

    it("declareWinner is blocked for Polymarket type", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice } = fx;
      const { id } = await setupPolymarketWager(fx);
      await expect(reg.connect(alice).declareWinner(id, alice.address))
        .to.be.revertedWithCustomError(reg, "NotAuthorized");
    });
  });

  describe("claimPayout", () => {
    it("winner gets creatorStake + opponentStake; cannot double-claim", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob, usdcToken } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await reg.connect(alice).declareWinner(id, alice.address);
      const balBefore = await usdcToken.balanceOf(alice.address);
      await reg.connect(alice).claimPayout(id);
      expect(await usdcToken.balanceOf(alice.address) - balBefore).to.equal(usdc(20));
      await expect(reg.connect(alice).claimPayout(id))
        .to.be.revertedWithCustomError(reg, "AlreadyPaid");
    });

    it("non-winner cannot claim", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await reg.connect(alice).declareWinner(id, alice.address);
      await expect(reg.connect(bob).claimPayout(id))
        .to.be.revertedWithCustomError(reg, "NotWinner");
    });
  });

  describe("claimRefund", () => {
    it("Open wager: creator refunded after acceptDeadline", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, usdcToken } = fx;
      const id = await createDefault(reg, fx);
      await time.increase(3601);
      const balBefore = await usdcToken.balanceOf(alice.address);
      await reg.connect(fx.charlie).claimRefund(id); // anyone can call
      expect(await usdcToken.balanceOf(alice.address) - balBefore).to.equal(usdc(10));
      expect((await reg.getWager(id)).status).to.equal(Status.Refunded);
    });

    it("Open + not expired: NotRefundable", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await expect(fx.reg.claimRefund(id))
        .to.be.revertedWithCustomError(fx.reg, "NotRefundable");
    });

    it("Active wager: both refunded after resolveDeadline with no resolution", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob, usdcToken } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await time.increase(86401);
      const aBal = await usdcToken.balanceOf(alice.address);
      const bBal = await usdcToken.balanceOf(bob.address);
      await reg.claimRefund(id);
      expect(await usdcToken.balanceOf(alice.address) - aBal).to.equal(usdc(10));
      expect(await usdcToken.balanceOf(bob.address) - bBal).to.equal(usdc(10));
    });

    it("Resolved wager: NotRefundable", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await reg.connect(alice).declareWinner(id, alice.address);
      await time.increase(86401);
      await expect(reg.claimRefund(id))
        .to.be.revertedWithCustomError(reg, "NotRefundable");
    });
  });

  describe("WMATIC stake", () => {
    it("works end-to-end with WMATIC", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, wmatic, alice, bob } = fx;
      const id = await createDefault(reg, fx, {
        token: await wmatic.getAddress(),
        creatorStake: ethers.parseEther("1"),
        opponentStake: ethers.parseEther("2"),
      });
      await reg.connect(bob).acceptWager(id);
      await reg.connect(alice).declareWinner(id, bob.address);
      const balBefore = await wmatic.balanceOf(bob.address);
      await reg.connect(bob).claimPayout(id);
      expect(await wmatic.balanceOf(bob.address) - balBefore).to.equal(ethers.parseEther("3"));
    });
  });

  describe("admin", () => {
    it("pause blocks createWager", async () => {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).pause();
      await expect(createDefault(fx.reg, fx))
        .to.be.revertedWithCustomError(fx.reg, "EnforcedPause");
    });

    it("setTokenAllowed toggles allowlist", async () => {
      const fx = await loadFixture(deployFixture);
      const usdcAddr = await fx.usdcToken.getAddress();
      await fx.reg.connect(fx.admin).setTokenAllowed(usdcAddr, false);
      await expect(createDefault(fx.reg, fx))
        .to.be.revertedWithCustomError(fx.reg, "NotAllowedToken");
    });

    it("setPolymarketAdapter to zero disables Polymarket type", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, ctf } = fx;
      await reg.connect(admin).setPolymarketAdapter(ethers.ZeroAddress);
      const oracle = "0x0000000000000000000000000000000000000001";
      const qid = ethers.id("Q-disabled");
      await ctf.prepareCondition(oracle, qid, 2);
      const cid = ethers.keccak256(ethers.solidityPacked(["address", "bytes32", "uint256"], [oracle, qid, 2]));
      await expect(createDefault(reg, fx, { resolutionType: Resolution.Polymarket, polymarketConditionId: cid }))
        .to.be.revertedWithCustomError(reg, "AdapterNotSet");
    });
  });
});
