const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry, deployMembershipManager } = require("../helpers/proxy");

// Spec 035 — signer-attributed (gasless) wager intents. A relayer (any third party) submits the
// user's signed intent; the on-chain effect is attributed to the SIGNER: creator/opponent/winner
// are the signers, stakes are pulled from the signers' balances via EIP-3009, and every
// screening/membership/ownership/freeze check evaluates the signer (FR-002/FR-003/FR-007).

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4 };
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5, Draw: 6 };
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

describe("WagerRegistry signer-attributed intents (spec 035)", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, relayer, treasury, feeSink] = await ethers.getSigners();

    // EIP-3009-capable stablecoin (MockUSDCPermit) — the gasless money leg requires it.
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

    const reg = await deployWagerRegistry([
      admin.address,
      await mgr.getAddress(),
      ethers.ZeroAddress,
      [await usdcToken.getAddress()],
    ]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);
    await reg.connect(admin).setSanctionsGuard(await guard.getAddress());
    await mgr.connect(admin).setSanctionsGuard(await guard.getAddress());

    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
      // NOTE: deliberately NO approval to the registry — the gasless paths must not need one.
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
      version: "1", // MockUSDCPermit uses OZ's default domain version
      chainId,
      verifyingContract: await usdcToken.getAddress(),
    };

    return { reg, mgr, usdcToken, oracle, guard, admin, alice, bob, charlie, relayer, treasury, feeSink, regDomain, tokenDomain };
  }

  /** Sign an EIP-3009 receive authorization pulling `value` from `signer` into the registry. */
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

  const EMPTY_AUTH = { value: 0, validAfter: 0, validBefore: 0, nonce: ethers.ZeroHash, v: 0, r: ethers.ZeroHash, s: ethers.ZeroHash };

  /** Build + sign a CreateWagerIntent along with its stake authorization. */
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

    const intent = {
      nonce: randomNonce(),
      validAfter: 0,
      validBefore: now + 3600,
      ...overrides.intent,
    };
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

  /** Full happy-path gasless create; returns the wagerId. */
  async function gaslessCreate(fx, creator, overrides = {}, feeAuth = EMPTY_AUTH) {
    const signed = await signCreate(fx, creator, overrides);
    signed.signerAddress = creator.address;
    const tx = await fx.reg
      .connect(fx.relayer)
      .createWagerWithAuthorization(
        signed.args,
        creator.address,
        signed.intent.nonce,
        signed.intent.validAfter,
        signed.intent.validBefore,
        signed.sig,
        signed.stakeAuth,
        feeAuth
      );
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l) => { try { return fx.reg.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "WagerCreated");
    return { wagerId: Number(ev.args.wagerId), signed };
  }

  /** Sign an AcceptWagerIntent + stake auth for `taker` on `wagerId`. */
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

  /** Sign a simple no-stake intent (ClaimPayoutIntent, DeclineIntent, …). */
  async function signSimple(fx, signer, structName, actorField, wagerId, overrides = {}) {
    const now = await time.latest();
    const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600, ...overrides };
    const message = { wagerId, [actorField]: signer.address, nonce: intent.nonce, validAfter: intent.validAfter, validBefore: intent.validBefore };
    const sig = await signer.signTypedData(fx.regDomain, simpleIntentTypes(structName, actorField), message);
    return { intent, sig };
  }

  describe("createWagerWithAuthorization", function () {
    it("creates the wager attributed to the signer, staking from the signer's balance (SC-001/SC-003)", async function () {
      const fx = await loadFixture(deployFixture);
      const before = await fx.usdcToken.balanceOf(fx.alice.address);
      const { wagerId } = await gaslessCreate(fx, fx.alice);

      const w = await fx.reg.getWager(wagerId);
      expect(w.creator).to.equal(fx.alice.address); // attributed to the SIGNER, not the relayer
      expect(w.opponent).to.equal(fx.bob.address);
      expect(w.status).to.equal(Status.Open);
      expect(await fx.usdcToken.balanceOf(fx.alice.address)).to.equal(before - usdc(10));
      expect(await fx.usdcToken.balanceOf(await fx.reg.getAddress())).to.equal(usdc(10));
    });

    it("emits the same WagerCreated event as the self-submit twin (subgraph-compatible)", async function () {
      const fx = await loadFixture(deployFixture);
      const signed = await signCreate(fx, fx.alice);
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        )
      )
        .to.emit(fx.reg, "WagerCreated")
        .withArgs(1, fx.alice.address, fx.bob.address, await fx.usdcToken.getAddress(), usdc(10), usdc(10), Resolution.Either, ethers.id("test"), "ipfs://bafyIntentCid");
    });

    it("rejects a replayed intent (SC-004)", async function () {
      const fx = await loadFixture(deployFixture);
      const signed = await signCreate(fx, fx.alice);
      const submit = () =>
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        );
      await submit();
      await expect(submit()).to.be.revertedWithCustomError(fx.reg, "IntentReplayed");
    });

    it("rejects an expired intent and a not-yet-valid intent", async function () {
      const fx = await loadFixture(deployFixture);
      const now = await time.latest();

      const expired = await signCreate(fx, fx.alice, { intent: { validBefore: now - 1 } });
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          expired.args, fx.alice.address, expired.intent.nonce, expired.intent.validAfter, expired.intent.validBefore, expired.sig, expired.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "IntentExpired");

      const future = await signCreate(fx, fx.alice, { intent: { validAfter: now + 3000 } });
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          future.args, fx.alice.address, future.intent.nonce, future.intent.validAfter, future.intent.validBefore, future.sig, future.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "IntentNotYetValid");
    });

    it("rejects a signature from anyone but the claimed signer", async function () {
      const fx = await loadFixture(deployFixture);
      const signed = await signCreate(fx, fx.alice);
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.charlie.address, // claims charlie, signed by alice
          signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "InvalidIntentSignature");
    });

    it("rejects a relayer substituting a different stake authorization (FR-007 binding)", async function () {
      const fx = await loadFixture(deployFixture);
      const signed = await signCreate(fx, fx.alice);
      // A second, equally valid authorization from alice NOT bound into the intent:
      const otherAuth = await signStakeAuth(fx, fx.alice, usdc(10));
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, otherAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "PaymentAuthMismatch");
    });

    it("rejects a tampered param (stake) — the intent binds exactly what was signed", async function () {
      const fx = await loadFixture(deployFixture);
      const signed = await signCreate(fx, fx.alice);
      const tampered = { ...signed.args, creatorStake: usdc(1) }; // relayer tries to shrink the stake
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          tampered, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "InvalidIntentSignature");
    });

    it("screens the SIGNER fail-closed (sanctioned signer blocked, FR-003/FR-013)", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.guard.connect(fx.admin).setDenied(fx.alice.address, true, "ofac");
      const signed = await signCreate(fx, fx.alice);
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.guard, "SanctionedAddress").withArgs(fx.alice.address);
    });

    it("blocks a frozen signer (freeze check evaluates the signer, not the relayer)", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).freezeAccount(fx.alice.address, "test");
      const signed = await signCreate(fx, fx.alice);
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "AccountFrozenError").withArgs(fx.alice.address);
    });

    it("self-submit twin produces an identical on-chain result (SC-005)", async function () {
      const fx = await loadFixture(deployFixture);
      // Gasless create (id 1)
      const { wagerId: gaslessId } = await gaslessCreate(fx, fx.alice);
      // Self-submit create with identical params (id 2)
      await fx.usdcToken.connect(fx.alice).approve(await fx.reg.getAddress(), ethers.MaxUint256);
      const now = await time.latest();
      await fx.reg.connect(fx.alice).createWager(
        fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
        usdc(10), usdc(10), now + 3600, now + 86400, Resolution.Either,
        ethers.ZeroHash, false, ethers.id("test"), "ipfs://bafyIntentCid"
      );
      const a = await fx.reg.getWager(gaslessId);
      const b = await fx.reg.getWager(gaslessId + 1);
      expect(a.creator).to.equal(b.creator);
      expect(a.opponent).to.equal(b.opponent);
      expect(a.creatorStake).to.equal(b.creatorStake);
      expect(a.status).to.equal(b.status);
    });
  });

  describe("acceptWagerWithAuthorization", function () {
    it("full gasless lifecycle: create + accept with zero registry approvals (SC-001)", async function () {
      const fx = await loadFixture(deployFixture);
      const { wagerId } = await gaslessCreate(fx, fx.alice);

      const bobBefore = await fx.usdcToken.balanceOf(fx.bob.address);
      const acc = await signAccept(fx, fx.bob, wagerId, usdc(10));
      await expect(
        fx.reg.connect(fx.relayer).acceptWagerWithAuthorization(
          wagerId, fx.bob.address, acc.intent.nonce, acc.intent.validAfter, acc.intent.validBefore, acc.sig, acc.stakeAuth, EMPTY_AUTH
        )
      ).to.emit(fx.reg, "WagerAccepted").withArgs(wagerId, fx.bob.address);

      const w = await fx.reg.getWager(wagerId);
      expect(w.status).to.equal(Status.Active);
      expect(w.opponent).to.equal(fx.bob.address);
      expect(await fx.usdcToken.balanceOf(fx.bob.address)).to.equal(bobBefore - usdc(10));
    });

    it("only the named opponent's signature can accept (attribution, not submission, decides)", async function () {
      const fx = await loadFixture(deployFixture);
      const { wagerId } = await gaslessCreate(fx, fx.alice);
      const acc = await signAccept(fx, fx.charlie, wagerId, usdc(10)); // charlie is not the opponent
      await expect(
        fx.reg.connect(fx.relayer).acceptWagerWithAuthorization(
          wagerId, fx.charlie.address, acc.intent.nonce, acc.intent.validAfter, acc.intent.validBefore, acc.sig, acc.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "NotOpponent");
    });

    it("rejects replay of the accept intent", async function () {
      const fx = await loadFixture(deployFixture);
      const { wagerId } = await gaslessCreate(fx, fx.alice);
      const acc = await signAccept(fx, fx.bob, wagerId, usdc(10));
      const submit = () =>
        fx.reg.connect(fx.relayer).acceptWagerWithAuthorization(
          wagerId, fx.bob.address, acc.intent.nonce, acc.intent.validAfter, acc.intent.validBefore, acc.sig, acc.stakeAuth, EMPTY_AUTH
        );
      await submit();
      await expect(submit()).to.be.revertedWithCustomError(fx.reg, "IntentReplayed");
    });
  });

  describe("fee netting (FR-015/FR-016)", function () {
    it("consumes the bounded fee authorization and forwards it to the segregated recipient", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).setFeeNetting(true, fx.feeSink.address, usdc(1));
      expect(await fx.reg.feeNettingEnabled()).to.equal(true);

      const feeAuth = await signStakeAuth(fx, fx.alice, usdc(1) / 2n); // 0.5 USDC fee
      await gaslessCreate(fx, fx.alice, {}, feeAuth);
      expect(await fx.usdcToken.balanceOf(fx.feeSink.address)).to.equal(usdc(1) / 2n);
    });

    it("declines a fee above the cap before any funds move", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).setFeeNetting(true, fx.feeSink.address, usdc(1));
      const balBefore = await fx.usdcToken.balanceOf(fx.alice.address);

      const signed = await signCreate(fx, fx.alice);
      const feeAuth = await signStakeAuth(fx, fx.alice, usdc(2)); // over the 1 USDC cap
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, feeAuth
        )
      ).to.be.revertedWithCustomError(fx.reg, "FeeExceedsCap");
      expect(await fx.usdcToken.balanceOf(fx.alice.address)).to.equal(balBefore); // atomic — nothing moved
    });

    it("ignores the fee leg when netting is disabled (sponsored mode)", async function () {
      const fx = await loadFixture(deployFixture);
      await gaslessCreate(fx, fx.alice, {}, EMPTY_AUTH);
      expect(await fx.usdcToken.balanceOf(fx.feeSink.address)).to.equal(0);
    });
  });

  describe("no-stake …WithSig twins", function () {
    async function activeWager(fx) {
      const { wagerId } = await gaslessCreate(fx, fx.alice);
      const acc = await signAccept(fx, fx.bob, wagerId, usdc(10));
      await fx.reg.connect(fx.relayer).acceptWagerWithAuthorization(
        wagerId, fx.bob.address, acc.intent.nonce, acc.intent.validAfter, acc.intent.validBefore, acc.sig, acc.stakeAuth, EMPTY_AUTH
      );
      return wagerId;
    }

    it("declareWinnerWithSig resolves attributed to the signer; claimPayoutWithSig pays the winning signer (SC-009)", async function () {
      const fx = await loadFixture(deployFixture);
      const wagerId = await activeWager(fx);

      // alice (Either-type participant) declares bob the winner via intent
      const now = await time.latest();
      const winIntent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600 };
      const winSig = await fx.alice.signTypedData(fx.regDomain, {
        DeclareWinnerIntent: [
          { name: "wagerId", type: "uint256" },
          { name: "winner", type: "address" },
          { name: "actor", type: "address" },
          { name: "nonce", type: "bytes32" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
        ],
      }, { wagerId, winner: fx.bob.address, actor: fx.alice.address, ...winIntent });

      await expect(
        fx.reg.connect(fx.relayer).declareWinnerWithSig(wagerId, fx.bob.address, fx.alice.address, winIntent.nonce, winIntent.validAfter, winIntent.validBefore, winSig)
      ).to.emit(fx.reg, "WagerResolved").withArgs(wagerId, fx.bob.address, fx.alice.address);

      // bob claims the payout gaslessly — lands in bob's wallet
      const bobBefore = await fx.usdcToken.balanceOf(fx.bob.address);
      const claim = await signSimple(fx, fx.bob, "ClaimPayoutIntent", "claimant", wagerId);
      await expect(
        fx.reg.connect(fx.relayer).claimPayoutWithSig(wagerId, fx.bob.address, claim.intent.nonce, claim.intent.validAfter, claim.intent.validBefore, claim.sig)
      ).to.emit(fx.reg, "PayoutClaimed").withArgs(wagerId, fx.bob.address, usdc(20));
      expect(await fx.usdcToken.balanceOf(fx.bob.address)).to.equal(bobBefore + usdc(20));
    });

    it("a non-winner's signed claim reverts (ownership evaluated on the signer)", async function () {
      const fx = await loadFixture(deployFixture);
      const wagerId = await activeWager(fx);
      await fx.reg.connect(fx.alice).declareWinner(wagerId, fx.bob.address);

      const claim = await signSimple(fx, fx.alice, "ClaimPayoutIntent", "claimant", wagerId);
      await expect(
        fx.reg.connect(fx.relayer).claimPayoutWithSig(wagerId, fx.alice.address, claim.intent.nonce, claim.intent.validAfter, claim.intent.validBefore, claim.sig)
      ).to.be.revertedWithCustomError(fx.reg, "NotWinner");
    });

    it("declineWagerWithSig refunds the creator, attributed to the signing opponent", async function () {
      const fx = await loadFixture(deployFixture);
      const { wagerId } = await gaslessCreate(fx, fx.alice);
      const dec = await signSimple(fx, fx.bob, "DeclineIntent", "actor", wagerId);
      await expect(
        fx.reg.connect(fx.relayer).declineWagerWithSig(wagerId, fx.bob.address, dec.intent.nonce, dec.intent.validAfter, dec.intent.validBefore, dec.sig)
      ).to.emit(fx.reg, "WagerDeclined").withArgs(wagerId, fx.bob.address);
    });

    it("cancelOpenWithSig only honors the creator's signature", async function () {
      const fx = await loadFixture(deployFixture);
      const { wagerId } = await gaslessCreate(fx, fx.alice);

      const bad = await signSimple(fx, fx.bob, "CancelOpenIntent", "actor", wagerId);
      await expect(
        fx.reg.connect(fx.relayer).cancelOpenWithSig(wagerId, fx.bob.address, bad.intent.nonce, bad.intent.validAfter, bad.intent.validBefore, bad.sig)
      ).to.be.revertedWithCustomError(fx.reg, "NotCreator");

      const good = await signSimple(fx, fx.alice, "CancelOpenIntent", "actor", wagerId);
      await expect(
        fx.reg.connect(fx.relayer).cancelOpenWithSig(wagerId, fx.alice.address, good.intent.nonce, good.intent.validAfter, good.intent.validBefore, good.sig)
      ).to.emit(fx.reg, "WagerCancelled").withArgs(wagerId);
    });

    it("declareDrawWithSig + revokeDrawWithSig drive the mutual-consent draw as the signers", async function () {
      const fx = await loadFixture(deployFixture);
      const wagerId = await activeWager(fx);

      const p1 = await signSimple(fx, fx.alice, "DeclareDrawIntent", "actor", wagerId);
      await expect(
        fx.reg.connect(fx.relayer).declareDrawWithSig(wagerId, fx.alice.address, p1.intent.nonce, p1.intent.validAfter, p1.intent.validBefore, p1.sig)
      ).to.emit(fx.reg, "DrawProposed").withArgs(wagerId, fx.alice.address);

      const rv = await signSimple(fx, fx.alice, "RevokeDrawIntent", "actor", wagerId);
      await expect(
        fx.reg.connect(fx.relayer).revokeDrawWithSig(wagerId, fx.alice.address, rv.intent.nonce, rv.intent.validAfter, rv.intent.validBefore, rv.sig)
      ).to.emit(fx.reg, "DrawRevoked").withArgs(wagerId, fx.alice.address);

      // Propose again from both sides → settles as a draw
      const p2 = await signSimple(fx, fx.alice, "DeclareDrawIntent", "actor", wagerId);
      await fx.reg.connect(fx.relayer).declareDrawWithSig(wagerId, fx.alice.address, p2.intent.nonce, p2.intent.validAfter, p2.intent.validBefore, p2.sig);
      const p3 = await signSimple(fx, fx.bob, "DeclareDrawIntent", "actor", wagerId);
      await expect(
        fx.reg.connect(fx.relayer).declareDrawWithSig(wagerId, fx.bob.address, p3.intent.nonce, p3.intent.validAfter, p3.intent.validBefore, p3.sig)
      ).to.emit(fx.reg, "WagerDrawn").withArgs(wagerId, fx.alice.address, fx.bob.address, fx.bob.address);
    });

    it("claimRefundWithSig refunds the original creator after expiry", async function () {
      const fx = await loadFixture(deployFixture);
      const { wagerId } = await gaslessCreate(fx, fx.alice);
      const w = await fx.reg.getWager(wagerId);
      await time.increaseTo(Number(w.acceptDeadline) + 1);

      const aliceBefore = await fx.usdcToken.balanceOf(fx.alice.address);
      const rf = await signSimple(fx, fx.charlie, "ClaimRefundIntent", "actor", wagerId); // neutral third party drives it
      await expect(
        fx.reg.connect(fx.relayer).claimRefundWithSig(wagerId, fx.charlie.address, rf.intent.nonce, rf.intent.validAfter, rf.intent.validBefore, rf.sig)
      ).to.emit(fx.reg, "WagerRefunded").withArgs(wagerId, fx.alice.address, ethers.ZeroAddress);
      expect(await fx.usdcToken.balanceOf(fx.alice.address)).to.equal(aliceBefore + usdc(10));
    });
  });

  describe("acceptOpenWagerWithAuthorization (open challenges)", function () {
    it("accepts with claim-code proof rebound to the signing taker", async function () {
      const fx = await loadFixture(deployFixture);
      // Silver tier for alice to create an open challenge
      await fx.mgr.connect(fx.admin).grantMembership(fx.alice.address, WAGER_PARTICIPANT_ROLE, Tier.Silver, 30);

      // Claim authority = a fresh code-derived key
      const claimKey = ethers.Wallet.createRandom().connect(ethers.provider);
      const now = await time.latest();
      await fx.usdcToken.connect(fx.alice).approve(await fx.reg.getAddress(), usdc(10));
      const tx = await fx.reg.connect(fx.alice).createOpenWager(
        claimKey.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(), usdc(10),
        now + 3600, now + 86400, Resolution.Either, ethers.ZeroHash, false, ethers.id("open"), "ipfs://open"
      );
      const receipt = await tx.wait();
      const ev = receipt.logs.map((l) => { try { return fx.reg.interface.parseLog(l); } catch { return null; } })
        .find((p) => p && p.name === "OpenWagerCreated");
      const wagerId = Number(ev.args.wagerId);

      // Claim-code proof bound to bob (the SIGNER, not the relayer)
      const claimSig = await claimKey.signTypedData(fx.regDomain, {
        OpenAccept: [
          { name: "wagerId", type: "uint256" },
          { name: "taker", type: "address" },
        ],
      }, { wagerId, taker: fx.bob.address });

      const acc = await signAccept(fx, fx.bob, wagerId, usdc(10));
      await expect(
        fx.reg.connect(fx.relayer).acceptOpenWagerWithAuthorization(
          wagerId, fx.bob.address, claimSig, acc.intent.nonce, acc.intent.validAfter, acc.intent.validBefore, acc.sig, acc.stakeAuth, EMPTY_AUTH
        )
      ).to.emit(fx.reg, "WagerAccepted").withArgs(wagerId, fx.bob.address);
      expect((await fx.reg.getWager(wagerId)).opponent).to.equal(fx.bob.address);
    });
  });

  describe("nonce invalidation (FR-006)", function () {
    it("invalidateNonce burns an unused nonce so the signed intent can never execute", async function () {
      const fx = await loadFixture(deployFixture);
      const signed = await signCreate(fx, fx.alice);
      await expect(fx.reg.connect(fx.alice).invalidateNonce(signed.intent.nonce))
        .to.emit(fx.reg, "NonceInvalidated").withArgs(fx.alice.address, signed.intent.nonce);
      expect(await fx.reg.authorizationState(fx.alice.address, signed.intent.nonce)).to.equal(true);

      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "IntentReplayed");
    });

    it("invalidateNonceWithSig lets a zero-native wallet cancel through the relayer", async function () {
      const fx = await loadFixture(deployFixture);
      const nonce = randomNonce();
      const now = await time.latest();
      const validBefore = now + 3600;
      const sig = await fx.alice.signTypedData(fx.regDomain, {
        InvalidateNonce: [
          { name: "signer", type: "address" },
          { name: "nonce", type: "bytes32" },
          { name: "validBefore", type: "uint256" },
        ],
      }, { signer: fx.alice.address, nonce, validBefore });

      await expect(fx.reg.connect(fx.relayer).invalidateNonceWithSig(fx.alice.address, nonce, validBefore, sig))
        .to.emit(fx.reg, "NonceInvalidated").withArgs(fx.alice.address, nonce);
    });

    it("cancelAuthorization invalidates the payment leg in the stablecoin", async function () {
      const fx = await loadFixture(deployFixture);
      const signed = await signCreate(fx, fx.alice);
      // Cancel the EIP-3009 authorization (payment leg) — the mock implements cancelAuthorization
      const cancelSig = ethers.Signature.from(await fx.alice.signTypedData(fx.tokenDomain, {
        CancelAuthorization: [
          { name: "authorizer", type: "address" },
          { name: "nonce", type: "bytes32" },
        ],
      }, { authorizer: fx.alice.address, nonce: signed.stakeAuth.nonce }));
      await fx.usdcToken.connect(fx.relayer).cancelAuthorization(fx.alice.address, signed.stakeAuth.nonce, cancelSig.v, cancelSig.r, cancelSig.s);

      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.usdcToken, "AuthorizationUsed");
    });
  });

  describe("facet wiring", function () {
    it("intent selectors revert cleanly when no extension is set", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.reg.connect(fx.admin).setIntentExtension(ethers.ZeroAddress);
      const signed = await signCreate(fx, fx.alice);
      await expect(
        fx.reg.connect(fx.relayer).createWagerWithAuthorization(
          signed.args, fx.alice.address, signed.intent.nonce, signed.intent.validAfter, signed.intent.validBefore, signed.sig, signed.stakeAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.reg, "UnknownFunction");
    });

    it("setIntentExtension is UPGRADER_ROLE-gated", async function () {
      const fx = await loadFixture(deployFixture);
      await expect(fx.reg.connect(fx.alice).setIntentExtension(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(fx.reg, "AccessControlUnauthorizedAccount");
    });
  });
});
