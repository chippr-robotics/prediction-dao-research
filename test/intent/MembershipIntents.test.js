const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployMembershipManager } = require("../helpers/proxy");

// Spec 035 — signer-attributed (gasless) membership intents: purchase/upgrade/extend via a single
// signature carrying an EIP-3009 price authorization, and voucher redemption via …WithSig. Also
// covers the SignerIntentBase cross-contract isolation invariant (a nonce/signature is scoped to
// one contract's EIP-712 domain).

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
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

const PURCHASE_TIER_INTENT_TYPES = {
  PurchaseTierIntent: [
    { name: "role", type: "bytes32" },
    { name: "tier", type: "uint8" },
    { name: "acceptedTermsHash", type: "bytes32" },
    { name: "member", type: "address" },
    { name: "paymentNonce", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
};

const UPGRADE_TIER_INTENT_TYPES = {
  UpgradeTierIntent: [
    { name: "role", type: "bytes32" },
    { name: "tier", type: "uint8" },
    { name: "acceptedTermsHash", type: "bytes32" },
    { name: "member", type: "address" },
    { name: "paymentNonce", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
};

const EXTEND_MEMBERSHIP_INTENT_TYPES = {
  ExtendMembershipIntent: [
    { name: "role", type: "bytes32" },
    { name: "member", type: "address" },
    { name: "paymentNonce", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
};

const REDEEM_VOUCHER_INTENT_TYPES = {
  RedeemVoucherIntent: [
    { name: "voucherId", type: "uint256" },
    { name: "acceptedTermsHash", type: "bytes32" },
    { name: "redeemer", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
};

const EMPTY_AUTH = { value: 0, validAfter: 0, validBefore: 0, nonce: ethers.ZeroHash, v: 0, r: ethers.ZeroHash, s: ethers.ZeroHash };

describe("MembershipManager signer-attributed intents (spec 035)", function () {
  async function deployFixture() {
    const [admin, alice, bob, relayer, treasury, feeSink] = await ethers.getSigners();

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
    await mgr.connect(admin).setSanctionsGuard(await guard.getAddress());

    for (const u of [alice, bob]) {
      await usdcToken.mint(u.address, usdc(10_000));
      // Deliberately NO approvals — the gasless paths must not need one.
    }

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const mgrDomain = {
      name: "FairWins MembershipManager",
      version: "1",
      chainId,
      verifyingContract: await mgr.getAddress(),
    };
    const tokenDomain = {
      name: "USD Coin",
      version: "1",
      chainId,
      verifyingContract: await usdcToken.getAddress(),
    };

    return { mgr, usdcToken, guard, admin, alice, bob, relayer, treasury, feeSink, mgrDomain, tokenDomain, chainId };
  }

  async function signPriceAuth(fx, signer, value, to) {
    const now = await time.latest();
    const message = {
      from: signer.address,
      to: to ?? (await fx.mgr.getAddress()),
      value,
      validAfter: 0,
      validBefore: now + 3600,
      nonce: randomNonce(),
    };
    const sig = ethers.Signature.from(await signer.signTypedData(fx.tokenDomain, RECEIVE_WITH_AUTHORIZATION_TYPES, message));
    return { value: message.value, validAfter: message.validAfter, validBefore: message.validBefore, nonce: message.nonce, v: sig.v, r: sig.r, s: sig.s };
  }

  async function signPurchase(fx, signer, { tier = Tier.Bronze, price = usdc(50), termsHash = ethers.id("terms-v1") } = {}) {
    const now = await time.latest();
    const priceAuth = await signPriceAuth(fx, signer, price);
    const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600 };
    const sig = await signer.signTypedData(fx.mgrDomain, PURCHASE_TIER_INTENT_TYPES, {
      role: WAGER_PARTICIPANT_ROLE,
      tier,
      acceptedTermsHash: termsHash,
      member: signer.address,
      paymentNonce: priceAuth.nonce,
      ...intent,
    });
    return { tier, termsHash, priceAuth, intent, sig };
  }

  describe("purchaseTierWithAuthorization", function () {
    it("purchases the tier for the signer with one signature, no approval, no native gas (SC-002)", async function () {
      const fx = await loadFixture(deployFixture);
      const p = await signPurchase(fx, fx.alice);
      await expect(
        fx.mgr.connect(fx.relayer).purchaseTierWithAuthorization(
          WAGER_PARTICIPANT_ROLE, p.tier, p.termsHash, fx.alice.address,
          p.intent.nonce, p.intent.validAfter, p.intent.validBefore, p.sig, p.priceAuth, EMPTY_AUTH
        )
      ).to.emit(fx.mgr, "MembershipPurchased");

      expect(await fx.mgr.hasActiveRole(fx.alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(true);
      expect(await fx.mgr.getActiveTier(fx.alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(Tier.Bronze);
      // Terms recorded for the SIGNER (FR-039)
      expect(await fx.mgr.memberTermsHash(fx.alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(p.termsHash);
    });

    it("rejects replay and a substituted price authorization", async function () {
      const fx = await loadFixture(deployFixture);
      const p = await signPurchase(fx, fx.alice);
      const submit = (auth) =>
        fx.mgr.connect(fx.relayer).purchaseTierWithAuthorization(
          WAGER_PARTICIPANT_ROLE, p.tier, p.termsHash, fx.alice.address,
          p.intent.nonce, p.intent.validAfter, p.intent.validBefore, p.sig, auth, EMPTY_AUTH
        );

      const otherAuth = await signPriceAuth(fx, fx.alice, usdc(50));
      // Substituted auth: its nonce differs from the signed paymentNonce → the digest no longer matches
      await expect(submit(otherAuth)).to.be.revertedWithCustomError(fx.mgr, "InvalidIntentSignature");

      await submit(p.priceAuth);
      await expect(submit(p.priceAuth)).to.be.revertedWithCustomError(fx.mgr, "IntentReplayed");
    });

    it("screens the signer fail-closed", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.guard.connect(fx.admin).setDenied(fx.alice.address, true, "ofac");
      const p = await signPurchase(fx, fx.alice);
      await expect(
        fx.mgr.connect(fx.relayer).purchaseTierWithAuthorization(
          WAGER_PARTICIPANT_ROLE, p.tier, p.termsHash, fx.alice.address,
          p.intent.nonce, p.intent.validAfter, p.intent.validBefore, p.sig, p.priceAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.guard, "SanctionedAddress").withArgs(fx.alice.address);
    });

    it("settles the bounded fee leg to the segregated recipient when netting is enabled", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.mgr.connect(fx.admin).setFeeNetting(true, fx.feeSink.address, usdc(1));
      const p = await signPurchase(fx, fx.alice);
      const feeAuth = await signPriceAuth(fx, fx.alice, usdc(1) / 4n);
      await fx.mgr.connect(fx.relayer).purchaseTierWithAuthorization(
        WAGER_PARTICIPANT_ROLE, p.tier, p.termsHash, fx.alice.address,
        p.intent.nonce, p.intent.validAfter, p.intent.validBefore, p.sig, p.priceAuth, feeAuth
      );
      expect(await fx.usdcToken.balanceOf(fx.feeSink.address)).to.equal(usdc(1) / 4n);
    });
  });

  describe("upgradeTierWithAuthorization / extendMembershipWithAuthorization", function () {
    async function bronzeMember(fx, user) {
      const p = await signPurchase(fx, user);
      await fx.mgr.connect(fx.relayer).purchaseTierWithAuthorization(
        WAGER_PARTICIPANT_ROLE, p.tier, p.termsHash, user.address,
        p.intent.nonce, p.intent.validAfter, p.intent.validBefore, p.sig, p.priceAuth, EMPTY_AUTH
      );
    }

    it("upgrades to Silver pulling exactly the on-chain delta from the signer", async function () {
      const fx = await loadFixture(deployFixture);
      await bronzeMember(fx, fx.alice);
      const now = await time.latest();

      const priceAuth = await signPriceAuth(fx, fx.alice, usdc(70)); // 120 - 50 delta
      const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600 };
      const sig = await fx.alice.signTypedData(fx.mgrDomain, UPGRADE_TIER_INTENT_TYPES, {
        role: WAGER_PARTICIPANT_ROLE, tier: Tier.Silver, acceptedTermsHash: ethers.id("terms-v1"),
        member: fx.alice.address, paymentNonce: priceAuth.nonce, ...intent,
      });

      await expect(
        fx.mgr.connect(fx.relayer).upgradeTierWithAuthorization(
          WAGER_PARTICIPANT_ROLE, Tier.Silver, ethers.id("terms-v1"), fx.alice.address,
          intent.nonce, intent.validAfter, intent.validBefore, sig, priceAuth, EMPTY_AUTH
        )
      ).to.emit(fx.mgr, "MembershipUpgraded");
      expect(await fx.mgr.getActiveTier(fx.alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(Tier.Silver);
    });

    it("rejects an authorization that does not equal the on-chain delta (PaymentAuthMismatch)", async function () {
      const fx = await loadFixture(deployFixture);
      await bronzeMember(fx, fx.alice);
      const now = await time.latest();

      const priceAuth = await signPriceAuth(fx, fx.alice, usdc(60)); // wrong delta
      const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600 };
      const sig = await fx.alice.signTypedData(fx.mgrDomain, UPGRADE_TIER_INTENT_TYPES, {
        role: WAGER_PARTICIPANT_ROLE, tier: Tier.Silver, acceptedTermsHash: ethers.ZeroHash,
        member: fx.alice.address, paymentNonce: priceAuth.nonce, ...intent,
      });
      await expect(
        fx.mgr.connect(fx.relayer).upgradeTierWithAuthorization(
          WAGER_PARTICIPANT_ROLE, Tier.Silver, ethers.ZeroHash, fx.alice.address,
          intent.nonce, intent.validAfter, intent.validBefore, sig, priceAuth, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(fx.mgr, "PaymentAuthMismatch");
    });

    it("extends membership from the signer's authorization", async function () {
      const fx = await loadFixture(deployFixture);
      await bronzeMember(fx, fx.alice);
      const before = (await fx.mgr.getMembership(fx.alice.address, WAGER_PARTICIPANT_ROLE)).expiresAt;
      const now = await time.latest();

      const priceAuth = await signPriceAuth(fx, fx.alice, usdc(50));
      const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600 };
      const sig = await fx.alice.signTypedData(fx.mgrDomain, EXTEND_MEMBERSHIP_INTENT_TYPES, {
        role: WAGER_PARTICIPANT_ROLE, member: fx.alice.address, paymentNonce: priceAuth.nonce, ...intent,
      });
      await expect(
        fx.mgr.connect(fx.relayer).extendMembershipWithAuthorization(
          WAGER_PARTICIPANT_ROLE, fx.alice.address, intent.nonce, intent.validAfter, intent.validBefore, sig, priceAuth, EMPTY_AUTH
        )
      ).to.emit(fx.mgr, "MembershipExtended");
      const after = (await fx.mgr.getMembership(fx.alice.address, WAGER_PARTICIPANT_ROLE)).expiresAt;
      expect(after).to.equal(before + 30n * 86400n);
    });
  });

  describe("redeemVoucherWithSig", function () {
    async function voucherFixture() {
      const fx = await deployFixture();
      const Voucher = await ethers.getContractFactory("MembershipVoucher");
      const voucher = await Voucher.deploy(fx.admin.address, await fx.mgr.getAddress());
      await voucher.waitForDeployment();
      await fx.mgr.connect(fx.admin).setVoucher(await voucher.getAddress());
      return { ...fx, voucher };
    }

    it("redeems attributed to the signing voucher owner (no money leg)", async function () {
      const fx = await voucherFixture();
      // bob buys a voucher (self-submit mint path) and gifts it to alice
      await fx.usdcToken.connect(fx.bob).approve(await fx.voucher.getAddress(), ethers.MaxUint256);
      const tx = await fx.voucher.connect(fx.bob).mint(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
      const receipt = await tx.wait();
      const ev = receipt.logs.map((l) => { try { return fx.voucher.interface.parseLog(l); } catch { return null; } })
        .find((p) => p && p.name === "VoucherMinted");
      const voucherId = ev.args[0];
      await fx.voucher.connect(fx.bob).transferFrom(fx.bob.address, fx.alice.address, voucherId);

      const now = await time.latest();
      const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600 };
      const termsHash = ethers.id("terms-v1");
      const sig = await fx.alice.signTypedData(fx.mgrDomain, REDEEM_VOUCHER_INTENT_TYPES, {
        voucherId, acceptedTermsHash: termsHash, redeemer: fx.alice.address, ...intent,
      });

      await expect(
        fx.mgr.connect(fx.relayer).redeemVoucherWithSig(voucherId, termsHash, fx.alice.address, intent.nonce, intent.validAfter, intent.validBefore, sig)
      ).to.emit(fx.mgr, "MembershipRedeemed");
      expect(await fx.mgr.hasActiveRole(fx.alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(true);
    });

    it("rejects a signer who does not own the voucher", async function () {
      const fx = await voucherFixture();
      await fx.usdcToken.connect(fx.bob).approve(await fx.voucher.getAddress(), ethers.MaxUint256);
      const tx = await fx.voucher.connect(fx.bob).mint(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
      const receipt = await tx.wait();
      const ev = receipt.logs.map((l) => { try { return fx.voucher.interface.parseLog(l); } catch { return null; } })
        .find((p) => p && p.name === "VoucherMinted");
      const voucherId = ev.args[0];
      await fx.voucher.connect(fx.bob).transferFrom(fx.bob.address, fx.alice.address, voucherId);

      const now = await time.latest();
      const intent = { nonce: randomNonce(), validAfter: 0, validBefore: now + 3600 };
      const sig = await fx.bob.signTypedData(fx.mgrDomain, REDEEM_VOUCHER_INTENT_TYPES, {
        voucherId, acceptedTermsHash: ethers.ZeroHash, redeemer: fx.bob.address, ...intent,
      });
      await expect(
        fx.mgr.connect(fx.relayer).redeemVoucherWithSig(voucherId, ethers.ZeroHash, fx.bob.address, intent.nonce, intent.validAfter, intent.validBefore, sig)
      ).to.be.revertedWithCustomError(fx.mgr, "NotVoucherOwner");
    });
  });

  describe("cross-contract isolation (FR-005/FR-021)", function () {
    it("the same nonce is independent per contract, and a signature for one contract is invalid on another", async function () {
      const fx = await loadFixture(deployFixture);

      // Deploy a SECOND MembershipManager — same code, different address ⇒ different domain.
      const mgr2 = await deployMembershipManager([fx.admin.address, await fx.usdcToken.getAddress(), fx.treasury.address]);
      const limits = { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 };
      await mgr2.connect(fx.admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, limits, true);

      const p = await signPurchase(fx, fx.alice);
      // Same signed payload replayed against mgr2: the domain separator differs → bad signature.
      const priceAuth2 = await signPriceAuth(fx, fx.alice, usdc(50), await mgr2.getAddress());
      await expect(
        mgr2.connect(fx.relayer).purchaseTierWithAuthorization(
          WAGER_PARTICIPANT_ROLE, p.tier, p.termsHash, fx.alice.address,
          p.intent.nonce, p.intent.validAfter, p.intent.validBefore, p.sig, priceAuth2, EMPTY_AUTH
        )
      ).to.be.revertedWithCustomError(mgr2, "InvalidIntentSignature");

      // The nonce consumed on mgr is still unused on mgr2 (per-contract nonce space).
      await fx.mgr.connect(fx.relayer).purchaseTierWithAuthorization(
        WAGER_PARTICIPANT_ROLE, p.tier, p.termsHash, fx.alice.address,
        p.intent.nonce, p.intent.validAfter, p.intent.validBefore, p.sig, p.priceAuth, EMPTY_AUTH
      );
      expect(await fx.mgr.authorizationState(fx.alice.address, p.intent.nonce)).to.equal(true);
      expect(await mgr2.authorizationState(fx.alice.address, p.intent.nonce)).to.equal(false);

      expect(await fx.mgr.DOMAIN_SEPARATOR()).to.not.equal(await mgr2.DOMAIN_SEPARATOR());
    });
  });
});
