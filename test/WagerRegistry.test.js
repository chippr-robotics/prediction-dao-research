const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4 };
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const GUARDIAN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE"));
const ACCOUNT_MODERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ACCOUNT_MODERATOR_ROLE"));

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
    const adapter = await PolymarketAdapter.deploy(admin.address, await ctf.getAddress());
    await adapter.waitForDeployment();

    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    const mgr = await MembershipManager.deploy(admin.address, await usdcToken.getAddress(), treasury.address);
    await mgr.waitForDeployment();
    // Bronze: monthly=100, concurrent=10 — generous for tests
    await mgr.connect(admin).setTier(
      WAGER_PARTICIPANT_ROLE, Tier.Bronze,
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
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
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
      metadataUri: "ipfs://bafyTestCid123",
      ...overrides,
    };
    const signer = overrides._signer || alice;
    const tx = await reg.connect(signer).createWager(
      params.opponent, params.arbitrator, params.token,
      params.creatorStake, params.opponentStake,
      params.acceptDeadline, params.resolveDeadline,
      params.resolutionType, params.polymarketConditionId,
      params.creatorIsYes, params.metadataHash,
      params.metadataUri
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
      const m = await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE);
      expect(m.activeCount).to.equal(1);
      expect(m.monthCount).to.equal(1);
    });

    it("stores and returns metadataUri", async () => {
      const fx = await loadFixture(deployFixture);
      const uri = "ipfs://bafybeicCustomCid";
      const wagerId = await createDefault(fx.reg, fx, { metadataUri: uri });
      const w = await fx.reg.getWager(wagerId);
      expect(w.metadataUri).to.equal(uri);
    });

    it("emits metadataUri in WagerCreated event", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob, usdcToken } = fx;
      const now = await time.latest();
      const uri = "ipfs://bafybeicEventTest";
      const hash = ethers.id("event-test");
      await expect(
        reg.connect(alice).createWager(
          bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
          usdc(10), usdc(10),
          now + 3600, now + 86400,
          Resolution.Either, ethers.ZeroHash, false,
          hash, uri
        )
      ).to.emit(reg, "WagerCreated").withArgs(
        1, alice.address, bob.address, await usdcToken.getAddress(),
        usdc(10), usdc(10), Resolution.Either, hash, uri
      );
    });

    it("supports empty metadataUri for plaintext wagers", async () => {
      const fx = await loadFixture(deployFixture);
      const wagerId = await createDefault(fx.reg, fx, { metadataUri: "" });
      const w = await fx.reg.getWager(wagerId);
      expect(w.metadataUri).to.equal("");
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
      const { ctf } = fx;
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
      const { reg } = fx;
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
    it("refunds creator, closes membership slot, and zeroes storage", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, usdcToken, mgr } = fx;
      const id = await createDefault(reg, fx);
      const balBefore = await usdcToken.balanceOf(alice.address);
      await reg.connect(alice).cancelOpen(id);
      expect(await usdcToken.balanceOf(alice.address) - balBefore).to.equal(usdc(10));
      const m = await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE);
      expect(m.activeCount).to.equal(0);
      // Wager struct should be zeroed
      const w = await reg.getWager(id);
      expect(w.status).to.equal(Status.None);
      expect(w.creator).to.equal(ethers.ZeroAddress);
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

  describe("declineWager", () => {
    it("opponent can decline and creator gets refund", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob, usdcToken, mgr } = fx;
      const id = await createDefault(reg, fx);
      const balBefore = await usdcToken.balanceOf(alice.address);
      await reg.connect(bob).declineWager(id);
      expect(await usdcToken.balanceOf(alice.address) - balBefore).to.equal(usdc(10));
      const m = await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE);
      expect(m.activeCount).to.equal(0);
    });

    it("zeroes wager storage after decline", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, bob } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).declineWager(id);
      const w = await reg.getWager(id);
      expect(w.status).to.equal(Status.None);
      expect(w.creator).to.equal(ethers.ZeroAddress);
    });

    it("emits WagerDeclined event", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, bob } = fx;
      const id = await createDefault(reg, fx);
      await expect(reg.connect(bob).declineWager(id))
        .to.emit(reg, "WagerDeclined")
        .withArgs(id, bob.address);
    });

    it("rejects non-opponent", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await expect(fx.reg.connect(fx.alice).declineWager(id))
        .to.be.revertedWithCustomError(fx.reg, "NotOpponent");
    });

    it("rejects if not Open (already accepted)", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await fx.reg.connect(fx.bob).acceptWager(id);
      await expect(fx.reg.connect(fx.bob).declineWager(id))
        .to.be.revertedWithCustomError(fx.reg, "NotOpen");
    });

    it("frozen opponent cannot decline", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await fx.reg.connect(fx.admin).freezeAccount(fx.bob.address, "test");
      await expect(fx.reg.connect(fx.bob).declineWager(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
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
      await expect(fx.reg.connect(fx.alice).claimRefund(id))
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
      await reg.connect(fx.charlie).claimRefund(id);
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
      await expect(reg.connect(fx.charlie).claimRefund(id))
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

  describe("admin (AccessControl)", () => {
    it("pause blocks createWager and acceptWager", async () => {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).pause();
      await expect(createDefault(fx.reg, fx))
        .to.be.revertedWithCustomError(fx.reg, "EnforcedPause");
    });

    it("non-guardian cannot pause", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(fx.reg.connect(fx.alice).pause())
        .to.be.revertedWithCustomError(fx.reg, "AccessControlUnauthorizedAccount");
    });

    it("DEFAULT_ADMIN can grant GUARDIAN_ROLE to another account", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice } = fx;
      await reg.connect(admin).grantRole(GUARDIAN_ROLE, alice.address);
      await reg.connect(alice).pause();
      expect(await reg.paused()).to.be.true;
    });

    it("setTokenAllowed toggles allowlist", async () => {
      const fx = await loadFixture(deployFixture);
      const usdcAddr = await fx.usdcToken.getAddress();
      await fx.reg.connect(fx.admin).setTokenAllowed(usdcAddr, false);
      await expect(createDefault(fx.reg, fx))
        .to.be.revertedWithCustomError(fx.reg, "NotAllowedToken");
    });

    it("non-admin cannot setTokenAllowed", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(fx.reg.connect(fx.alice).setTokenAllowed(await fx.usdcToken.getAddress(), false))
        .to.be.revertedWithCustomError(fx.reg, "AccessControlUnauthorizedAccount");
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

  describe("account moderation (freeze / unfreeze)", () => {
    it("non-moderator cannot freeze", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(fx.reg.connect(fx.alice).freezeAccount(fx.bob.address, "test"))
        .to.be.revertedWithCustomError(fx.reg, "AccessControlUnauthorizedAccount");
    });

    it("freezeAccount emits event and isFrozen returns true", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice } = fx;
      await expect(reg.connect(admin).freezeAccount(alice.address, "abuse"))
        .to.emit(reg, "AccountFrozen")
        .withArgs(alice.address, admin.address, "abuse");
      expect(await reg.isFrozen(alice.address)).to.be.true;
    });

    it("frozen creator cannot createWager", async () => {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "test");
      await expect(createDefault(fx.reg, fx))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError")
        .withArgs(fx.alice.address);
    });

    it("frozen opponent cannot acceptWager", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await fx.reg.connect(fx.admin).freezeAccount(fx.bob.address, "test");
      await expect(fx.reg.connect(fx.bob).acceptWager(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError")
        .withArgs(fx.bob.address);
    });

    it("frozen creator cannot cancelOpen", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createDefault(fx.reg, fx);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "test");
      await expect(fx.reg.connect(fx.alice).cancelOpen(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    });

    it("frozen party cannot declareWinner", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice, bob } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await reg.connect(admin).freezeAccount(alice.address, "test");
      await expect(reg.connect(alice).declareWinner(id, alice.address))
        .to.be.revertedWithCustomError(reg, "AccountFrozenError");
    });

    it("frozen winner cannot claimPayout", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice, bob } = fx;
      const id = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id);
      await reg.connect(alice).declareWinner(id, alice.address);
      await reg.connect(admin).freezeAccount(alice.address, "test");
      await expect(reg.connect(alice).claimPayout(id))
        .to.be.revertedWithCustomError(reg, "AccountFrozenError");
    });

    it("frozen caller cannot claimRefund (even if not a participant)", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, charlie } = fx;
      const id = await createDefault(reg, fx);
      await time.increase(3601);
      await reg.connect(admin).freezeAccount(charlie.address, "test");
      await expect(reg.connect(charlie).claimRefund(id))
        .to.be.revertedWithCustomError(reg, "AccountFrozenError");
    });

    it("autoResolveFromPolymarket still works against a frozen creator (settlement is permissionless)", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, ctf, alice, bob, charlie } = fx;
      const oracle = "0x0000000000000000000000000000000000000001";
      const qid = ethers.id("Polymarket Q-frozen");
      await ctf.prepareCondition(oracle, qid, 2);
      const cid = ethers.keccak256(ethers.solidityPacked(["address", "bytes32", "uint256"], [oracle, qid, 2]));
      const id = await createDefault(reg, fx, {
        resolutionType: Resolution.Polymarket,
        polymarketConditionId: cid,
        creatorIsYes: true,
      });
      await reg.connect(bob).acceptWager(id);
      // Freeze creator AFTER acceptance
      await reg.connect(admin).freezeAccount(alice.address, "post-acceptance");
      // Polymarket resolves YES → alice (creator) is winner
      await ctf.resolveCondition(cid, [1, 0]);
      // Any non-frozen account triggers settlement
      await reg.connect(charlie).autoResolveFromPolymarket(id);
      const w = await reg.getWager(id);
      expect(w.status).to.equal(Status.Resolved);
      expect(w.winner).to.equal(alice.address);
      // …but alice still can't claim while frozen
      await expect(reg.connect(alice).claimPayout(id))
        .to.be.revertedWithCustomError(reg, "AccountFrozenError");
    });

    it("unfreezeAccount restores access", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice } = fx;
      await reg.connect(admin).freezeAccount(alice.address, "test");
      await expect(createDefault(reg, fx))
        .to.be.revertedWithCustomError(reg, "AccountFrozenError");
      await expect(reg.connect(admin).unfreezeAccount(alice.address))
        .to.emit(reg, "AccountUnfrozen")
        .withArgs(alice.address, admin.address);
      expect(await reg.isFrozen(alice.address)).to.be.false;
      const id = await createDefault(reg, fx);
      expect(id).to.be.gt(0);
    });

    it("DEFAULT_ADMIN can grant ACCOUNT_MODERATOR_ROLE to a delegate", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice, bob } = fx;
      await reg.connect(admin).grantRole(ACCOUNT_MODERATOR_ROLE, alice.address);
      await reg.connect(alice).freezeAccount(bob.address, "delegated freeze");
      expect(await reg.isFrozen(bob.address)).to.be.true;
    });
  });

  describe("per-user wager index", () => {
    it("appends new wager IDs for both creator and opponent", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob } = fx;
      const id = await createDefault(reg, fx);
      expect(await reg.getUserWagerCount(alice.address)).to.equal(1);
      expect(await reg.getUserWagerCount(bob.address)).to.equal(1);
      const aliceIds = await reg.getUserWagerIds(alice.address, 0, 10);
      const bobIds = await reg.getUserWagerIds(bob.address, 0, 10);
      expect(aliceIds.map(Number)).to.deep.equal([id]);
      expect(bobIds.map(Number)).to.deep.equal([id]);
    });

    it("accumulates IDs across multiple wagers per user", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob, charlie } = fx;
      const id1 = await createDefault(reg, fx); // alice vs bob
      const id2 = await createDefault(reg, fx, { opponent: charlie.address }); // alice vs charlie
      const id3 = await createDefault(reg, fx, { _signer: bob, opponent: charlie.address }); // bob vs charlie

      expect(await reg.getUserWagerCount(alice.address)).to.equal(2);
      expect(await reg.getUserWagerCount(bob.address)).to.equal(2);
      expect(await reg.getUserWagerCount(charlie.address)).to.equal(2);

      const aliceIds = (await reg.getUserWagerIds(alice.address, 0, 10)).map(Number);
      const bobIds = (await reg.getUserWagerIds(bob.address, 0, 10)).map(Number);
      const charlieIds = (await reg.getUserWagerIds(charlie.address, 0, 10)).map(Number);
      expect(aliceIds).to.deep.equal([id1, id2]);
      expect(bobIds).to.deep.equal([id1, id3]);
      expect(charlieIds).to.deep.equal([id2, id3]);
    });

    it("paginates with clamped offset and limit", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice } = fx;
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push(await createDefault(reg, fx));

      // full page
      const full = (await reg.getUserWagerIds(alice.address, 0, 5)).map(Number);
      expect(full).to.deep.equal(ids);

      // limit larger than remaining clamps to end
      const overshoot = (await reg.getUserWagerIds(alice.address, 3, 100)).map(Number);
      expect(overshoot).to.deep.equal(ids.slice(3));

      // offset past end returns empty
      const past = await reg.getUserWagerIds(alice.address, 5, 10);
      expect(past.length).to.equal(0);

      // zero limit returns empty
      const zero = await reg.getUserWagerIds(alice.address, 0, 0);
      expect(zero.length).to.equal(0);

      // mid-range slice
      const mid = (await reg.getUserWagerIds(alice.address, 1, 2)).map(Number);
      expect(mid).to.deep.equal(ids.slice(1, 3));
    });

    it("getUserWagers returns full structs in the same order as getUserWagerIds", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob } = fx;
      const id1 = await createDefault(reg, fx);
      const id2 = await createDefault(reg, fx);
      const ids = (await reg.getUserWagerIds(alice.address, 0, 10)).map(Number);
      const wagers = await reg.getUserWagers(alice.address, 0, 10);
      expect(ids).to.deep.equal([id1, id2]);
      expect(wagers.length).to.equal(2);
      expect(wagers[0].creator).to.equal(alice.address);
      expect(wagers[0].opponent).to.equal(bob.address);
      expect(wagers[0].status).to.equal(Status.Open);
      expect(wagers[1].creator).to.equal(alice.address);
    });

    it("index is append-only across the full lifecycle (accept / cancel / declare / refund)", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob } = fx;

      // 1) accepted
      const accepted = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(accepted);
      await reg.connect(alice).declareWinner(accepted, alice.address);

      // 2) cancelled
      const cancelled = await createDefault(reg, fx);
      await reg.connect(alice).cancelOpen(cancelled);

      // 3) refunded (Open → past acceptDeadline)
      const refunded = await createDefault(reg, fx);
      await time.increase(3700);
      await reg.connect(alice).claimRefund(refunded);

      // All three IDs still present, in creation order
      const aliceIds = (await reg.getUserWagerIds(alice.address, 0, 10)).map(Number);
      const bobIds = (await reg.getUserWagerIds(bob.address, 0, 10)).map(Number);
      expect(aliceIds).to.deep.equal([accepted, cancelled, refunded]);
      expect(bobIds).to.deep.equal([accepted, cancelled, refunded]);
      expect(await reg.getUserWagerCount(alice.address)).to.equal(3);
      expect(await reg.getUserWagerCount(bob.address)).to.equal(3);
    });

    it("returns zero count and empty page for a user not party to any wager", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg } = fx;
      const stranger = ethers.Wallet.createRandom().address;
      expect(await reg.getUserWagerCount(stranger)).to.equal(0);
      const ids = await reg.getUserWagerIds(stranger, 0, 50);
      expect(ids.length).to.equal(0);
      const wagers = await reg.getUserWagers(stranger, 0, 50);
      expect(wagers.length).to.equal(0);
    });
  });

  describe("batchExpireOpen", () => {
    it("refunds expired Open wagers and decrements activeCount", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, mgr, usdcToken, alice, bob, charlie } = fx;

      const id1 = await createDefault(reg, fx);
      const id2 = await createDefault(reg, fx);

      const m1 = await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE);
      expect(m1.activeCount).to.equal(2);

      const balBefore = await usdcToken.balanceOf(alice.address);
      await time.increase(3601);
      await reg.connect(charlie).batchExpireOpen([id1, id2]);
      const balAfter = await usdcToken.balanceOf(alice.address);

      expect(balAfter - balBefore).to.equal(usdc(20));

      const m2 = await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE);
      expect(m2.activeCount).to.equal(0);

      expect((await reg.getWager(id1)).status).to.equal(Status.Refunded);
      expect((await reg.getWager(id2)).status).to.equal(Status.Refunded);
    });

    it("skips non-expired and non-Open wagers silently", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, mgr, alice, bob } = fx;

      const id1 = await createDefault(reg, fx);
      const id2 = await createDefault(reg, fx);
      await reg.connect(bob).acceptWager(id2);

      await time.increase(3601);
      await reg.connect(alice).batchExpireOpen([id1, id2, 9999]);

      expect((await reg.getWager(id1)).status).to.equal(Status.Refunded);
      expect((await reg.getWager(id2)).status).to.equal(Status.Active);

      const m = await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE);
      expect(m.activeCount).to.equal(1);
    });

    it("frees concurrent slots so new wagers can be created", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, mgr, admin, alice, bob, usdcToken } = fx;

      await mgr.connect(admin).setTier(
        WAGER_PARTICIPANT_ROLE, Tier.Bronze,
        usdc(50), 30,
        { monthlyMarketCreation: 100, maxConcurrentMarkets: 3 },
        true
      );

      await createDefault(reg, fx);
      await createDefault(reg, fx);
      await createDefault(reg, fx);

      const now = await time.latest();
      await expect(
        reg.connect(alice).createWager(
          bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
          usdc(10), usdc(10), now + 7200, now + 86400,
          Resolution.Either, ethers.ZeroHash, false, ethers.id("test"), ""
        )
      ).to.be.revertedWithCustomError(reg, "MembershipDenied");

      await time.increase(3601);

      const ids = await reg.getUserWagerIds(alice.address, 0, 10);
      await reg.batchExpireOpen(Array.from(ids));

      const m = await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE);
      expect(m.activeCount).to.equal(0);

      const now2 = await time.latest();
      await reg.connect(alice).createWager(
        bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
        usdc(10), usdc(10), now2 + 7200, now2 + 86400,
        Resolution.Either, ethers.ZeroHash, false, ethers.id("test"), ""
      );
      expect((await mgr.getMembership(alice.address, WAGER_PARTICIPANT_ROLE)).activeCount).to.equal(1);
    });
  });
});
