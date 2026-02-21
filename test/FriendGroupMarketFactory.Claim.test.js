const { expect } = require("chai");
const { ethers } = require("hardhat");

// Resolution type enum (matches contract)
const ResolutionType = {
  Either: 0,
  Initiator: 1,
  Receiver: 2,
  ThirdParty: 3,
  AutoPegged: 4,
  PolymarketOracle: 5
};

describe("FriendGroupMarketFactory - Claim Winnings", function () {
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

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, arbitrator] = await ethers.getSigners();

    // Deploy CTF1155 (required for ConditionalMarketFactory)
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    const ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // Deploy mock collateral token for markets (required for CTF1155)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Market Collateral", "MCOL", ethers.parseEther("10000000"));
    await collateralToken.waitForDeployment();

    // Deploy a separate stake token for ERC20 stake tests
    stakeToken = await MockERC20.deploy("Stake Token", "STK", ethers.parseEther("10000000"));
    await stakeToken.waitForDeployment();

    // Deploy ConditionalMarketFactory
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);

    // Set CTF1155 in market factory (required for market creation)
    await marketFactory.setCTF1155(await ctf1155.getAddress());

    // Deploy RagequitModule (with mock token and treasury)
    const RagequitModule = await ethers.getContractFactory("RagequitModule");
    ragequitModule = await RagequitModule.deploy();

    // Deploy TieredRoleManager
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    tieredRoleManager = await TieredRoleManager.deploy();
    await tieredRoleManager.waitForDeployment();

    // Initialize role metadata (required to set isPremium flags)
    await tieredRoleManager.initializeRoleMetadata();

    // Set up Friend Market tier metadata (Bronze tier)
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
      true // isActive
    );

    // Get Bronze tier price
    const tierMeta = await tieredRoleManager.tierMetadata(FRIEND_MARKET_ROLE, MembershipTier.BRONZE);
    const price = tierMeta.price;

    // Deploy MembershipPaymentManager
    const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
    paymentManager = await MembershipPaymentManager.deploy(owner.address); // owner as treasury
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

    // Set collateral token for markets (required for CTF1155)
    await friendGroupFactory.setDefaultCollateralToken(await collateralToken.getAddress());

    // Add stake token as accepted payment token
    await friendGroupFactory.addAcceptedPaymentToken(await stakeToken.getAddress(), true);

    // Purchase memberships for test users (100 years = never expires during tests)
    const durDays = 36500; // 100 years
    for (const signer of [owner, addr1, addr2, addr3, arbitrator]) {
      await tieredRoleManager.connect(signer).purchaseRoleWithTier(
        FRIEND_MARKET_ROLE,
        MembershipTier.BRONZE,
        durDays,
        { value: price }
      );
    }

    // Transfer ownership of marketFactory to friendGroupFactory for testing
    await marketFactory.transferOwnership(await friendGroupFactory.getAddress());

    // Distribute stake tokens for ERC20 tests
    await stakeToken.transfer(addr1.address, ethers.parseEther("1000"));
    await stakeToken.transfer(addr2.address, ethers.parseEther("1000"));
  });

  // Helper function to accept a market (activates it)
  async function acceptMarket(marketId, participant) {
    const marketWithStatus = await friendGroupFactory.getFriendMarketWithStatus(marketId);
    const stakeAmount = marketWithStatus.stakePerParticipant;
    const stakeTokenAddr = marketWithStatus.stakeToken;

    if (stakeTokenAddr === ethers.ZeroAddress) {
      // Native token
      await friendGroupFactory.connect(participant).acceptMarket(marketId, { value: stakeAmount });
    } else {
      // ERC20 token - approve and accept
      const token = await ethers.getContractAt("MockERC20", stakeTokenAddr);
      await token.connect(participant).approve(await friendGroupFactory.getAddress(), stakeAmount);
      await friendGroupFactory.connect(participant).acceptMarket(marketId);
    }
  }

  // Helper to create and activate a 1v1 market with native token stakes
  async function createAndActivateNativeMarket() {
    const description = "Test bet for claiming";
    const tradingPeriod = 7 * 24 * 60 * 60;
    const latestBlock = await ethers.provider.getBlock('latest');
    const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
    const stakeAmount = ethers.parseEther("0.5");

    await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
      addr2.address,
      description,
      tradingPeriod,
      ethers.ZeroAddress, // No arbitrator
      acceptanceDeadline,
      stakeAmount,
      ethers.ZeroAddress, // Native token
      ResolutionType.Either,
      { value: stakeAmount }
    );

    await acceptMarket(0, addr2);
    return 0;
  }

  // Helper to create and activate a 1v1 market with ERC20 token stakes
  async function createAndActivateERC20Market() {
    const description = "Test ERC20 bet for claiming";
    const tradingPeriod = 7 * 24 * 60 * 60;
    const latestBlock = await ethers.provider.getBlock('latest');
    const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
    const stakeAmount = ethers.parseEther("100");

    // Approve for creator
    await stakeToken.connect(addr1).approve(await friendGroupFactory.getAddress(), stakeAmount);

    await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
      addr2.address,
      description,
      tradingPeriod,
      ethers.ZeroAddress,
      acceptanceDeadline,
      stakeAmount,
      await stakeToken.getAddress(),
      ResolutionType.Either
    );

    await acceptMarket(0, addr2);
    return 0;
  }

  describe("Successful Claim Scenarios", function () {
    it("Should allow creator to claim winnings when they win (native token)", async function () {
      await createAndActivateNativeMarket();
      const stakeAmount = ethers.parseEther("0.5");
      const totalPot = stakeAmount * 2n;

      // Resolve in favor of creator (outcome = true)
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      // Check winner is set correctly
      const [winner, outcome, claimed, resolvedAt, pot] = await friendGroupFactory.getWagerResolution(0);
      expect(winner).to.equal(addr1.address);
      expect(outcome).to.equal(true);
      expect(claimed).to.equal(false);
      expect(pot).to.equal(totalPot);

      // Get balance before claim
      const balanceBefore = await ethers.provider.getBalance(addr1.address);

      // Claim winnings
      const tx = await friendGroupFactory.connect(addr1).claimWinnings(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      // Verify balance increased by pot minus gas
      const balanceAfter = await ethers.provider.getBalance(addr1.address);
      expect(balanceAfter).to.equal(balanceBefore + totalPot - gasCost);

      // Verify event
      await expect(tx)
        .to.emit(friendGroupFactory, "WinningsClaimed")
        .withArgs(0, addr1.address, totalPot, ethers.ZeroAddress);

      // Verify claimed state
      expect(await friendGroupFactory.isWagerClaimed(0)).to.equal(true);
    });

    it("Should allow opponent to claim winnings when they win (native token)", async function () {
      await createAndActivateNativeMarket();
      const stakeAmount = ethers.parseEther("0.5");
      const totalPot = stakeAmount * 2n;

      // Resolve in favor of opponent (outcome = false)
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, false);

      // Check winner is set correctly
      const [winner, outcome, claimed, , pot] = await friendGroupFactory.getWagerResolution(0);
      expect(winner).to.equal(addr2.address);
      expect(outcome).to.equal(false);
      expect(pot).to.equal(totalPot);

      // Get balance before claim
      const balanceBefore = await ethers.provider.getBalance(addr2.address);

      // Claim winnings
      const tx = await friendGroupFactory.connect(addr2).claimWinnings(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      // Verify balance increased
      const balanceAfter = await ethers.provider.getBalance(addr2.address);
      expect(balanceAfter).to.equal(balanceBefore + totalPot - gasCost);

      // Verify event
      await expect(tx)
        .to.emit(friendGroupFactory, "WinningsClaimed")
        .withArgs(0, addr2.address, totalPot, ethers.ZeroAddress);
    });

    it("Should allow winner to claim ERC20 token winnings", async function () {
      await createAndActivateERC20Market();
      const stakeAmount = ethers.parseEther("100");
      const totalPot = stakeAmount * 2n;

      // Resolve in favor of creator
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      // Get token balance before claim
      const balanceBefore = await stakeToken.balanceOf(addr1.address);

      // Claim winnings
      const tx = await friendGroupFactory.connect(addr1).claimWinnings(0);

      // Verify token balance increased
      const balanceAfter = await stakeToken.balanceOf(addr1.address);
      expect(balanceAfter).to.equal(balanceBefore + totalPot);

      // Verify event with token address
      await expect(tx)
        .to.emit(friendGroupFactory, "WinningsClaimed")
        .withArgs(0, addr1.address, totalPot, await stakeToken.getAddress());
    });

    it("Should work with arbitrator-resolved markets", async function () {
      const description = "Arbitrated bet";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
      const stakeAmount = ethers.parseEther("0.3");

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        description,
        tradingPeriod,
        arbitrator.address,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.ThirdParty,
        { value: stakeAmount }
      );

      // Both opponent and arbitrator must accept
      await acceptMarket(0, addr2);
      await friendGroupFactory.connect(arbitrator).acceptMarket(0);

      // Arbitrator resolves in favor of opponent
      await friendGroupFactory.connect(arbitrator).resolveFriendMarket(0, false);

      // Opponent claims
      const totalPot = stakeAmount * 2n;
      const balanceBefore = await ethers.provider.getBalance(addr2.address);
      const tx = await friendGroupFactory.connect(addr2).claimWinnings(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(addr2.address);
      expect(balanceAfter).to.equal(balanceBefore + totalPot - gasCost);
    });
  });

  describe("Claim Validation Errors", function () {
    it("Should revert with InvalidMarketId for non-existent market", async function () {
      await expect(
        friendGroupFactory.connect(addr1).claimWinnings(999)
      ).to.be.revertedWithCustomError(friendGroupFactory, "InvalidMarketId");
    });

    it("Should revert with WagerNotResolved for unresolved market", async function () {
      await createAndActivateNativeMarket();

      await expect(
        friendGroupFactory.connect(addr1).claimWinnings(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "WagerNotResolved");
    });

    it("Should revert with WagerNotResolved for pending market", async function () {
      const description = "Pending bet";
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);
      const stakeAmount = ethers.parseEther("0.1");

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        description,
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );

      // Market is still pending, not yet accepted
      await expect(
        friendGroupFactory.connect(addr1).claimWinnings(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "WagerNotResolved");
    });

    it("Should revert with NotWinner for loser trying to claim", async function () {
      await createAndActivateNativeMarket();

      // Resolve in favor of creator
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      // Opponent (loser) tries to claim
      await expect(
        friendGroupFactory.connect(addr2).claimWinnings(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotWinner");
    });

    it("Should revert with NotWinner for unrelated party trying to claim", async function () {
      await createAndActivateNativeMarket();

      // Resolve market
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      // Random person tries to claim
      await expect(
        friendGroupFactory.connect(addr3).claimWinnings(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "NotWinner");
    });

    it("Should revert with AlreadyClaimed for double claim attempt", async function () {
      await createAndActivateNativeMarket();

      // Resolve and claim
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr1).claimWinnings(0);

      // Try to claim again
      await expect(
        friendGroupFactory.connect(addr1).claimWinnings(0)
      ).to.be.revertedWithCustomError(friendGroupFactory, "AlreadyClaimed");
    });
  });

  describe("Resolution Details View Functions", function () {
    it("Should return correct details for unresolved market", async function () {
      await createAndActivateNativeMarket();

      const [winner, outcome, claimed, resolvedAt, totalPot] =
        await friendGroupFactory.getWagerResolution(0);

      expect(winner).to.equal(ethers.ZeroAddress);
      expect(outcome).to.equal(false);
      expect(claimed).to.equal(false);
      expect(resolvedAt).to.equal(0);
      expect(totalPot).to.equal(ethers.parseEther("1")); // 0.5 * 2
    });

    it("Should return correct details for resolved unclaimed market", async function () {
      await createAndActivateNativeMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      const [winner, outcome, claimed, resolvedAt, totalPot] =
        await friendGroupFactory.getWagerResolution(0);

      expect(winner).to.equal(addr1.address);
      expect(outcome).to.equal(true);
      expect(claimed).to.equal(false);
      expect(resolvedAt).to.be.gt(0);
      expect(totalPot).to.equal(ethers.parseEther("1"));
    });

    it("Should return correct details for resolved and claimed market", async function () {
      await createAndActivateNativeMarket();
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr1).claimWinnings(0);

      const [winner, outcome, claimed, resolvedAt, totalPot] =
        await friendGroupFactory.getWagerResolution(0);

      expect(winner).to.equal(addr1.address);
      expect(outcome).to.equal(true);
      expect(claimed).to.equal(true);
      expect(resolvedAt).to.be.gt(0);
      expect(totalPot).to.equal(ethers.parseEther("1"));
    });

    it("isWagerClaimed should return correct state", async function () {
      await createAndActivateNativeMarket();

      expect(await friendGroupFactory.isWagerClaimed(0)).to.equal(false);

      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      expect(await friendGroupFactory.isWagerClaimed(0)).to.equal(false);

      await friendGroupFactory.connect(addr1).claimWinnings(0);
      expect(await friendGroupFactory.isWagerClaimed(0)).to.equal(true);
    });
  });

  describe("Multiple Markets Independence", function () {
    it("Should handle claims for multiple independent markets", async function () {
      // Create two markets
      const stakeAmount = ethers.parseEther("0.5");

      // Market 0
      await createAndActivateNativeMarket();

      // Market 1 - need to create manually since helper always creates market 0
      const tradingPeriod = 7 * 24 * 60 * 60;
      const latestBlock = await ethers.provider.getBlock('latest');
      const acceptanceDeadline = latestBlock.timestamp + (2 * 60 * 60);

      await friendGroupFactory.connect(addr1).createOneVsOneMarketPending(
        addr2.address,
        "Second bet",
        tradingPeriod,
        ethers.ZeroAddress,
        acceptanceDeadline,
        stakeAmount,
        ethers.ZeroAddress,
        ResolutionType.Either,
        { value: stakeAmount }
      );
      await acceptMarket(1, addr2);

      // Resolve both - creator wins first, opponent wins second
      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);
      await friendGroupFactory.connect(addr2).resolveFriendMarket(1, false);

      // Both can claim independently
      await expect(friendGroupFactory.connect(addr1).claimWinnings(0))
        .to.emit(friendGroupFactory, "WinningsClaimed");

      await expect(friendGroupFactory.connect(addr2).claimWinnings(1))
        .to.emit(friendGroupFactory, "WinningsClaimed");

      // Both should be marked as claimed
      expect(await friendGroupFactory.isWagerClaimed(0)).to.equal(true);
      expect(await friendGroupFactory.isWagerClaimed(1)).to.equal(true);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero stake (free bet) gracefully", async function () {
      // This test depends on whether zero stake is allowed
      // Skip if not applicable
      this.skip();
    });

    it("Should transfer exact total pot amount", async function () {
      await createAndActivateNativeMarket();
      const stakeAmount = ethers.parseEther("0.5");
      const totalPot = stakeAmount * 2n;

      await friendGroupFactory.connect(addr1).resolveFriendMarket(0, true);

      // Get contract balance before claim
      const contractBalanceBefore = await ethers.provider.getBalance(
        await friendGroupFactory.getAddress()
      );
      expect(contractBalanceBefore).to.be.gte(totalPot);

      // Claim
      await friendGroupFactory.connect(addr1).claimWinnings(0);

      // Verify contract balance decreased by exactly totalPot
      const contractBalanceAfter = await ethers.provider.getBalance(
        await friendGroupFactory.getAddress()
      );
      expect(contractBalanceBefore - contractBalanceAfter).to.equal(totalPot);
    });
  });
});
