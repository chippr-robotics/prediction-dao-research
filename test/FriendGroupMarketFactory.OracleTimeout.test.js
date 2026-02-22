const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Resolution type enum
const ResolutionType = {
  Either: 0,
  Initiator: 1,
  Receiver: 2,
  ThirdParty: 3,
  AutoPegged: 4,
  PolymarketOracle: 5
};

// Market status enum
const FriendMarketStatus = {
  PendingAcceptance: 0,
  Active: 1,
  PendingResolution: 2,
  Challenged: 3,
  Resolved: 4,
  Cancelled: 5,
  Refunded: 6,
  OracleTimedOut: 7
};

describe("FriendGroupMarketFactory - Oracle Timeout", function () {
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
  let arbitrator;

  const FRIEND_MARKET_ROLE = ethers.id("FRIEND_MARKET_ROLE");
  const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

  const ONE_DAY = 86400;
  const THIRTY_DAYS = 30 * ONE_DAY;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, arbitrator] = await ethers.getSigners();

    // Deploy CTF1155
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    const ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // Deploy mock collateral token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
    await collateralToken.waitForDeployment();

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
    await friendGroupFactory.setTreasury(owner.address);

    // Purchase memberships
    const durDays = 36500;
    for (const signer of [owner, addr1, addr2, addr3, arbitrator]) {
      await tieredRoleManager.connect(signer).purchaseRoleWithTier(
        FRIEND_MARKET_ROLE,
        MembershipTier.BRONZE,
        durDays,
        { value: price }
      );
    }

    await marketFactory.transferOwnership(await friendGroupFactory.getAddress());

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

  // Create a market with PolymarketOracle resolution type (simulated)
  async function createOraclePeggedMarket(arbAddress = ethers.ZeroAddress) {
    const stakeAmount = ethers.parseEther("0.5");
    const latestBlock = await ethers.provider.getBlock('latest');
    const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);

    await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
      addr2.address,
      "Oracle pegged bet",
      7 * 24 * 60 * 60,
      arbAddress,
      acceptanceDeadline,
      stakeAmount,
      ethers.ZeroAddress,
      ResolutionType.PolymarketOracle,
      { value: stakeAmount }
    );

    await acceptMarket(0, addr2);
    if (arbAddress !== ethers.ZeroAddress) {
      await friendGroupFactory.connect(arbitrator).acceptMarket(0);
    }
    return 0;
  }

  describe("Set Expected Resolution Time", function () {
    it("Should allow creator to set expected resolution time", async function () {
      await createOraclePeggedMarket();
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;

      await expect(
        friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, expectedTime)
      ).to.emit(friendGroupFactory, "ExpectedResolutionTimeSet")
        .withArgs(0, expectedTime);

      expect(await friendGroupFactory.expectedResolutionTime(0)).to.equal(expectedTime);
    });

    it("Should reject non-creator setting expected time", async function () {
      await createOraclePeggedMarket();
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;

      await expect(
        friendGroupFactory.connect(addr2).setExpectedResolutionTime(0, expectedTime)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });

    it("Should reject setting expected time for non-oracle market", async function () {
      // Create a regular (Either resolution) market
      const stakeAmount = ethers.parseEther("0.5");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "Regular bet",
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );
      await acceptMarket(0, addr2);

      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;
      await expect(
        friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, expectedTime)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotOraclePegged");
    });

    it("Should reject past expected time", async function () {
      await createOraclePeggedMarket();
      const latestBlock = await ethers.provider.getBlock('latest');
      const pastTime = latestBlock.timestamp - 1;

      await expect(
        friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, pastTime)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidMarketId");
    });
  });

  describe("Trigger Oracle Timeout", function () {
    it("Should trigger timeout after expected + oracleTimeout period", async function () {
      await createOraclePeggedMarket();
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;

      await friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, expectedTime);

      // Fast forward past expected + 30 days (oracle timeout)
      await time.increase(7 * ONE_DAY + THIRTY_DAYS + 1);

      const tx = await friendGroupFactory.connect(addr3).triggerOracleTimeout(0);

      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.status).to.equal(FriendMarketStatus.OracleTimedOut);

      await expect(tx).to.emit(friendGroupFactory, "OracleTimeoutTriggered");
    });

    it("Should reject timeout before period expires", async function () {
      await createOraclePeggedMarket();
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;

      await friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, expectedTime);

      // Only fast forward 20 days (not past the 37 days total needed)
      await time.increase(20 * ONE_DAY);

      await expect(
        friendGroupFactory.triggerOracleTimeout(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "OracleTimeoutNotExpired");
    });

    it("Should reject timeout if expected time not set", async function () {
      await createOraclePeggedMarket();

      await time.increase(60 * ONE_DAY);

      await expect(
        friendGroupFactory.triggerOracleTimeout(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidMarketId");
    });
  });

  describe("Mutual Refund", function () {
    beforeEach(async function () {
      await createOraclePeggedMarket();
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;
      await friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, expectedTime);
      await time.increase(7 * ONE_DAY + THIRTY_DAYS + 1);
      await friendGroupFactory.triggerOracleTimeout(0);
    });

    it("Should allow both parties to accept refund", async function () {
      await expect(friendGroupFactory.connect(addr1).acceptMutualRefund(0))
        .to.emit(friendGroupFactory, "RefundAccepted")
        .withArgs(0, addr1.address);

      await expect(friendGroupFactory.connect(addr2).acceptMutualRefund(0))
        .to.emit(friendGroupFactory, "RefundAccepted")
        .withArgs(0, addr2.address);
    });

    it("Should complete refund when both accept", async function () {
      const stakeAmount = ethers.parseEther("0.5");

      const addr1BalanceBefore = await ethers.provider.getBalance(addr1.address);
      const addr2BalanceBefore = await ethers.provider.getBalance(addr2.address);

      // First acceptance
      const tx1 = await friendGroupFactory.connect(addr1).acceptMutualRefund(0);
      const receipt1 = await tx1.wait();
      const gas1 = receipt1.gasUsed * receipt1.gasPrice;

      // Second acceptance triggers refund
      const tx2 = await friendGroupFactory.connect(addr2).acceptMutualRefund(0);
      const receipt2 = await tx2.wait();
      const gas2 = receipt2.gasUsed * receipt2.gasPrice;

      await expect(tx2).to.emit(friendGroupFactory, "MutualRefundCompleted");

      // Check balances
      const addr1BalanceAfter = await ethers.provider.getBalance(addr1.address);
      const addr2BalanceAfter = await ethers.provider.getBalance(addr2.address);

      expect(addr1BalanceAfter).to.equal(addr1BalanceBefore + stakeAmount - gas1);
      expect(addr2BalanceAfter).to.equal(addr2BalanceBefore + stakeAmount - gas2);

      // Check market status
      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.status).to.equal(FriendMarketStatus.Refunded);
    });

    it("Should reject refund acceptance from non-participant", async function () {
      await expect(
        friendGroupFactory.connect(addr3).acceptMutualRefund(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });

    it("Should reject double acceptance", async function () {
      await friendGroupFactory.connect(addr1).acceptMutualRefund(0);

      await expect(
        friendGroupFactory.connect(addr1).acceptMutualRefund(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "RefundAlreadyAccepted");
    });

    it("Should reject refund acceptance if not timed out", async function () {
      // Create a new active market
      const stakeAmount = ethers.parseEther("0.5");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "New bet",
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.PolymarketOracle,
        { value: stakeAmount }
      );
      await acceptMarket(1, addr2);

      await expect(
        friendGroupFactory.connect(addr1).acceptMutualRefund(1)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotTimedOut");
    });
  });

  describe("Force Manual Resolution", function () {
    beforeEach(async function () {
      await createOraclePeggedMarket(arbitrator.address);
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;
      await friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, expectedTime);
      await time.increase(7 * ONE_DAY + THIRTY_DAYS + 1);
      await friendGroupFactory.triggerOracleTimeout(0);
    });

    it("Should allow arbitrator to force resolution", async function () {
      const tx = await friendGroupFactory.connect(arbitrator).forceOracleResolution(0, true);

      await expect(tx).to.emit(friendGroupFactory, "MarketResolved")
        .withArgs(0, arbitrator.address, true);

      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.status).to.equal(FriendMarketStatus.Resolved);

      const resolution = await friendGroupFactory.getWagerResolution(0);
      expect(resolution.winner).to.equal(addr1.address);
    });

    it("Should allow owner to force resolution when no arbitrator", async function () {
      // Create market without arbitrator
      const stakeAmount = ethers.parseEther("0.5");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "No arb bet",
        7 * 24 * 60 * 60,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.PolymarketOracle,
        { value: stakeAmount }
      );
      await acceptMarket(1, addr2);

      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;
      await friendGroupFactory.connect(addr1).setExpectedResolutionTime(1, expectedTime);
      await time.increase(7 * ONE_DAY + THIRTY_DAYS + 1);
      await friendGroupFactory.triggerOracleTimeout(1);

      await friendGroupFactory.connect(owner).forceOracleResolution(1, false);

      const resolution = await friendGroupFactory.getWagerResolution(1);
      expect(resolution.winner).to.equal(addr2.address);
    });

    it("Should reject force resolution from non-arbitrator", async function () {
      await expect(
        friendGroupFactory.connect(addr3).forceOracleResolution(0, true)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });

    it("Should reject force resolution if not timed out", async function () {
      // Create active market
      const stakeAmount = ethers.parseEther("0.5");
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "Active bet",
        7 * 24 * 60 * 60,
        arbitrator.address,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.PolymarketOracle,
        { value: stakeAmount }
      );
      await acceptMarket(1, addr2);
      await friendGroupFactory.connect(arbitrator).acceptMarket(1);

      await expect(
        friendGroupFactory.connect(arbitrator).forceOracleResolution(1, true)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotTimedOut");
    });
  });

  describe("View Functions", function () {
    it("canTriggerOracleTimeout should return correct state", async function () {
      await createOraclePeggedMarket();
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;
      await friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, expectedTime);

      // Before timeout
      let [canTrigger, timeRemaining] = await friendGroupFactory.canTriggerOracleTimeout(0);
      expect(canTrigger).to.equal(false);
      expect(timeRemaining).to.be.closeTo(7 * ONE_DAY + THIRTY_DAYS, 5);

      // After timeout
      await time.increase(7 * ONE_DAY + THIRTY_DAYS + 1);
      [canTrigger, timeRemaining] = await friendGroupFactory.canTriggerOracleTimeout(0);
      expect(canTrigger).to.equal(true);
      expect(timeRemaining).to.equal(0);
    });

    it("getOracleTimeoutStatus should return correct data", async function () {
      await createOraclePeggedMarket();
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;
      await friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, expectedTime);

      // Before timeout
      let status = await friendGroupFactory.getOracleTimeoutStatus(0);
      expect(status.isTimedOut).to.equal(false);
      expect(status.expectedTime).to.equal(expectedTime);
      expect(status.creatorAccepted).to.equal(false);
      expect(status.opponentAccepted).to.equal(false);

      // After timeout triggered
      await time.increase(7 * ONE_DAY + THIRTY_DAYS + 1);
      await friendGroupFactory.triggerOracleTimeout(0);

      status = await friendGroupFactory.getOracleTimeoutStatus(0);
      expect(status.isTimedOut).to.equal(true);

      // After creator accepts
      await friendGroupFactory.connect(addr1).acceptMutualRefund(0);
      status = await friendGroupFactory.getOracleTimeoutStatus(0);
      expect(status.creatorAccepted).to.equal(true);
      expect(status.opponentAccepted).to.equal(false);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update oracle timeout", async function () {
      const newTimeout = 14 * ONE_DAY;
      await expect(friendGroupFactory.setOracleTimeout(newTimeout))
        .to.emit(friendGroupFactory, "OracleTimeoutUpdated")
        .withArgs(THIRTY_DAYS, newTimeout);

      expect(await friendGroupFactory.oracleTimeout()).to.equal(newTimeout);
    });

    it("Should reject oracle timeout less than 7 days", async function () {
      await expect(
        friendGroupFactory.setOracleTimeout(6 * ONE_DAY)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidOracleTimeout");
    });

    it("Should reject oracle timeout more than 180 days", async function () {
      await expect(
        friendGroupFactory.setOracleTimeout(181 * ONE_DAY)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidOracleTimeout");
    });
  });

  describe("Integration - Winner Can Claim After Force Resolution", function () {
    it("Should allow winner to claim after force resolution", async function () {
      await createOraclePeggedMarket(arbitrator.address);
      const latestBlock = await ethers.provider.getBlock('latest');
      const expectedTime = latestBlock.timestamp + 7 * ONE_DAY;
      await friendGroupFactory.connect(addr1).setExpectedResolutionTime(0, expectedTime);
      await time.increase(7 * ONE_DAY + THIRTY_DAYS + 1);
      await friendGroupFactory.triggerOracleTimeout(0);

      // Arbitrator forces resolution
      await friendGroupFactory.connect(arbitrator).forceOracleResolution(0, true);

      // Winner claims
      await expect(friendGroupFactory.connect(addr1).claimWinnings(0))
        .to.emit(friendGroupFactory, "WinningsClaimed");
    });
  });
});
