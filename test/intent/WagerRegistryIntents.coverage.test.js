const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry, deployMembershipManager } = require("../helpers/proxy");

// Spec 035/046 — branch-coverage closure for the WagerRegistryIntents facet.
// These cases exercise the untested revert/guard sides of every twin: the notFrozen /
// whenNotPaused / onlyRole modifiers, the setFeeNetting bounds check, and the relocated
// autoResolveFrom* cold paths (NotActive / NotAuthorized / AdapterNotSet).

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = {
  Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4,
  ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7,
};
const Op = { GT: 0, GTE: 1, LT: 2, LTE: 3, EQ: 4 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);
const randomNonce = () => ethers.hexlify(ethers.randomBytes(32));

const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

const CREATE_WAGER_INTENT_TYPES = {
  CreateWagerIntent: [
    { name: "creator", type: "address" },
    { name: "opponent", type: "address" },
    { name: "arbitrator", type: "address" },
    { name: "token", type: "address" },
    { name: "creatorStake", type: "uint128" },
    { name: "opponentStake", type: "uint128" },
    { name: "acceptDeadline", type: "uint64" },
    { name: "resolveDeadline", type: "uint64" },
    { name: "resolutionType", type: "uint8" },
    { name: "conditionId", type: "bytes32" },
    { name: "creatorIsYes", type: "bool" },
    { name: "metadataHash", type: "bytes32" },
    { name: "metadataUri", type: "string" },
    { name: "termsVersionHash", type: "bytes32" },
    { name: "paymentNonce", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
};

const ACCEPT_WAGER_INTENT_TYPES = {
  AcceptWagerIntent: [
    { name: "wagerId", type: "uint256" },
    { name: "taker", type: "address" },
    { name: "paymentNonce", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
};

const simpleIntentTypes = (structName, actorField) => ({
  [structName]: [
    { name: "wagerId", type: "uint256" },
    { name: actorField, type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
});

const EMPTY_AUTH = { value: 0, validAfter: 0, validBefore: 0, nonce: ethers.ZeroHash, v: 0, r: ethers.ZeroHash, s: ethers.ZeroHash };

describe("WagerRegistryIntents — branch coverage (spec 046)", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, relayer, treasury, feeSink] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDCPermit");
    const usdcToken = await MockUSDC.deploy();
    await usdcToken.waitForDeployment();

    const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
    const limits = { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 };
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, limits, true);
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Silver, usdc(120), 30, limits, true);

    const MockOracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await MockOracle.deploy();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    const guard = await Guard.deploy(admin.address, await oracle.getAddress());

    // Polymarket adapter (wired at init so a Polymarket wager can be created, then unset later).
    const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await Ctf.deploy();
    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const pmAdapter = await PolymarketAdapter.deploy(admin.address, await ctf.getAddress());

    // Chainlink data-feed adapter for the extensible-oracle autoResolve path.
    const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed = await Agg.deploy(0n, 8, await time.latest());
    const ClAdapter = await ethers.getContractFactory("ChainlinkDataFeedOracleAdapter");
    const clAdapter = await ClAdapter.deploy(admin.address);
    await clAdapter.setFeedAllowed(await feed.getAddress(), true);

    const reg = await deployWagerRegistry([
      admin.address,
      await mgr.getAddress(),
      await pmAdapter.getAddress(),
      [await usdcToken.getAddress()],
    ]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);
    await reg.connect(admin).setSanctionsGuard(await guard.getAddress());
    await mgr.connect(admin).setSanctionsGuard(await guard.getAddress());
    await reg.connect(admin).setOracleAdapter(Resolution.ChainlinkDataFeed, await clAdapter.getAddress());

    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256); // allowance for self-submit oracle wagers
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    }

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const regDomain = {
      name: "FairWins WagerRegistry",
      version: "1",
      chainId,
      verifyingContract: await reg.getAddress(),
    };
    const tokenDomain = {
      name: "USD Coin",
      version: "1",
      chainId,
      verifyingContract: await usdcToken.getAddress(),
    };

    return { reg, mgr, usdcToken, oracle, guard, ctf, pmAdapter, clAdapter, feed, admin, alice, bob, charlie, relayer, treasury, feeSink, regDomain, tokenDomain };
  }

  async function signStakeAuth(fx, signer, value, overrides = {}) {
    const now = await time.latest();
    const message = {
      from: signer.address,
      to: await fx.reg.getAddress(),
      value,
      validAfter: 0,
      validBefore: now + 3600,
      nonce: randomNonce(),
      ...overrides,
    };
    const sig = ethers.Signature.from(
      await signer.signTypedData(fx.tokenDomain, RECEIVE_WITH_AUTHORIZATION_TYPES, message)
    );
    return {
      value: message.value,
      validAfter: message.validAfter,
      validBefore: message.validBefore,
      nonce: message.nonce,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    };
  }

  async function signCreate(fx, creator, overrides = {}) {
    const now = await time.latest();
    const args = {
      opponent: fx.bob.address,
      arbitrator: ethers.ZeroAddress,
      token: await fx.usdcToken.getAddress(),
      creatorStake: usdc(10),
      opponentStake: usdc(10),
      acceptDeadline: now + 3600,
      resolveDeadline: now + 86400,
      resolutionType: Resolution.Either,
      conditionId: ethers.ZeroHash,
      creatorIsYes: false,
      metadataHash: ethers.id("test"),
      metadataUri: "ipfs://bafyIntentCid",
      termsVersionHash: ethers.ZeroHash,
      ...overrides.args,
    };
    const stakeAuth = await signStakeAuth(fx, creator, args.creatorStake);
    args.paymentNonce = overrides.paymentNonce ?? stakeAuth.nonce;

    const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600, ...overrides.intent };
    const message = {
      creator: creator.address,
      ...args,
      nonce: intent.nonce,
      validAfter: intent.validAfter,
      validBefore: intent.validBefore,
    };
    const sig = await creator.signTypedData(fx.regDomain, CREATE_WAGER_INTENT_TYPES, message);
    return { args, intent, sig, stakeAuth };
  }

  async function gaslessCreate(fx, creator, overrides = {}, feeAuth = EMPTY_AUTH) {
    const signed = await signCreate(fx, creator, overrides);
    const tx = await fx.reg
      .connect(fx.relayer)
      .createWagerWithAuthorization(
        signed.args, creator.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, feeAuth
      );
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l) => { try { return fx.reg.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "WagerCreated");
    return { wagerId: Number(ev.args.wagerId), signed };
  }

  async function signAccept(fx, taker, wagerId, stakeValue, overrides = {}) {
    const now = await time.latest();
    const stakeAuth = await signStakeAuth(fx, taker, stakeValue, overrides.auth ?? {});
    const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600, ...overrides.intent };
    const message = {
      wagerId,
      taker: taker.address,
      paymentNonce: overrides.paymentNonce ?? stakeAuth.nonce,
      nonce: intent.nonce,
      validAfter: intent.validAfter,
      validBefore: intent.validBefore,
    };
    const sig = await taker.signTypedData(fx.regDomain, ACCEPT_WAGER_INTENT_TYPES, message);
    return { intent, sig, stakeAuth };
  }

  async function signSimple(fx, signer, structName, actorField, wagerId, overrides = {}) {
    const now = await time.latest();
    const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600, ...overrides };
    const message = { wagerId, [actorField]: signer.address, nonce: intent.nonce, validAfter: intent.validAfter, validBefore: intent.validBefore };
    const sig = await signer.signTypedData(fx.regDomain, simpleIntentTypes(structName, actorField), message);
    return { intent, sig };
  }

  /** Self-submit create + accept, producing an Active wager of the given resolution type. */
  async function activeWager(fx, opts = {}) {
    const now = await time.latest();
    const tx = await fx.reg.connect(fx.alice).createWager(
      fx.bob.address, opts.arbitrator ?? ethers.ZeroAddress, await fx.usdcToken.getAddress(),
      usdc(10), usdc(10), now + 1800, now + 7200,
      opts.resolutionType ?? Resolution.Either,
      opts.conditionId ?? ethers.ZeroHash,
      opts.creatorIsYes ?? false,
      ethers.id("meta"), ""
    );
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map((l) => { try { return fx.reg.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "WagerCreated");
    const wagerId = Number(ev.args.wagerId);
    await fx.reg.connect(fx.bob).acceptWager(wagerId);
    return wagerId;
  }

  // ---------------------------------------------------------------------------
  // whenNotPaused guard on the money-in twins
  // ---------------------------------------------------------------------------
  describe("whenNotPaused guard (…WithAuthorization twins)", function () {
    it("createWagerWithAuthorization reverts when paused", async function () {
      const fx = await loadFixture(deployFixture);
      const signed = await signCreate(fx, fx.alice);
      await fx.reg.connect(fx.admin).pause();
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "EnforcedPause");
    });

    it("acceptWagerWithAuthorization reverts when paused", async function () {
      const fx = await loadFixture(deployFixture);
      const { wagerId } = await gaslessCreate(fx, fx.alice);
      const acc = await signAccept(fx, fx.bob, wagerId, usdc(10));
      await fx.reg.connect(fx.admin).pause();
      await expect(
        fx.reg.connect(fx.relayer).acceptWagerWithAuthorization(
          wagerId, fx.bob.address, acc.intent.nonce, acc.intent.validAfter, acc.intent.validBefore, acc.sig, acc.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "EnforcedPause");
    });

    it("acceptOpenWagerWithAuthorization reverts when paused", async function () {
      const fx = await loadFixture(deployFixture);
      const acc = await signAccept(fx, fx.bob, 1, usdc(10));
      await fx.reg.connect(fx.admin).pause();
      await expect(
        fx.reg.connect(fx.relayer).acceptOpenWagerWithAuthorization(
          1, fx.bob.address, "0x", acc.intent.nonce, acc.intent.validAfter, acc.intent.validBefore, acc.sig, acc.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "EnforcedPause");
    });
  });

  // ---------------------------------------------------------------------------
  // notFrozen(signer) guard — freeze fires before the body on every twin
  // ---------------------------------------------------------------------------
  describe("notFrozen(signer) guard", function () {
    it("acceptWagerWithAuthorization blocks a frozen signer", async function () {
      const fx = await loadFixture(deployFixture);
      const { wagerId } = await gaslessCreate(fx, fx.alice);
      await fx.reg.connect(fx.admin).freezeAccount(fx.bob.address, "test");
      const acc = await signAccept(fx, fx.bob, wagerId, usdc(10));
      await expect(
        fx.reg.connect(fx.relayer).acceptWagerWithAuthorization(
          wagerId, fx.bob.address, acc.intent.nonce, acc.intent.validAfter, acc.intent.validBefore, acc.sig, acc.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.bob.address);
    });

    it("acceptOpenWagerWithAuthorization blocks a frozen signer", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.bob.address, "test");
      const acc = await signAccept(fx, fx.bob, 1, usdc(10));
      await expect(
        fx.reg.connect(fx.relayer).acceptOpenWagerWithAuthorization(
          1, fx.bob.address, "0x", acc.intent.nonce, acc.intent.validAfter, acc.intent.validBefore, acc.sig, acc.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.bob.address);
    });

    it("claimPayoutWithSig blocks a frozen signer", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.bob.address, "test");
      const { intent, sig } = await signSimple(fx, fx.bob, "ClaimPayoutIntent", "claimant", 1);
      await expect(
        fx.reg.connect(fx.relayer).claimPayoutWithSig(1, fx.bob.address, intent.nonce, intent.validAfter, intent.validBefore, sig)
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.bob.address);
    });

    it("claimRefundWithSig blocks a frozen signer", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.charlie.address, "test");
      const { intent, sig } = await signSimple(fx, fx.charlie, "ClaimRefundIntent", "actor", 1);
      await expect(
        fx.reg.connect(fx.relayer).claimRefundWithSig(1, fx.charlie.address, intent.nonce, intent.validAfter, intent.validBefore, sig)
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.charlie.address);
    });

    it("declareDrawWithSig blocks a frozen signer", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "test");
      const { intent, sig } = await signSimple(fx, fx.alice, "DeclareDrawIntent", "actor", 1);
      await expect(
        fx.reg.connect(fx.relayer).declareDrawWithSig(1, fx.alice.address, intent.nonce, intent.validAfter, intent.validBefore, sig)
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.alice.address);
    });

    it("revokeDrawWithSig blocks a frozen signer", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "test");
      const { intent, sig } = await signSimple(fx, fx.alice, "RevokeDrawIntent", "actor", 1);
      await expect(
        fx.reg.connect(fx.relayer).revokeDrawWithSig(1, fx.alice.address, intent.nonce, intent.validAfter, intent.validBefore, sig)
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.alice.address);
    });

    it("cancelOpenWithSig blocks a frozen signer", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "test");
      const { intent, sig } = await signSimple(fx, fx.alice, "CancelOpenIntent", "actor", 1);
      await expect(
        fx.reg.connect(fx.relayer).cancelOpenWithSig(1, fx.alice.address, intent.nonce, intent.validAfter, intent.validBefore, sig)
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.alice.address);
    });

    it("declineWagerWithSig blocks a frozen signer", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.bob.address, "test");
      const { intent, sig } = await signSimple(fx, fx.bob, "DeclineIntent", "actor", 1);
      await expect(
        fx.reg.connect(fx.relayer).declineWagerWithSig(1, fx.bob.address, intent.nonce, intent.validAfter, intent.validBefore, sig)
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.bob.address);
    });

    it("declareWinnerWithSig blocks a frozen signer", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "test");
      const now = await time.latest();
      const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600 };
      const sig = await fx.alice.signTypedData(fx.regDomain, {
        DeclareWinnerIntent: [
          { name: "wagerId", type: "uint256" },
          { name: "winner", type: "address" },
          { name: "actor", type: "address" },
          { name: "nonce", type: "bytes32" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
        ],
      }, { wagerId: 1, winner: fx.bob.address, actor: fx.alice.address, ...intent });
      await expect(
        fx.reg.connect(fx.relayer).declareWinnerWithSig(1, fx.bob.address, fx.alice.address, intent.nonce, intent.validAfter, intent.validBefore, sig)
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.alice.address);
    });
  });

  // ---------------------------------------------------------------------------
  // batchExpireOpen — whenNotPaused guard + happy body
  // ---------------------------------------------------------------------------
  describe("batchExpireOpen", function () {
    it("reverts when paused", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).pause();
      await expect(fx.reg.connect(fx.relayer).batchExpireOpen([]))
        .to.be.revertedWithCustomError(fx.reg, "EnforcedPause");
    });

    it("refunds the creator of an expired open challenge", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.mgr.connect(fx.admin).grantMembership(fx.alice.address, WAGER_PARTICIPANT_ROLE, Tier.Silver, 30);
      const claimKey = ethers.Wallet.createRandom();
      const now = await time.latest();
      const tx = await fx.reg.connect(fx.alice).createOpenWager(
        claimKey.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(), usdc(10),
        now + 1800, now + 7200, Resolution.Either, ethers.ZeroHash, false, ethers.id("open"), "ipfs://open"
      );
      const rcpt = await tx.wait();
      const ev = rcpt.logs.map((l) => { try { return fx.reg.interface.parseLog(l); } catch { return null; } })
        .find((p) => p && p.name === "OpenWagerCreated");
      const wagerId = Number(ev.args.wagerId);

      await time.increaseTo(now + 1801);
      const before = await fx.usdcToken.balanceOf(fx.alice.address);
      await expect(fx.reg.connect(fx.relayer).batchExpireOpen([wagerId]))
        .to.emit(fx.reg, "WagerRefunded").withArgs(wagerId, fx.alice.address, ethers.ZeroAddress);
      expect(await fx.usdcToken.balanceOf(fx.alice.address)).to.equal(before + usdc(10));
    });
  });

  // ---------------------------------------------------------------------------
  // setFeeNetting — onlyRole guard + bounds
  // ---------------------------------------------------------------------------
  describe("setFeeNetting", function () {
    it("is DEFAULT_ADMIN_ROLE-gated", async function () {
      const fx = await loadFixture(deployFixture);
      await expect(fx.reg.connect(fx.alice).setFeeNetting(true, fx.feeSink.address, usdc(1)))
        .to.be.revertedWithCustomError(fx.reg, "AccessControlUnauthorizedAccount");
    });

    it("rejects enabling with a zero recipient", async function () {
      const fx = await loadFixture(deployFixture);
      await expect(fx.reg.connect(fx.admin).setFeeNetting(true, ethers.ZeroAddress, usdc(1)))
        .to.be.revertedWithCustomError(fx.reg, "ZeroAddress");
    });

    it("allows disabling with a zero recipient (short-circuits the recipient check)", async function () {
      const fx = await loadFixture(deployFixture);
      await expect(fx.reg.connect(fx.admin).setFeeNetting(false, ethers.ZeroAddress, 0))
        .to.emit(fx.reg, "FeeNettingUpdated").withArgs(false, ethers.ZeroAddress, 0);
      expect(await fx.reg.feeNettingEnabled()).to.equal(false);
      expect(await fx.reg.gasFeeRecipient()).to.equal(ethers.ZeroAddress);
      expect(await fx.reg.maxGasFee()).to.equal(0);
    });
  });

  // ---------------------------------------------------------------------------
  // autoResolveFromPolymarket — guard reverts
  // ---------------------------------------------------------------------------
  describe("autoResolveFromPolymarket", function () {
    it("reverts NotActive for a non-active wager", async function () {
      const fx = await loadFixture(deployFixture);
      await gaslessCreate(fx, fx.alice); // wager 1 is Open, not Active
      await expect(fx.reg.connect(fx.relayer).autoResolveFromPolymarket(1))
        .to.be.revertedWithCustomError(fx.reg, "NotActive");
    });

    it("reverts NotAuthorized for a non-Polymarket resolution type", async function () {
      const fx = await loadFixture(deployFixture);
      const wagerId = await activeWager(fx, { resolutionType: Resolution.Either });
      await expect(fx.reg.connect(fx.relayer).autoResolveFromPolymarket(wagerId))
        .to.be.revertedWithCustomError(fx.reg, "NotAuthorized");
    });

    it("reverts AdapterNotSet when the Polymarket adapter has been unset", async function () {
      const fx = await loadFixture(deployFixture);
      const questionId = ethers.id("q-" + Math.random());
      const conditionId = await fx.ctf.getConditionId(fx.admin.address, questionId, 2);
      await fx.ctf.prepareCondition(fx.admin.address, questionId, 2);
      const wagerId = await activeWager(fx, { resolutionType: Resolution.Polymarket, conditionId, creatorIsYes: true });

      await fx.reg.connect(fx.admin).setPolymarketAdapter(ethers.ZeroAddress);
      await expect(fx.reg.connect(fx.relayer).autoResolveFromPolymarket(wagerId))
        .to.be.revertedWithCustomError(fx.reg, "AdapterNotSet");
    });
  });

  // ---------------------------------------------------------------------------
  // autoResolveFromOracle — guard reverts
  // ---------------------------------------------------------------------------
  describe("autoResolveFromOracle", function () {
    it("reverts NotActive for a non-active wager", async function () {
      const fx = await loadFixture(deployFixture);
      await gaslessCreate(fx, fx.alice); // wager 1 is Open, not Active
      await expect(fx.reg.connect(fx.relayer).autoResolveFromOracle(1))
        .to.be.revertedWithCustomError(fx.reg, "NotActive");
    });

    it("reverts NotAuthorized for a non-extensible-oracle resolution type", async function () {
      const fx = await loadFixture(deployFixture);
      const wagerId = await activeWager(fx, { resolutionType: Resolution.Either });
      await expect(fx.reg.connect(fx.relayer).autoResolveFromOracle(wagerId))
        .to.be.revertedWithCustomError(fx.reg, "NotAuthorized");
    });

    it("reverts OracleAdapterNotSet when the adapter has been unset", async function () {
      const fx = await loadFixture(deployFixture);
      const conditionId = ethers.id("c-" + Math.random());
      const evalDeadline = (await time.latest()) + 3600;
      await fx.clAdapter.registerCondition(conditionId, await fx.feed.getAddress(), 2500_00000000n, Op.GT, evalDeadline);
      const wagerId = await activeWager(fx, { resolutionType: Resolution.ChainlinkDataFeed, conditionId, creatorIsYes: true });

      await fx.reg.connect(fx.admin).setOracleAdapter(Resolution.ChainlinkDataFeed, ethers.ZeroAddress);
      await expect(fx.reg.connect(fx.relayer).autoResolveFromOracle(wagerId))
        .to.be.revertedWithCustomError(fx.reg, "OracleAdapterNotSet");
    });
  });
});
