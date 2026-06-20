const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry } = require("./helpers/proxy");

// Coverage for the Draw outcome (Spec Kit 004): a draw returns each party their
// own original stake. Manual draw requires mutual consent for participant
// resolution types (Either/Creator/Opponent) and is arbitrator-solo for
// ThirdParty; oracle types cannot be manually drawn.
const Tier = { None: 0, Bronze: 1 };
const Resolution = {
  Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4,
  ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7,
};
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5, Draw: 6 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("WagerRegistry — Draw resolution", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    const wmatic = await MockERC20.deploy("Wrapped Matic", "WMATIC", 0);

    const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await Ctf.deploy();
    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const adapter = await PolymarketAdapter.deploy(admin.address, await ctf.getAddress());

    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    const mgr = await MembershipManager.deploy(admin.address, await usdcToken.getAddress(), treasury.address);
    await mgr.connect(admin).setTier(
      WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30,
      { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 }, true
    );

    const reg = await deployWagerRegistry([
      admin.address, await mgr.getAddress(), await adapter.getAddress(),
      [await usdcToken.getAddress(), await wmatic.getAddress()]
    ]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    }

    return { reg, mgr, usdcToken, ctf, adapter, admin, alice, bob, charlie, treasury };
  }

  // Create + accept a wager → returns an Active wagerId. Defaults: Either, equal stakes.
  async function createActive(fx, overrides = {}) {
    const { reg, alice, bob, usdcToken } = fx;
    const now = await time.latest();
    const p = {
      opponent: bob.address,
      arbitrator: ethers.ZeroAddress,
      token: await usdcToken.getAddress(),
      creatorStake: usdc(10),
      opponentStake: usdc(10),
      acceptDeadline: now + 1800,
      resolveDeadline: now + 86400,
      resolutionType: Resolution.Either,
      conditionId: ethers.ZeroHash,
      creatorIsYes: false,
      ...overrides,
    };
    const tx = await reg.connect(alice).createWager(
      p.opponent, p.arbitrator, p.token, p.creatorStake, p.opponentStake,
      p.acceptDeadline, p.resolveDeadline, p.resolutionType, p.conditionId,
      p.creatorIsYes, ethers.id("meta"), ""
    );
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "WagerCreated");
    const wagerId = Number(ev.args.wagerId);
    await reg.connect(bob).acceptWager(wagerId);
    return wagerId;
  }

  // Prepare an (unresolved) Polymarket condition and open+accept a Polymarket wager.
  async function createPolymarketActive(fx) {
    const { reg, alice, bob, usdcToken, ctf, admin } = fx;
    const questionId = ethers.id("q-" + Math.random());
    const conditionId = await ctf.getConditionId(admin.address, questionId, 2);
    await ctf.prepareCondition(admin.address, questionId, 2);
    const wagerId = await createActive(fx, {
      resolutionType: Resolution.Polymarket,
      conditionId,
      creatorIsYes: true,
    });
    return { wagerId, conditionId };
  }

  describe("mutual consent (participant resolution types)", function () {
    it("first participant proposes (no settle), second confirms → Draw with each stake returned", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);

      // Alice (creator) proposes — does NOT settle.
      await expect(fx.reg.connect(fx.alice).declareDraw(id))
        .to.emit(fx.reg, "DrawProposed").withArgs(id, fx.alice.address);
      expect((await fx.reg.getWager(id)).status).to.equal(Status.Active);
      let consent = await fx.reg.drawConsent(id);
      expect(consent[0]).to.equal(true);   // creatorAgreed
      expect(consent[1]).to.equal(false);  // opponentAgreed

      // Bob (opponent) confirms — settles the draw.
      const aBefore = await fx.usdcToken.balanceOf(fx.alice.address);
      const bBefore = await fx.usdcToken.balanceOf(fx.bob.address);
      await expect(fx.reg.connect(fx.bob).declareDraw(id))
        .to.emit(fx.reg, "WagerDrawn").withArgs(id, fx.alice.address, fx.bob.address, fx.bob.address);

      const w = await fx.reg.getWager(id);
      expect(w.status).to.equal(Status.Draw);
      expect((await fx.usdcToken.balanceOf(fx.alice.address)) - aBefore).to.equal(usdc(10));
      expect((await fx.usdcToken.balanceOf(fx.bob.address)) - bBefore).to.equal(usdc(10));
    });

    it("a one-sided proposal does NOT lock the wager — a winner can still be declared", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.alice).declareDraw(id); // propose only
      // Normal resolution still works (Either: opponent can declare a winner).
      await fx.reg.connect(fx.bob).declareWinner(id, fx.bob.address);
      const w = await fx.reg.getWager(id);
      expect(w.status).to.equal(Status.Resolved);
      expect(w.winner).to.equal(fx.bob.address);
    });

    it("a single participant alone cannot settle a draw", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.alice).declareDraw(id);
      await fx.reg.connect(fx.alice).declareDraw(id); // repeat by same party — still no settle
      expect((await fx.reg.getWager(id)).status).to.equal(Status.Active);
    });
  });

  describe("arbitrator-solo (ThirdParty)", function () {
    it("the arbitrator settles a draw alone", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx, { resolutionType: Resolution.ThirdParty, arbitrator: fx.charlie.address });
      const aBefore = await fx.usdcToken.balanceOf(fx.alice.address);
      const bBefore = await fx.usdcToken.balanceOf(fx.bob.address);
      await expect(fx.reg.connect(fx.charlie).declareDraw(id))
        .to.emit(fx.reg, "WagerDrawn").withArgs(id, fx.alice.address, fx.bob.address, fx.charlie.address);
      expect((await fx.reg.getWager(id)).status).to.equal(Status.Draw);
      expect((await fx.usdcToken.balanceOf(fx.alice.address)) - aBefore).to.equal(usdc(10));
      expect((await fx.usdcToken.balanceOf(fx.bob.address)) - bBefore).to.equal(usdc(10));
    });

    it("a participant cannot declare a draw on a ThirdParty wager", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx, { resolutionType: Resolution.ThirdParty, arbitrator: fx.charlie.address });
      await expect(fx.reg.connect(fx.alice).declareDraw(id))
        .to.be.revertedWithCustomError(fx.reg, "NotAuthorized");
    });
  });

  describe("authorization & eligibility", function () {
    it("a non-participant cannot declare a draw", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await expect(fx.reg.connect(fx.charlie).declareDraw(id))
        .to.be.revertedWithCustomError(fx.reg, "NotParticipant");
    });

    it("an oracle-resolved (Polymarket) wager cannot be manually drawn", async () => {
      const fx = await loadFixture(deployFixture);
      const { wagerId } = await createPolymarketActive(fx);
      await expect(fx.reg.connect(fx.alice).declareDraw(wagerId))
        .to.be.revertedWithCustomError(fx.reg, "DrawNotApplicable");
    });

    it("a manual draw is rejected after the resolve deadline", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      const w = await fx.reg.getWager(id);
      await time.increaseTo(Number(w.resolveDeadline) + 1);
      await expect(fx.reg.connect(fx.alice).declareDraw(id))
        .to.be.revertedWithCustomError(fx.reg, "ResolveExpired");
    });

    it("a non-Active wager cannot be drawn (Open)", async () => {
      const fx = await loadFixture(deployFixture);
      const now = await time.latest();
      const tx = await fx.reg.connect(fx.alice).createWager(
        fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
        usdc(10), usdc(10), now + 1800, now + 86400, Resolution.Either,
        ethers.ZeroHash, false, ethers.id("meta"), ""
      );
      const rcpt = await tx.wait();
      const ev = rcpt.logs.map((l) => { try { return fx.reg.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "WagerCreated");
      const id = Number(ev.args.wagerId); // Open, not accepted
      await expect(fx.reg.connect(fx.alice).declareDraw(id))
        .to.be.revertedWithCustomError(fx.reg, "NotActive");
    });
  });

  describe("fund correctness & finality", function () {
    it("unequal stakes: each party gets exactly their own stake back (sum == escrowed)", async () => {
      const fx = await loadFixture(deployFixture);
      // Unequal "Offer" stakes can't use Either; Creator/Opponent types still
      // settle a draw by mutual consent, so use Creator here.
      const id = await createActive(fx, { resolutionType: Resolution.Creator, creatorStake: usdc(30), opponentStake: usdc(10) });
      const aBefore = await fx.usdcToken.balanceOf(fx.alice.address);
      const bBefore = await fx.usdcToken.balanceOf(fx.bob.address);
      await fx.reg.connect(fx.alice).declareDraw(id);
      await fx.reg.connect(fx.bob).declareDraw(id);
      expect((await fx.usdcToken.balanceOf(fx.alice.address)) - aBefore).to.equal(usdc(30));
      expect((await fx.usdcToken.balanceOf(fx.bob.address)) - bBefore).to.equal(usdc(10));
    });

    it("after a Draw, declareWinner / declareDraw / claimPayout / claimRefund all revert", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.alice).declareDraw(id);
      await fx.reg.connect(fx.bob).declareDraw(id);
      expect((await fx.reg.getWager(id)).status).to.equal(Status.Draw);

      await expect(fx.reg.connect(fx.alice).declareWinner(id, fx.alice.address))
        .to.be.revertedWithCustomError(fx.reg, "NotActive");
      await expect(fx.reg.connect(fx.alice).declareDraw(id))
        .to.be.revertedWithCustomError(fx.reg, "NotActive");
      await expect(fx.reg.connect(fx.alice).claimPayout(id))
        .to.be.revertedWithCustomError(fx.reg, "NotResolved");
      await expect(fx.reg.connect(fx.alice).claimRefund(id))
        .to.be.revertedWithCustomError(fx.reg, "NotRefundable");
    });
  });

  describe("revoke, frozen, paused", function () {
    it("a proposer can revoke; opponent-only consent afterward does not settle", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.alice).declareDraw(id);
      await expect(fx.reg.connect(fx.alice).revokeDraw(id))
        .to.emit(fx.reg, "DrawRevoked").withArgs(id, fx.alice.address);
      let consent = await fx.reg.drawConsent(id);
      expect(consent[0]).to.equal(false);

      // Now only bob consents — must NOT settle.
      await fx.reg.connect(fx.bob).declareDraw(id);
      expect((await fx.reg.getWager(id)).status).to.equal(Status.Active);
    });

    it("revokeDraw with no prior consent reverts NoDrawProposal", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await expect(fx.reg.connect(fx.alice).revokeDraw(id))
        .to.be.revertedWithCustomError(fx.reg, "NoDrawProposal");
    });

    it("a frozen account cannot declareDraw", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "test");
      await expect(fx.reg.connect(fx.alice).declareDraw(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    });

    it("a draw still settles while the contract is paused (exit path stays open)", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.alice).declareDraw(id);
      await fx.reg.connect(fx.admin).pause();
      await fx.reg.connect(fx.bob).declareDraw(id); // settles despite pause
      expect((await fx.reg.getWager(id)).status).to.equal(Status.Draw);
    });
  });
});
