const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const FRIEND_MARKET_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FRIEND_MARKET_ROLE"));

// Prices in 6-decimal USDC units
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("MembershipManager", function () {
  async function deployFixture() {
    const [admin, alice, bob, treasury, caller] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("USD Coin", "USDC", 0);
    await token.waitForDeployment();

    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    const mgr = await MembershipManager.deploy(admin.address, await token.getAddress(), treasury.address);
    await mgr.waitForDeployment();

    // Seed test tiers for FRIEND_MARKET_ROLE
    const tierConfigs = [
      { tier: Tier.Bronze,   price: usdc(50),  days_: 30, monthly: 15,  concurrent: 5  },
      { tier: Tier.Silver,   price: usdc(100), days_: 30, monthly: 30,  concurrent: 10 },
      { tier: Tier.Gold,     price: usdc(200), days_: 30, monthly: 100, concurrent: 30 },
      { tier: Tier.Platinum, price: usdc(400), days_: 30, monthly: 0,   concurrent: 0  }, // 0 = unlimited
    ];
    for (const c of tierConfigs) {
      await mgr.connect(admin).setTier(
        FRIEND_MARKET_ROLE,
        c.tier,
        c.price,
        c.days_,
        { monthlyMarketCreation: c.monthly, maxConcurrentMarkets: c.concurrent },
        true
      );
    }
    await mgr.connect(admin).setAuthorizedCaller(caller.address, true);

    // Mint and approve USDC for alice & bob
    for (const u of [alice, bob]) {
      await token.mint(u.address, usdc(10_000));
      await token.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
    }

    return { mgr, token, admin, alice, bob, treasury, caller };
  }

  describe("purchaseTier", () => {
    it("pulls correct USDC and sets expiry / activates membership", async () => {
      const { mgr, token, alice } = await loadFixture(deployFixture);
      const balBefore = await token.balanceOf(alice.address);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
      const balAfter = await token.balanceOf(alice.address);
      expect(balBefore - balAfter).to.equal(usdc(50));

      const m = await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE);
      expect(m.tier).to.equal(Tier.Bronze);
      expect(m.expiresAt).to.be.gt(0);
      expect(await mgr.hasActiveRole(alice.address, FRIEND_MARKET_ROLE)).to.be.true;
      expect(await mgr.accruedFees()).to.equal(usdc(50));
    });

    it("rejects double-purchase while active", async () => {
      const { mgr, alice } = await loadFixture(deployFixture);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
      await expect(mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Silver))
        .to.be.revertedWithCustomError(mgr, "AlreadyActive");
    });

    it("allows fresh purchase after expiry", async () => {
      const { mgr, alice } = await loadFixture(deployFixture);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
      await time.increase(31 * 24 * 3600);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Silver);
      expect((await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE)).tier).to.equal(Tier.Silver);
    });

    it("reverts on inactive tier", async () => {
      const { mgr, admin, alice } = await loadFixture(deployFixture);
      await mgr.connect(admin).setTier(FRIEND_MARKET_ROLE, Tier.Bronze, usdc(50), 30, { monthlyMarketCreation: 15, maxConcurrentMarkets: 5 }, false);
      await expect(mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze))
        .to.be.revertedWithCustomError(mgr, "TierInactive");
    });

    it("rejects Tier.None", async () => {
      const { mgr, alice } = await loadFixture(deployFixture);
      await expect(mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.None))
        .to.be.revertedWithCustomError(mgr, "TierNone");
    });
  });

  describe("upgradeTier", () => {
    it("charges delta and updates tier", async () => {
      const { mgr, token, alice } = await loadFixture(deployFixture);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
      const balBefore = await token.balanceOf(alice.address);
      await mgr.connect(alice).upgradeTier(FRIEND_MARKET_ROLE, Tier.Gold);
      const balAfter = await token.balanceOf(alice.address);
      expect(balBefore - balAfter).to.equal(usdc(150)); // 200 - 50
      expect((await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE)).tier).to.equal(Tier.Gold);
    });

    it("rejects downgrade", async () => {
      const { mgr, alice } = await loadFixture(deployFixture);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Gold);
      await expect(mgr.connect(alice).upgradeTier(FRIEND_MARKET_ROLE, Tier.Bronze))
        .to.be.revertedWithCustomError(mgr, "NotUpgrade");
    });

    it("rejects upgrade with no active membership", async () => {
      const { mgr, alice } = await loadFixture(deployFixture);
      await expect(mgr.connect(alice).upgradeTier(FRIEND_MARKET_ROLE, Tier.Gold))
        .to.be.revertedWithCustomError(mgr, "NoActiveMembership");
    });
  });

  describe("extendMembership", () => {
    it("charges current tier price and bumps expiry", async () => {
      const { mgr, token, alice } = await loadFixture(deployFixture);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
      const expiry1 = (await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE)).expiresAt;
      const balBefore = await token.balanceOf(alice.address);
      await mgr.connect(alice).extendMembership(FRIEND_MARKET_ROLE);
      const balAfter = await token.balanceOf(alice.address);
      expect(balBefore - balAfter).to.equal(usdc(50));
      const expiry2 = (await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE)).expiresAt;
      expect(expiry2).to.equal(expiry1 + BigInt(30 * 24 * 3600));
    });

    it("uses current price after admin update", async () => {
      const { mgr, admin, alice, token } = await loadFixture(deployFixture);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
      // admin doubles price
      await mgr.connect(admin).setTier(FRIEND_MARKET_ROLE, Tier.Bronze, usdc(100), 30, { monthlyMarketCreation: 15, maxConcurrentMarkets: 5 }, true);
      const balBefore = await token.balanceOf(alice.address);
      await mgr.connect(alice).extendMembership(FRIEND_MARKET_ROLE);
      expect(balBefore - await token.balanceOf(alice.address)).to.equal(usdc(100));
    });
  });

  describe("admin", () => {
    it("only owner can setTier", async () => {
      const { mgr, alice } = await loadFixture(deployFixture);
      await expect(
        mgr.connect(alice).setTier(FRIEND_MARKET_ROLE, Tier.Bronze, usdc(50), 30, { monthlyMarketCreation: 15, maxConcurrentMarkets: 5 }, true)
      ).to.be.revertedWithCustomError(mgr, "OwnableUnauthorizedAccount");
    });

    it("grantTierAdmin sets membership without payment", async () => {
      const { mgr, admin, alice } = await loadFixture(deployFixture);
      await mgr.connect(admin).grantTierAdmin(alice.address, FRIEND_MARKET_ROLE, Tier.Gold, 60);
      const m = await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE);
      expect(m.tier).to.equal(Tier.Gold);
    });

    it("withdrawFees transfers USDC and decrements accruedFees", async () => {
      const { mgr, token, admin, alice, treasury } = await loadFixture(deployFixture);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
      const balBefore = await token.balanceOf(treasury.address);
      await mgr.connect(admin).withdrawFees(usdc(50), treasury.address);
      expect(await token.balanceOf(treasury.address) - balBefore).to.equal(usdc(50));
      expect(await mgr.accruedFees()).to.equal(0);
    });
  });

  describe("limits enforcement (recordCreate/recordClose)", () => {
    async function activate(mgr, user, tier) {
      await mgr.connect(user).purchaseTier(FRIEND_MARKET_ROLE, tier);
    }

    it("recordCreate from non-authorized caller reverts", async () => {
      const { mgr, alice } = await loadFixture(deployFixture);
      await activate(mgr, alice, Tier.Bronze);
      await expect(mgr.connect(alice).recordCreate(alice.address, FRIEND_MARKET_ROLE))
        .to.be.revertedWithCustomError(mgr, "NotAuthorized");
    });

    it("monthly limit: 15th create succeeds, 16th reverts", async () => {
      const { mgr, alice, caller } = await loadFixture(deployFixture);
      await activate(mgr, alice, Tier.Bronze); // monthly=15
      for (let i = 0; i < 15; i++) {
        await mgr.connect(caller).recordCreate(alice.address, FRIEND_MARKET_ROLE);
        await mgr.connect(caller).recordClose(alice.address, FRIEND_MARKET_ROLE);
      }
      await expect(mgr.connect(caller).recordCreate(alice.address, FRIEND_MARKET_ROLE))
        .to.be.revertedWithCustomError(mgr, "MonthlyLimitReached");
    });

    it("concurrent limit: 5 active succeed, 6th reverts; close frees slot", async () => {
      const { mgr, alice, caller } = await loadFixture(deployFixture);
      await activate(mgr, alice, Tier.Bronze); // concurrent=5
      for (let i = 0; i < 5; i++) await mgr.connect(caller).recordCreate(alice.address, FRIEND_MARKET_ROLE);
      await expect(mgr.connect(caller).recordCreate(alice.address, FRIEND_MARKET_ROLE))
        .to.be.revertedWithCustomError(mgr, "ConcurrentLimitReached");
      await mgr.connect(caller).recordClose(alice.address, FRIEND_MARKET_ROLE);
      await mgr.connect(caller).recordCreate(alice.address, FRIEND_MARKET_ROLE); // now ok
    });

    it("rolling 30d window resets on next create", async () => {
      const { mgr, alice, caller } = await loadFixture(deployFixture);
      await activate(mgr, alice, Tier.Bronze);
      for (let i = 0; i < 15; i++) {
        await mgr.connect(caller).recordCreate(alice.address, FRIEND_MARKET_ROLE);
        await mgr.connect(caller).recordClose(alice.address, FRIEND_MARKET_ROLE);
      }
      // Membership expires after 30 days, so re-purchase first
      await time.increase(31 * 24 * 3600);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
      // After re-purchase counters reset; should be able to create again
      await mgr.connect(caller).recordCreate(alice.address, FRIEND_MARKET_ROLE);
      const m = await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE);
      expect(m.monthCount).to.equal(1);
    });

    it("Platinum (limit=0) is unlimited", async () => {
      const { mgr, alice, caller } = await loadFixture(deployFixture);
      await activate(mgr, alice, Tier.Platinum); // both limits=0 → unlimited
      for (let i = 0; i < 50; i++) {
        await mgr.connect(caller).recordCreate(alice.address, FRIEND_MARKET_ROLE);
      }
      const m = await mgr.getMembership(alice.address, FRIEND_MARKET_ROLE);
      expect(m.monthCount).to.equal(50);
      expect(m.activeCount).to.equal(50);
    });

    it("checkCanCreate matches recordCreate enforcement", async () => {
      const { mgr, alice, caller } = await loadFixture(deployFixture);
      await activate(mgr, alice, Tier.Bronze);
      expect(await mgr.checkCanCreate(alice.address, FRIEND_MARKET_ROLE)).to.be.true;
      for (let i = 0; i < 5; i++) await mgr.connect(caller).recordCreate(alice.address, FRIEND_MARKET_ROLE);
      expect(await mgr.checkCanCreate(alice.address, FRIEND_MARKET_ROLE)).to.be.false;
    });

    it("checkCanCreate returns false for expired membership", async () => {
      const { mgr, alice } = await loadFixture(deployFixture);
      await mgr.connect(alice).purchaseTier(FRIEND_MARKET_ROLE, Tier.Bronze);
      await time.increase(31 * 24 * 3600);
      expect(await mgr.checkCanCreate(alice.address, FRIEND_MARKET_ROLE)).to.be.false;
    });
  });
});
