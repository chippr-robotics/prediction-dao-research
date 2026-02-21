const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Resolution type enum (matches contract)
const ResolutionType = {
  Either: 0,
  Initiator: 1,
  Receiver: 2,
  ThirdParty: 3,
  AutoPegged: 4,
  PolymarketOracle: 5
};

// Market status enum (matches contract)
const FriendMarketStatus = {
  PendingAcceptance: 0,
  Active: 1,
  PendingResolution: 2,
  Challenged: 3,
  Resolved: 4,
  Cancelled: 5,
  Refunded: 6
};

describe("FriendGroupMarketFactory - Claim Timeout", function () {
  let friendGroupFactory;
  let marketFactory;
  let ragequitModule;
  let tieredRoleManager;
  let paymentManager;
  let collateralToken;
  let stakeToken;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let treasury;

  const FRIEND_MARKET_ROLE = ethers.id("FRIEND_MARKET_ROLE");
  const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

  const ONE_DAY = 86400;
  const NINETY_DAYS = 90 * ONE_DAY;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, treasury] = await ethers.getSigners();

    // Deploy CTF1155
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    const ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // Deploy mock collateral token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
    await collateralToken.waitForDeployment();

    // Deploy a stake token for ERC20 tests
    stakeToken = await MockERC20.deploy("Stake Token", "STK", ethers.parseEther("10000000"));
    await stakeToken.waitForDeployment();

    // Deploy ConditionalMarketFactory
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);
    await marketFactory.setCTF1155(await ctf1155.getAddress());

    // Deploy RagequitModule
    const RagequitModule = await ethers.getContractFactory("RagequitModule");
    ragequitModule = await RagequitModule.deploy();

    // Deploy TieredRoleManager
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    tieredRoleManager = await TieredRoleManager.deploy();
    await tieredRoleManager.waitForDeployment();
    await tieredRoleManager.initializeRoleMetadata();

    // Set up Friend Market tier
    await tieredRoleManager.setTierMetadata(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      "Friend Market Bronze",
      "Basic friend market tier",
      ethers.parseEther("0.1"),
      {
        dailyBetLimit: 10,
        weeklyBetLimit: 50,
        monthlyMarketCreation: 5,
        maxPositionSize: ethers.parseEther("10"),
        maxConcurrentMarkets: 3,
        withdrawalLimit: ethers.parseEther("100"),
        canCreatePrivateMarkets: false,
        canUseAdvancedFeatures: false,
        feeDiscount: 0
      },
      true
    );

    const tierMeta = await tieredRoleManager.tierMetadata(FRIEND_MARKET_ROLE, MembershipTier.BRONZE);
    const price = tierMeta.price;

    // Deploy MembershipPaymentManager
    const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
    paymentManager = await MembershipPaymentManager.deploy(owner.address);
    await paymentManager.waitForDeployment();

    // Deploy FriendGroupMarketFactory
    const FriendGroupMarketFactory = await ethers.getContractFactory("FriendGroupMarketFactory");
    friendGroupFactory = await FriendGroupMarketFactory.deploy(
      await marketFactory.getAddress(),
      await ragequitModule.getAddress(),
      await tieredRoleManager.getAddress(),
      await paymentManager.getAddress(),
      owner.address
    );

    await friendGroupFactory.setDefaultCollateralToken(await collateralToken.getAddress());
    await friendGroupFactory.addAcceptedPaymentToken(await stakeToken.getAddress(), true);

    // Set treasury
    await friendGroupFactory.setTreasury(treasury.address);

    // Purchase memberships
    const durDays = 36500;
    for (const signer of [owner, addr1, addr2, addr3]) {
      await tieredRoleManager.connect(signer).purchaseRoleWithTier(
        FRIEND_MARKET_ROLE,
        MembershipTier.BRONZE,
        durDays,
        { value: price }
      );
    }

    await marketFactory.transferOwnership(await friendGroupFactory.getAddress());

    // Distribute stake tokens
    await stakeToken.transfer(addr1.address, ethers.parseEther("1000"));
    await stakeToken.transfer(addr2.address, ethers.parseEther("1000"));
  });

  async function acceptMarket(marketId, participant) {
    const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(marketId);
    const stakeAmount = marketWithStatus.stakePerParticipant;
    const stakeTokenAddr = marketWithStatus.stakeToken;

    if (stakeTokenAddr === ethers.ZeroAddress) {
      await friendGroupFactory.connect(participant).acceptMarket(marketId, { value: stakeAmount });
    } else {
      const token = await ethers.getContractAt("MockERC20", stakeTokenAddr);
      await token.connect(participant).approve(await friendGroupFactory.getAddress(), stakeAmount);
      await friendGroupFactory.connect(participant).acceptMarket(marketId);
    }
  }

  async function createAndActivateNativeMarket() {
    const stakeAmount = ethers.parseEther("0.5");
    const latestBlock = await ethers.provider.getBlock('latest');
    const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);

    await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
      addr2.address,
      "Test bet",
      7 * 24 * 60 * 60,
      ethers.ZeroAddress,
      acceptanceDeadline,
      stakeAmount,
      ethers.ZeroAddress,
      ResolutionType.Either,
      { value: stakeAmount }
    );

    await acceptMarket(0, addr2);
    return 0;
  }

  async function createAndActivateERC20Market() {
    const stakeAmount = ethers.parseEther("100");
    const latestBlock = await ethers.provider.getBlock('latest');
    const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);

    await stakeToken.connect(addr1).approve(await friendGroupFactory.getAddress(), stakeAmount);

    await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
      addr2.address,
      "ERC20 bet",
      7 * 24 * 60 * 60,
      ethers.ZeroAddress,
      acceptanceDeadline,
      stakeAmount,
      await stakeToken.getAddress(),
      ResolutionType.Either
    );

    await acceptMarket(0, addr2);
    return 0;
  }

  async function resolveAndFinalizeMarket(marketId, resolver, outcome) {
    await friendGroupFactory.connect(resolver).resolveFriendMarket(marketId, outcome);
    await time.increase(ONE_DAY + 1);
    await friendGroupFactory.finalizeResolution(marketId);
  }

  describe("Sweep Unclaimed Funds - Native Token", function () {
    it("Should allow sweep after claim timeout expires", async function () {
      await createAndActivateNativeMarket();
      const stakeAmount = ethers.parseEther("0.5");
      const totalPot = stakeAmount * 2n;

      // Resolve market
      await resolveAndFinalizeMarket(0, addr1, true);

      // Fast forward past claim timeout (90 days)
      await time.increase(NINETY_DAYS + 1);

      // Get treasury balance before
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);

      // Anyone can sweep
      const tx = await friendGroupFactory.connect(addr3).sweepUnclaimedFunds(0);

      // Verify treasury received funds
      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryBalanceAfter).to.equal(treasuryBalanceBefore + totalPot);

      // Verify event
      await expect(tx)
        .to.emit(friendGroupFactory, "UnclaimedFundsSwept")
        .withArgs(0, totalPot, ethers.ZeroAddress, treasury.address);

      // Verify marked as claimed
      expect(await friendGroupFactory.isWagerClaimed(0)).to.equal(true);
    });

    it("Should reject sweep before timeout expires", async function () {
      await createAndActivateNativeMarket();
      await resolveAndFinalizeMarket(0, addr1, true);

      // Only 30 days have passed (not 90)
      await time.increase(30 * ONE_DAY);

      await expect(
        friendGroupFactory.connect(addr3).sweepUnclaimedFunds(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "ClaimTimeoutNotExpired");
    });

    it("Should reject sweep if already claimed by winner", async function () {
      await createAndActivateNativeMarket();
      await resolveAndFinalizeMarket(0, addr1, true);

      // Winner claims
      await friendGroupFactory.connect(addr1).claimWinnings(0);

      // Fast forward past timeout
      await time.increase(NINETY_DAYS + 1);

      await expect(
        friendGroupFactory.connect(addr3).sweepUnclaimedFunds(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "AlreadyClaimed");
    });

    it("Should reject sweep if market not resolved", async function () {
      await createAndActivateNativeMarket();

      await time.increase(NINETY_DAYS + 1);

      await expect(
        friendGroupFactory.connect(addr3).sweepUnclaimedFunds(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "WagerNotResolved");
    });

    it("Should reject sweep if treasury not set", async function () {
      // Deploy a new factory without treasury set
      const FriendGroupMarketFactory = await ethers.getContractFactory("FriendGroupMarketFactory");
      const newFactory = await FriendGroupMarketFactory.deploy(
        await marketFactory.getAddress(),
        await ragequitModule.getAddress(),
        await tieredRoleManager.getAddress(),
        await paymentManager.getAddress(),
        owner.address
      );

      // Treasury check happens before market ID check, so this should fail with TreasuryNotSet
      await expect(
        newFactory.sweepUnclaimedFunds(0)
      ).to.be.revertedWithCustomError(newFactory, "TreasuryNotSet");
    });
  });

  describe("Sweep Unclaimed Funds - ERC20 Token", function () {
    it("Should sweep ERC20 tokens to treasury", async function () {
      await createAndActivateERC20Market();
      const stakeAmount = ethers.parseEther("100");
      const totalPot = stakeAmount * 2n;

      await resolveAndFinalizeMarket(0, addr1, true);

      await time.increase(NINETY_DAYS + 1);

      const treasuryBalanceBefore = await stakeToken.balanceOf(treasury.address);

      const tx = await friendGroupFactory.sweepUnclaimedFunds(0);

      const treasuryBalanceAfter = await stakeToken.balanceOf(treasury.address);
      expect(treasuryBalanceAfter).to.equal(treasuryBalanceBefore + totalPot);

      await expect(tx)
        .to.emit(friendGroupFactory, "UnclaimedFundsSwept")
        .withArgs(0, totalPot, await stakeToken.getAddress(), treasury.address);
    });
  });

  describe("View Functions", function () {
    it("canSweepUnclaimedFunds should return false for unresolved market", async function () {
      await createAndActivateNativeMarket();

      const [canSweep, timeUntil] = await friendGroupFactory.canSweepUnclaimedFunds(0);
      expect(canSweep).to.equal(false);
      expect(timeUntil).to.equal(0);
    });

    it("canSweepUnclaimedFunds should return correct time remaining", async function () {
      await createAndActivateNativeMarket();
      await resolveAndFinalizeMarket(0, addr1, true);

      // Immediately after resolution
      let [canSweep, timeUntil] = await friendGroupFactory.canSweepUnclaimedFunds(0);
      expect(canSweep).to.equal(false);
      expect(timeUntil).to.be.closeTo(NINETY_DAYS, 5);

      // After 30 days
      await time.increase(30 * ONE_DAY);
      [canSweep, timeUntil] = await friendGroupFactory.canSweepUnclaimedFunds(0);
      expect(canSweep).to.equal(false);
      expect(timeUntil).to.be.closeTo(60 * ONE_DAY, 5);

      // After 90 days
      await time.increase(60 * ONE_DAY + 1);
      [canSweep, timeUntil] = await friendGroupFactory.canSweepUnclaimedFunds(0);
      expect(canSweep).to.equal(true);
      expect(timeUntil).to.equal(0);
    });

    it("canSweepUnclaimedFunds should return false if already claimed", async function () {
      await createAndActivateNativeMarket();
      await resolveAndFinalizeMarket(0, addr1, true);
      await friendGroupFactory.connect(addr1).claimWinnings(0);

      const [canSweep, timeUntil] = await friendGroupFactory.canSweepUnclaimedFunds(0);
      expect(canSweep).to.equal(false);
      expect(timeUntil).to.equal(0);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set treasury", async function () {
      const newTreasury = addr3.address;
      await expect(friendGroupFactory.setTreasury(newTreasury))
        .to.emit(friendGroupFactory, "TreasuryUpdated")
        .withArgs(treasury.address, newTreasury);

      expect(await friendGroupFactory.treasury()).to.equal(newTreasury);
    });

    it("Should reject setting zero address treasury", async function () {
      await expect(
        friendGroupFactory.setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidAddress");
    });

    it("Should allow owner to update claim timeout", async function () {
      const newTimeout = 30 * ONE_DAY; // 30 days
      await expect(friendGroupFactory.setClaimTimeout(newTimeout))
        .to.emit(friendGroupFactory, "ClaimTimeoutUpdated")
        .withArgs(NINETY_DAYS, newTimeout);

      expect(await friendGroupFactory.claimTimeout()).to.equal(newTimeout);
    });

    it("Should reject claim timeout less than 7 days", async function () {
      await expect(
        friendGroupFactory.setClaimTimeout(6 * ONE_DAY)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidClaimTimeout");
    });

    it("Should reject claim timeout more than 365 days", async function () {
      await expect(
        friendGroupFactory.setClaimTimeout(366 * ONE_DAY)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidClaimTimeout");
    });

    it("Should reject non-owner setting treasury", async function () {
      await expect(
        friendGroupFactory.connect(addr1).setTreasury(addr3.address)
      ).to.be.revertedWithCustomError(friendGroupFactory, "OwnableUnauthorizedAccount");
    });

    it("Should reject non-owner setting claim timeout", async function () {
      await expect(
        friendGroupFactory.connect(addr1).setClaimTimeout(30 * ONE_DAY)
      ).to.be.revertedWithCustomError(friendGroupFactory, "OwnableUnauthorizedAccount");
    });
  });

  describe("Integration - Winner Can Still Claim Within Timeout", function () {
    it("Winner can claim until the last second before timeout", async function () {
      await createAndActivateNativeMarket();
      const stakeAmount = ethers.parseEther("0.5");
      const totalPot = stakeAmount * 2n;

      await resolveAndFinalizeMarket(0, addr1, true);

      // Fast forward to just before timeout (89 days)
      await time.increase(NINETY_DAYS - 100);

      // Winner should still be able to claim
      const balanceBefore = await ethers.provider.getBalance(addr1.address);
      const tx = await friendGroupFactory.connect(addr1).claimWinnings(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(addr1.address);
      expect(balanceAfter).to.equal(balanceBefore + totalPot - gasCost);
    });

    it("Sweep and claim are mutually exclusive", async function () {
      await createAndActivateNativeMarket();
      await resolveAndFinalizeMarket(0, addr1, true);

      await time.increase(NINETY_DAYS + 1);

      // Sweep first
      await friendGroupFactory.connect(addr3).sweepUnclaimedFunds(0);

      // Winner cannot claim anymore
      await expect(
        friendGroupFactory.connect(addr1).claimWinnings(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "AlreadyClaimed");
    });
  });
});
