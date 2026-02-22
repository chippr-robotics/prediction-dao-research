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

describe("FriendGroupMarketFactory - Challenge Period", function () {
  let friendGroupFactory;
  let marketFactory;
  let ragequitModule;
  let tieredRoleManager;
  let paymentManager;
  let collateralToken;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let arbitrator;

  const FRIEND_MARKET_ROLE = ethers.id("FRIEND_MARKET_ROLE");
  const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

  const ONE_HOUR = 3600;
  const ONE_DAY = 86400;
  const CHALLENGE_BOND = ethers.parseEther("0.1");

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, arbitrator] = await ethers.getSigners();

    // Deploy CTF1155 (required for ConditionalMarketFactory)
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    const ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // Deploy mock collateral token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
    await collateralToken.waitForDeployment();

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

    // Set up Friend Market tier metadata
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
  });

  async function acceptMarket(marketId, participant) {
    const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(marketId);
    const stakeAmount = marketWithStatus.stakePerParticipant;
    await friendGroupFactory.connect(participant).acceptMarket(marketId, { value: stakeAmount });
  }

  async function createAndActivateMarket(resolutionType = ResolutionType.Either, arb = ethers.ZeroAddress) {
    const description = "Test bet with challenge";
    const tradingPeriod = 7 * 24 * 60 * 60;
    const latestBlock = await ethers.provider.getBlock('latest');
    const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
    const stakeAmount = ethers.parseEther("0.5");

    await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
      addr2.address,
      description,
      tradingPeriod,
      arb,
      acceptanceDeadline,
      stakeAmount,
      ethers.ZeroAddress,
      resolutionType,
      { value: stakeAmount }
    );

    await acceptMarket(0, addr2);

    // If third party resolution with arbitrator, arbitrator needs to accept
    if (resolutionType === ResolutionType.ThirdParty && arb !== ethers.ZeroAddress) {
      await friendGroupFactory.connect(arbitrator).acceptMarket(0);
    }

    return 0;
  }

  describe("Resolution Proposal", function () {
    it("Should start challenge period when creator proposes resolution", async function () {
      await createAndActivateMarket();

      const tx = await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.status).to.equal(FriendMarketStatus.PendingResolution);

      const pending = await friendGroupFactory.getPendingResolution(0);
      expect(pending.proposedOutcome).to.equal(true);
      expect(pending.proposer).to.equal(addr1.address);
      expect(pending.challenger).to.equal(ethers.ZeroAddress);

      await expect(tx).to.emit(friendGroupFactory, "ResolutionProposed");
    });

    it("Should start challenge period when opponent proposes resolution", async function () {
      await createAndActivateMarket();

      await friendGroupFactory.connect(addr2).resolveFriendMarket(0, false);

      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.status).to.equal(FriendMarketStatus.PendingResolution);

      const pending = await friendGroupFactory.getPendingResolution(0);
      expect(pending.proposedOutcome).to.equal(false);
      expect(pending.proposer).to.equal(addr2.address);
    });

    it("Should set correct challenge deadline (24 hours from proposal)", async function () {
      await createAndActivateMarket();

      const tx = await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      const block = await ethers.provider.getBlock(tx.blockNumber);

      const pending = await friendGroupFactory.getPendingResolution(0);
      expect(pending.challengeDeadline).to.equal(block.timestamp + ONE_DAY);
    });

    it("Should reject resolution proposal from unauthorized party", async function () {
      await createAndActivateMarket();

      await expect(
        friendGroupFactory.connect(addr3).resolveFriendMarket(0, true)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });
  });

  describe("Challenge Resolution", function () {
    it("Should allow opponent to challenge proposer's resolution", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      const tx = await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });

      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.status).to.equal(FriendMarketStatus.Challenged);

      const pending = await friendGroupFactory.getPendingResolution(0);
      expect(pending.challenger).to.equal(addr2.address);
      expect(pending.challengeBondPaid).to.equal(CHALLENGE_BOND);

      await expect(tx).to.emit(friendGroupFactory, "ResolutionChallenged")
        .withArgs(0, addr2.address, CHALLENGE_BOND);
    });

    it("Should allow creator to challenge opponent's resolution", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr2).resolveFriendMarket(0, false);

      await friendGroupFactory.connect(addr1).challengeResolution(0, { value: CHALLENGE_BOND });

      const pending = await friendGroupFactory.getPendingResolution(0);
      expect(pending.challenger).to.equal(addr1.address);
    });

    it("Should reject challenge without sufficient bond", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      await expect(
        friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND - 1n })
      ).to.be.revertedWithCustomError(friendGroupFactory, "InsufficientChallengeBond");
    });

    it("Should reject challenge from non-participant", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      await expect(
        friendGroupFactory.connect(addr3).challengeResolution(0, { value: CHALLENGE_BOND })
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });

    it("Should reject challenge from proposer", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      await expect(
        friendGroupFactory.connect(addr1).challengeResolution(0, { value: CHALLENGE_BOND })
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });

    it("Should reject double challenge", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });

      await expect(
        friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND })
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotPendingResolution");
    });

    it("Should reject challenge after deadline", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      // Fast forward past challenge period
      await time.increase(ONE_DAY + 1);

      await expect(
        friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND })
      ).to.be.revertedWithCustomError(friendGroupFactory, "ChallengePeriodNotExpired");
    });
  });

  describe("Finalize Resolution", function () {
    it("Should finalize resolution after challenge period expires", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      // Fast forward past challenge period
      await time.increase(ONE_DAY + 1);

      const tx = await friendGroupFactory.finalizeResolution(0);

      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.status).to.equal(FriendMarketStatus.Resolved);

      const resolution = await friendGroupFactory.getWagerResolution(0);
      expect(resolution.winner).to.equal(addr1.address);
      expect(resolution.outcome).to.equal(true);

      await expect(tx).to.emit(friendGroupFactory, "ResolutionFinalized")
        .withArgs(0, true);
    });

    it("Should reject finalization before challenge period expires", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      await expect(
        friendGroupFactory.finalizeResolution(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotInChallengePeriod");
    });

    it("Should reject finalization of challenged market", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });

      await time.increase(ONE_DAY + 1);

      await expect(
        friendGroupFactory.finalizeResolution(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotPendingResolution");
    });

    it("Winner can claim after finalization", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await time.increase(ONE_DAY + 1);
      await friendGroupFactory.finalizeResolution(0);

      await expect(friendGroupFactory.connect(addr1).claimWinnings(0))
        .to.emit(friendGroupFactory, "WinningsClaimed");
    });
  });

  describe("Dispute Resolution", function () {
    it("Should allow owner to resolve dispute (no arbitrator)", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });

      // Owner resolves in favor of challenger
      const tx = await friendGroupFactory.connect(owner).resolveDispute(0, false);

      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.status).to.equal(FriendMarketStatus.Resolved);

      const resolution = await friendGroupFactory.getWagerResolution(0);
      expect(resolution.winner).to.equal(addr2.address);
      expect(resolution.outcome).to.equal(false);

      await expect(tx).to.emit(friendGroupFactory, "DisputeResolved");
    });

    it("Should allow arbitrator to resolve dispute (ThirdParty)", async function () {
      await createAndActivateMarket(ResolutionType.ThirdParty, arbitrator.address);
      await friendGroupFactory.connect(arbitrator).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });

      // Arbitrator resolves
      await friendGroupFactory.connect(arbitrator).resolveDispute(0, true);

      const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(0);
      expect(marketWithStatus.status).to.equal(FriendMarketStatus.Resolved);
    });

    it("Should return bond to challenger when they win", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });

      const balanceBefore = await ethers.provider.getBalance(addr2.address);

      // Owner resolves in favor of challenger (false)
      await friendGroupFactory.connect(owner).resolveDispute(0, false);

      const balanceAfter = await ethers.provider.getBalance(addr2.address);
      expect(balanceAfter).to.equal(balanceBefore + CHALLENGE_BOND);
    });

    it("Should give bond to proposer when they win", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });

      const balanceBefore = await ethers.provider.getBalance(addr1.address);

      // Owner resolves in favor of proposer (true)
      await friendGroupFactory.connect(owner).resolveDispute(0, true);

      const balanceAfter = await ethers.provider.getBalance(addr1.address);
      expect(balanceAfter).to.equal(balanceBefore + CHALLENGE_BOND);
    });

    it("Should reject dispute resolution from non-arbitrator", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });

      await expect(
        friendGroupFactory.connect(addr3).resolveDispute(0, true)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotAuthorized");
    });

    it("Should reject dispute resolution for non-challenged market", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      await expect(
        friendGroupFactory.connect(owner).resolveDispute(0, true)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotChallenged");
    });
  });

  describe("View Functions", function () {
    it("canFinalizeResolution should return correct state", async function () {
      await createAndActivateMarket();

      // Before proposal
      let [canFinalize, timeRemaining] = await friendGroupFactory.canFinalizeResolution(0);
      expect(canFinalize).to.equal(false);

      // After proposal, before expiry
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      [canFinalize, timeRemaining] = await friendGroupFactory.canFinalizeResolution(0);
      expect(canFinalize).to.equal(false);
      expect(timeRemaining).to.be.closeTo(ONE_DAY, 5);

      // After expiry
      await time.increase(ONE_DAY + 1);
      [canFinalize, timeRemaining] = await friendGroupFactory.canFinalizeResolution(0);
      expect(canFinalize).to.equal(true);
      expect(timeRemaining).to.equal(0);
    });

    it("getPendingResolution should return correct data", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      const pending = await friendGroupFactory.getPendingResolution(0);
      expect(pending.proposedOutcome).to.equal(true);
      expect(pending.proposer).to.equal(addr1.address);
      expect(pending.proposedAt).to.be.gt(0);
      expect(pending.challengeDeadline).to.be.gt(pending.proposedAt);
      expect(pending.challenger).to.equal(ethers.ZeroAddress);
      expect(pending.challengeBondPaid).to.equal(0);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update challenge period", async function () {
      const newPeriod = 12 * ONE_HOUR;
      await friendGroupFactory.setChallengePeriod(newPeriod);
      expect(await friendGroupFactory.challengePeriod()).to.equal(newPeriod);
    });

    it("Should reject challenge period less than 1 hour", async function () {
      await expect(
        friendGroupFactory.setChallengePeriod(ONE_HOUR - 1)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidChallengePeriod");
    });

    it("Should reject challenge period more than 7 days", async function () {
      await expect(
        friendGroupFactory.setChallengePeriod(8 * ONE_DAY)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidChallengePeriod");
    });

    it("Should allow owner to update challenge bond", async function () {
      const newBond = ethers.parseEther("0.5");
      await friendGroupFactory.setChallengeBond(newBond);
      expect(await friendGroupFactory.challengeBond()).to.equal(newBond);
    });

    it("Should allow zero challenge bond", async function () {
      await friendGroupFactory.setChallengeBond(0);
      expect(await friendGroupFactory.challengeBond()).to.equal(0);
    });
  });

  describe("Integration with Claim", function () {
    it("Cannot claim while in PendingResolution state", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      await expect(
        friendGroupFactory.connect(addr1).claimWinnings(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "WagerNotResolved");
    });

    it("Cannot claim while in Challenged state", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });

      await expect(
        friendGroupFactory.connect(addr1).claimWinnings(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "WagerNotResolved");
    });

    it("Can claim after dispute resolution", async function () {
      await createAndActivateMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).challengeResolution(0, { value: CHALLENGE_BOND });
      await friendGroupFactory.connect(owner).resolveDispute(0, true);

      await expect(friendGroupFactory.connect(addr1).claimWinnings(0))
        .to.emit(friendGroupFactory, "WinningsClaimed");
    });
  });
});
