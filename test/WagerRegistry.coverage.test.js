const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry, deployMembershipManager } = require("./helpers/proxy");

// Spec 046 — targeted branch/statement coverage for WagerRegistry.sol. Exercises the
// admin setters, the initialize/reinitializer guards, the createOpenWager guard rails,
// the terms-bound create path, the whenNotPaused/notFrozen modifier sides that the
// existing suites do not reach, and the small view getters.

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = {
  Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4,
  ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7,
};
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5, Draw: 6 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("WagerRegistry — spec 046 coverage", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, dave, treasury] = await ethers.getSigners();

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

    // An extensible (non-Polymarket) oracle adapter to exercise the ChainlinkDataFeed
    // resolution type. isConditionResolved() is false for any unseen conditionId, so
    // linkage passes at creation without registering a feed.
    const ClFeed = await ethers.getContractFactory("ChainlinkDataFeedOracleAdapter");
    const clAdapter = await ClFeed.deploy(admin.address);
    await clAdapter.waitForDeployment();

    const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
    await mgr.waitForDeployment();
    const limits = { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 };
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, limits, true);
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Silver, usdc(100), 30, limits, true);

    const reg = await deployWagerRegistry([
      admin.address,
      await mgr.getAddress(),
      await adapter.getAddress(),
      [await usdcToken.getAddress(), await wmatic.getAddress()],
    ]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);
    // Wire the extensible oracle adapter for the ChainlinkDataFeed type.
    await reg.connect(admin).setOracleAdapter(Resolution.ChainlinkDataFeed, await clAdapter.getAddress());

    for (const u of [alice, bob, charlie, dave]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await wmatic.mint(u.address, ethers.parseEther("100"));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await wmatic.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
    }
    // alice is Silver (needed to create open challenges); the rest Bronze.
    await mgr.connect(alice).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Silver);
    await mgr.connect(bob).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    await mgr.connect(charlie).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    await mgr.connect(dave).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);

    return { reg, mgr, usdcToken, wmatic, ctf, adapter, clAdapter, admin, alice, bob, charlie, dave, treasury };
  }

  // Create a named-opponent wager (Open). Defaults: alice vs bob, Either, equal stakes.
  async function createNamed(fx, overrides = {}) {
    const { reg, alice, bob, usdcToken } = fx;
    const now = await time.latest();
    const p = {
      signer: alice,
      opponent: bob.address,
      arbitrator: ethers.ZeroAddress,
      token: await usdcToken.getAddress(),
      creatorStake: usdc(10),
      opponentStake: usdc(10),
      acceptDeadline: now + 3600,
      resolveDeadline: now + 86400,
      resolutionType: Resolution.Either,
      conditionId: ethers.ZeroHash,
      creatorIsYes: false,
      metadataHash: ethers.id("meta"),
      metadataUri: "",
      ...overrides,
    };
    const tx = await reg.connect(p.signer).createWager(
      p.opponent, p.arbitrator, p.token, p.creatorStake, p.opponentStake,
      p.acceptDeadline, p.resolveDeadline, p.resolutionType, p.conditionId,
      p.creatorIsYes, p.metadataHash, p.metadataUri
    );
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "WagerCreated");
    return Number(ev.args.wagerId);
  }

  async function createActive(fx, overrides = {}) {
    const id = await createNamed(fx, overrides);
    await fx.reg.connect(fx.bob).acceptWager(id);
    return id;
  }

  function newClaimKey() {
    return ethers.Wallet.createRandom();
  }

  async function createOpen(fx, overrides = {}) {
    const { reg, alice, usdcToken } = fx;
    const now = await time.latest();
    const p = {
      signer: alice,
      claimAuthority: newClaimKey().address,
      arbitrator: ethers.ZeroAddress,
      token: await usdcToken.getAddress(),
      stake: usdc(10),
      acceptDeadline: now + 3600,
      resolveDeadline: now + 86400,
      resolutionType: Resolution.Either,
      oracleConditionId: ethers.ZeroHash,
      creatorIsYes: false,
      metadataHash: ethers.id("open"),
      metadataUri: "ipfs://bafyOpen",
      ...overrides,
    };
    const tx = await reg.connect(p.signer).createOpenWager(
      p.claimAuthority, p.arbitrator, p.token, p.stake, p.acceptDeadline, p.resolveDeadline,
      p.resolutionType, p.oracleConditionId, p.creatorIsYes, p.metadataHash, p.metadataUri
    );
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "OpenWagerCreated");
    return Number(ev.args.wagerId);
  }

  async function signOpenAccept(claimKey, regAddr, wagerId, taker) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = { name: "FairWins WagerRegistry", version: "1", chainId, verifyingContract: regAddr };
    const types = { OpenAccept: [{ name: "wagerId", type: "uint256" }, { name: "taker", type: "address" }] };
    return claimKey.signTypedData(domain, types, { wagerId, taker });
  }

  // ---------------------------------------------------------------- initialize guards
  describe("initialize / reinitializer guards", () => {
    it("reverts ZeroAddress when membershipManager is zero", async () => {
      const fx = await loadFixture(deployFixture);
      const Impl = await ethers.getContractFactory("WagerRegistry");
      const impl = await Impl.deploy();
      await impl.waitForDeployment();
      const initData = Impl.interface.encodeFunctionData("initialize", [
        fx.admin.address, ethers.ZeroAddress, ethers.ZeroAddress, [await fx.usdcToken.getAddress()],
      ]);
      const Proxy = await ethers.getContractFactory("ERC1967Proxy");
      await expect(Proxy.deploy(await impl.getAddress(), initData))
        .to.be.revertedWithCustomError(impl, "ZeroAddress");
    });

    it("reverts ZeroAddress when an initial token is zero", async () => {
      const fx = await loadFixture(deployFixture);
      const Impl = await ethers.getContractFactory("WagerRegistry");
      const impl = await Impl.deploy();
      await impl.waitForDeployment();
      const initData = Impl.interface.encodeFunctionData("initialize", [
        fx.admin.address, await fx.mgr.getAddress(), ethers.ZeroAddress, [ethers.ZeroAddress],
      ]);
      const Proxy = await ethers.getContractFactory("ERC1967Proxy");
      await expect(Proxy.deploy(await impl.getAddress(), initData))
        .to.be.revertedWithCustomError(impl, "ZeroAddress");
    });

    it("initializeOpenChallenges runs once, then reverts on re-entry (reinitializer(2))", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(fx.reg.connect(fx.admin).initializeOpenChallenges()).to.not.be.reverted;
      await expect(fx.reg.connect(fx.admin).initializeOpenChallenges())
        .to.be.revertedWithCustomError(fx.reg, "InvalidInitialization");
    });
  });

  // ---------------------------------------------------------------- admin setters
  describe("admin setters", () => {
    it("setMembershipManager updates + emits; rejects zero; rejects non-admin", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice } = fx;
      const fresh = await deployMembershipManager([
        admin.address, await fx.usdcToken.getAddress(), fx.treasury.address,
      ]);
      const freshAddr = await fresh.getAddress();
      await expect(reg.connect(admin).setMembershipManager(freshAddr))
        .to.emit(reg, "MembershipManagerUpdated").withArgs(freshAddr);
      expect(await reg.membershipManager()).to.equal(freshAddr);

      await expect(reg.connect(admin).setMembershipManager(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(reg, "ZeroAddress");
      await expect(reg.connect(alice).setMembershipManager(freshAddr))
        .to.be.revertedWithCustomError(reg, "AccessControlUnauthorizedAccount");
    });

    it("setPolymarketAdapter updates + emits; rejects non-admin", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice } = fx;
      await expect(reg.connect(admin).setPolymarketAdapter(ethers.ZeroAddress))
        .to.emit(reg, "PolymarketAdapterUpdated").withArgs(ethers.ZeroAddress);
      await expect(reg.connect(alice).setPolymarketAdapter(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(reg, "AccessControlUnauthorizedAccount");
    });

    it("setSanctionsGuard updates + emits; rejects non-admin", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice } = fx;
      await expect(reg.connect(admin).setSanctionsGuard(alice.address))
        .to.emit(reg, "SanctionsGuardUpdated").withArgs(alice.address);
      // back to disabled
      await expect(reg.connect(admin).setSanctionsGuard(ethers.ZeroAddress))
        .to.emit(reg, "SanctionsGuardUpdated").withArgs(ethers.ZeroAddress);
      await expect(reg.connect(alice).setSanctionsGuard(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(reg, "AccessControlUnauthorizedAccount");
    });

    it("setTokenAllowed rejects the zero token; rejects non-admin", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice, usdcToken } = fx;
      await expect(reg.connect(admin).setTokenAllowed(ethers.ZeroAddress, true))
        .to.be.revertedWithCustomError(reg, "ZeroAddress");
      await expect(reg.connect(alice).setTokenAllowed(await usdcToken.getAddress(), false))
        .to.be.revertedWithCustomError(reg, "AccessControlUnauthorizedAccount");
    });

    it("setOracleAdapter rejects a non-extensible resolution type", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin } = fx;
      await expect(reg.connect(admin).setOracleAdapter(Resolution.Either, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(reg, "UnsupportedOracleResolutionType");
      await expect(reg.connect(admin).setOracleAdapter(Resolution.Polymarket, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(reg, "UnsupportedOracleResolutionType");
    });

    it("pause / unpause cycle; non-guardian cannot unpause", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice } = fx;
      await reg.connect(admin).pause();
      expect(await reg.paused()).to.equal(true);
      await expect(reg.connect(alice).unpause())
        .to.be.revertedWithCustomError(reg, "AccessControlUnauthorizedAccount");
      await reg.connect(admin).unpause();
      expect(await reg.paused()).to.equal(false);
    });
  });

  // ---------------------------------------------------------------- account moderation zero guards
  describe("freeze / unfreeze zero-address guards", () => {
    it("freezeAccount(0) reverts ZeroAddress", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(fx.reg.connect(fx.admin).freezeAccount(ethers.ZeroAddress, "x"))
        .to.be.revertedWithCustomError(fx.reg, "ZeroAddress");
    });

    it("unfreezeAccount(0) reverts ZeroAddress; unfreeze of a real account emits", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, bob } = fx;
      await expect(reg.connect(admin).unfreezeAccount(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(reg, "ZeroAddress");
      await reg.connect(admin).freezeAccount(bob.address, "x");
      await expect(reg.connect(admin).unfreezeAccount(bob.address))
        .to.emit(reg, "AccountUnfrozen").withArgs(bob.address, admin.address);
    });
  });

  // ---------------------------------------------------------------- createWagerWithTerms
  describe("createWagerWithTerms", () => {
    it("binds the governing terms hash, emits WagerTermsBound + WagerCreated", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, bob, usdcToken } = fx;
      const now = await time.latest();
      const terms = ethers.id("terms-v1");
      const tx = await reg.connect(alice).createWagerWithTerms(
        bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
        usdc(10), usdc(10), now + 3600, now + 86400, Resolution.Either,
        ethers.ZeroHash, false, ethers.id("meta"), "", terms
      );
      const rc = await tx.wait();
      const ev = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "WagerCreated");
      const id = Number(ev.args.wagerId);
      await expect(tx).to.emit(reg, "WagerTermsBound").withArgs(id, terms);
      expect(await reg.wagerTermsVersionHash(id)).to.equal(terms);
    });

    it("is blocked while paused", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice, bob, usdcToken } = fx;
      const now = await time.latest();
      await reg.connect(admin).pause();
      await expect(reg.connect(alice).createWagerWithTerms(
        bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
        usdc(10), usdc(10), now + 3600, now + 86400, Resolution.Either,
        ethers.ZeroHash, false, ethers.id("meta"), "", ethers.id("terms-v1")
      )).to.be.revertedWithCustomError(reg, "EnforcedPause");
    });

    it("is blocked for a frozen creator", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice, bob, usdcToken } = fx;
      const now = await time.latest();
      await reg.connect(admin).freezeAccount(alice.address, "x");
      await expect(reg.connect(alice).createWagerWithTerms(
        bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
        usdc(10), usdc(10), now + 3600, now + 86400, Resolution.Either,
        ethers.ZeroHash, false, ethers.id("meta"), "", ethers.id("terms-v1")
      )).to.be.revertedWithCustomError(reg, "AccountFrozenError").withArgs(alice.address);
    });
  });

  // ---------------------------------------------------------------- createOpenWager guard rails
  describe("createOpenWager guard rails", () => {
    it("rejects a non-allowlisted token", async () => {
      const fx = await loadFixture(deployFixture);
      const Other = await ethers.getContractFactory("MockERC20");
      const other = await Other.deploy("Other", "OTH", 0);
      await expect(createOpen(fx, { token: await other.getAddress() }))
        .to.be.revertedWithCustomError(fx.reg, "NotAllowedToken");
    });

    it("rejects a zero stake", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(createOpen(fx, { stake: 0 }))
        .to.be.revertedWithCustomError(fx.reg, "ZeroStake");
    });

    it("ThirdParty: requires an arbitrator and forbids the creator as arbitrator", async () => {
      const fx = await loadFixture(deployFixture);
      const { alice, charlie } = fx;
      await expect(createOpen(fx, { resolutionType: Resolution.ThirdParty, arbitrator: ethers.ZeroAddress }))
        .to.be.revertedWithCustomError(fx.reg, "ArbitratorRequired");
      await expect(createOpen(fx, { resolutionType: Resolution.ThirdParty, arbitrator: alice.address }))
        .to.be.revertedWithCustomError(fx.reg, "ArbitratorDisallowed");
      // sanity: a valid ThirdParty arbitrator is accepted
      const id = await createOpen(fx, { resolutionType: Resolution.ThirdParty, arbitrator: charlie.address });
      expect((await fx.reg.getWager(id)).arbitrator).to.equal(charlie.address);
    });

    it("non-ThirdParty forbids a non-zero arbitrator", async () => {
      const fx = await loadFixture(deployFixture);
      await expect(createOpen(fx, { resolutionType: Resolution.Either, arbitrator: fx.bob.address }))
        .to.be.revertedWithCustomError(fx.reg, "ArbitratorDisallowed");
    });

    it("rejects a creator whose membership has lapsed (MembershipDenied)", async () => {
      const fx = await loadFixture(deployFixture);
      await time.increase(31 * 24 * 3600); // let alice's Silver lapse
      await expect(createOpen(fx))
        .to.be.revertedWithCustomError(fx.reg, "MembershipDenied");
    });

    it("emits PolymarketLinked for a Polymarket open challenge", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice, ctf } = fx;
      const oracle = "0x0000000000000000000000000000000000000001";
      const qid = ethers.id("open-poly-" + Math.random());
      await ctf.prepareCondition(oracle, qid, 2);
      const cid = ethers.keccak256(ethers.solidityPacked(["address", "bytes32", "uint256"], [oracle, qid, 2]));
      const key = newClaimKey();
      const now = await time.latest();
      await expect(reg.connect(alice).createOpenWager(
        key.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(), usdc(10),
        now + 3600, now + 86400, Resolution.Polymarket, cid, true, ethers.id("m"), "ipfs://x"
      )).to.emit(reg, "PolymarketLinked").withArgs(1, cid, true);
    });

    it("emits OracleConditionLinked for an extensible (ChainlinkDataFeed) open challenge", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, alice } = fx;
      const cid = ethers.id("cl-feed-condition");
      const key = newClaimKey();
      const now = await time.latest();
      await expect(reg.connect(alice).createOpenWager(
        key.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(), usdc(10),
        now + 3600, now + 86400, Resolution.ChainlinkDataFeed, cid, false, ethers.id("m"), "ipfs://y"
      )).to.emit(reg, "OracleConditionLinked").withArgs(1, Resolution.ChainlinkDataFeed, cid, false);
    });

    it("is blocked while paused and for a frozen creator", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice } = fx;
      await reg.connect(admin).pause();
      await expect(createOpen(fx)).to.be.revertedWithCustomError(reg, "EnforcedPause");
      await reg.connect(admin).unpause();
      await reg.connect(admin).freezeAccount(alice.address, "x");
      await expect(createOpen(fx))
        .to.be.revertedWithCustomError(reg, "AccountFrozenError").withArgs(alice.address);
    });
  });

  // ---------------------------------------------------------------- whenNotPaused sides on accept paths
  describe("accept paths honor pause", () => {
    it("acceptWager is blocked while paused", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createNamed(fx);
      await fx.reg.connect(fx.admin).pause();
      await expect(fx.reg.connect(fx.bob).acceptWager(id))
        .to.be.revertedWithCustomError(fx.reg, "EnforcedPause");
    });

    it("acceptOpenWager is blocked while paused and for a frozen taker", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, alice, bob } = fx;
      const key = newClaimKey();
      const now = await time.latest();
      const tx = await reg.connect(alice).createOpenWager(
        key.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(), usdc(10),
        now + 3600, now + 86400, Resolution.Either, ethers.ZeroHash, false, ethers.id("m"), ""
      );
      const rc = await tx.wait();
      const ev = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
        .find((e) => e && e.name === "OpenWagerCreated");
      const id = Number(ev.args.wagerId);
      const sig = await signOpenAccept(key, await reg.getAddress(), id, bob.address);

      await reg.connect(admin).pause();
      await expect(reg.connect(bob).acceptOpenWager(id, sig))
        .to.be.revertedWithCustomError(reg, "EnforcedPause");
      await reg.connect(admin).unpause();

      await reg.connect(admin).freezeAccount(bob.address, "x");
      await expect(reg.connect(bob).acceptOpenWager(id, sig))
        .to.be.revertedWithCustomError(reg, "AccountFrozenError").withArgs(bob.address);
    });
  });

  // ---------------------------------------------------------------- notFrozen sides on settlement paths
  describe("settlement paths honor freeze", () => {
    it("frozen creator cannot cancelOpen", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createNamed(fx);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "x");
      await expect(fx.reg.connect(fx.alice).cancelOpen(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    });

    it("frozen opponent cannot declineWager", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createNamed(fx);
      await fx.reg.connect(fx.admin).freezeAccount(fx.bob.address, "x");
      await expect(fx.reg.connect(fx.bob).declineWager(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    });

    it("frozen party cannot declareWinner", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "x");
      await expect(fx.reg.connect(fx.alice).declareWinner(id, fx.alice.address))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    });

    it("frozen party cannot declareDraw", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "x");
      await expect(fx.reg.connect(fx.alice).declareDraw(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    });

    it("revokeDraw: proposer can revoke, and a frozen proposer cannot", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.alice).declareDraw(id); // propose
      await expect(fx.reg.connect(fx.alice).revokeDraw(id))
        .to.emit(fx.reg, "DrawRevoked").withArgs(id, fx.alice.address);
      await fx.reg.connect(fx.alice).declareDraw(id); // propose again
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "x");
      await expect(fx.reg.connect(fx.alice).revokeDraw(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    });

    it("frozen winner cannot claimPayout", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createActive(fx);
      await fx.reg.connect(fx.alice).declareWinner(id, fx.alice.address);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "x");
      await expect(fx.reg.connect(fx.alice).claimPayout(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    });

    it("frozen caller cannot claimRefund", async () => {
      const fx = await loadFixture(deployFixture);
      const id = await createNamed(fx);
      await time.increase(3601);
      await fx.reg.connect(fx.admin).freezeAccount(fx.charlie.address, "x");
      await expect(fx.reg.connect(fx.charlie).claimRefund(id))
        .to.be.revertedWithCustomError(fx.reg, "AccountFrozenError");
    });
  });

  // ---------------------------------------------------------------- view getters
  describe("view getters", () => {
    it("isAllowedToken reflects the allowlist", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, admin, usdcToken } = fx;
      const addr = await usdcToken.getAddress();
      expect(await reg.isAllowedToken(addr)).to.equal(true);
      expect(await reg.isAllowedToken(ethers.Wallet.createRandom().address)).to.equal(false);
      await reg.connect(admin).setTokenAllowed(addr, false);
      expect(await reg.isAllowedToken(addr)).to.equal(false);
    });

    it("nextWagerId starts at 1 and advances with each create", async () => {
      const fx = await loadFixture(deployFixture);
      expect(await fx.reg.nextWagerId()).to.equal(1n);
      await createNamed(fx);
      expect(await fx.reg.nextWagerId()).to.equal(2n);
    });
  });
});
