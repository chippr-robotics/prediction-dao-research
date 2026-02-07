import { expect } from "chai";
import hre from "hardhat";

describe("Modular RBAC System Tests", function () {
  let ethers;
  let roleManagerCore;
  let tierRegistry;
  let membershipManager;
  let paymentProcessor;
  let membershipPaymentManager;
  let mockToken;
  let owner, treasury, user1, user2;

  // Role constants
  let MARKET_MAKER_ROLE;
  let CLEARPATH_USER_ROLE;
  let OPERATIONS_ADMIN_ROLE;

  // Tier constants
  const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, treasury, user1, user2] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("USD Coin", "USDC", ethers.parseUnits("1000000", 6));
    await mockToken.waitForDeployment();

    // Deploy RoleManagerCore
    const RoleManagerCore = await ethers.getContractFactory("RoleManagerCore");
    roleManagerCore = await RoleManagerCore.deploy();
    await roleManagerCore.waitForDeployment();

    // Deploy TierRegistry
    const TierRegistry = await ethers.getContractFactory("TierRegistry");
    tierRegistry = await TierRegistry.deploy();
    await tierRegistry.waitForDeployment();

    // Deploy MembershipManager
    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    membershipManager = await MembershipManager.deploy();
    await membershipManager.waitForDeployment();

    // Deploy MembershipPaymentManager
    const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
    membershipPaymentManager = await MembershipPaymentManager.deploy(treasury.address);
    await membershipPaymentManager.waitForDeployment();

    // Deploy PaymentProcessor
    const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
    paymentProcessor = await PaymentProcessor.deploy();
    await paymentProcessor.waitForDeployment();

    // Get role constants
    MARKET_MAKER_ROLE = await roleManagerCore.MARKET_MAKER_ROLE();
    CLEARPATH_USER_ROLE = await roleManagerCore.CLEARPATH_USER_ROLE();
    OPERATIONS_ADMIN_ROLE = await roleManagerCore.OPERATIONS_ADMIN_ROLE();

    // Configure RoleManagerCore extensions
    await roleManagerCore.setAllExtensions(
      await tierRegistry.getAddress(),
      await paymentProcessor.getAddress(),
      ethers.ZeroAddress, // usageTracker
      await membershipManager.getAddress()
    );

    // Configure TierRegistry
    await tierRegistry.setRoleManagerCore(await roleManagerCore.getAddress());
    await tierRegistry.setAuthorizedExtension(await paymentProcessor.getAddress(), true);
    // RoleManagerCore also needs to be authorized since it delegates calls from PaymentProcessor
    await tierRegistry.setAuthorizedExtension(await roleManagerCore.getAddress(), true);

    // Configure MembershipManager
    await membershipManager.setRoleManagerCore(await roleManagerCore.getAddress());
    await membershipManager.setTierRegistry(await tierRegistry.getAddress());
    await membershipManager.setAuthorizedExtension(await paymentProcessor.getAddress(), true);
    // RoleManagerCore also needs to be authorized since it delegates calls from PaymentProcessor
    await membershipManager.setAuthorizedExtension(await roleManagerCore.getAddress(), true);

    // Configure PaymentProcessor
    await paymentProcessor.configureAll(
      await roleManagerCore.getAddress(),
      await tierRegistry.getAddress(),
      await membershipManager.getAddress(),
      await membershipPaymentManager.getAddress()
    );

    // Configure MembershipPaymentManager
    await membershipPaymentManager.addPaymentToken(await mockToken.getAddress(), "USDC", 6);
    await membershipPaymentManager.setRolePrice(
      MARKET_MAKER_ROLE,
      await mockToken.getAddress(),
      ethers.parseUnits("100", 6)
    );

    // Configure tier metadata
    const defaultLimits = {
      dailyBetLimit: ethers.parseUnits("10000", 6),
      weeklyBetLimit: ethers.parseUnits("50000", 6),
      monthlyMarketCreation: 10,
      maxPositionSize: ethers.parseUnits("5000", 6),
      maxConcurrentMarkets: 5,
      withdrawalLimit: ethers.parseUnits("10000", 6),
      canCreatePrivateMarkets: true,
      canUseAdvancedFeatures: false,
      feeDiscount: 0
    };

    await tierRegistry.setTierMetadata(
      MARKET_MAKER_ROLE,
      MembershipTier.BRONZE,
      "Basic Market Maker",
      "Basic market creation access",
      ethers.parseUnits("100", 6),
      defaultLimits,
      true // isActive
    );

    // Mint tokens to users
    await mockToken.mint(user1.address, ethers.parseUnits("10000", 6));
    await mockToken.mint(user2.address, ethers.parseUnits("10000", 6));
  });

  describe("RoleManagerCore", function () {
    it("Should have correct role constants", async function () {
      expect(MARKET_MAKER_ROLE).to.equal(ethers.keccak256(ethers.toUtf8Bytes("MARKET_MAKER_ROLE")));
      expect(CLEARPATH_USER_ROLE).to.equal(ethers.keccak256(ethers.toUtf8Bytes("CLEARPATH_USER_ROLE")));
    });

    it("Should grant role via admin", async function () {
      await roleManagerCore.grantRoleByAdmin(MARKET_MAKER_ROLE, user1.address);
      expect(await roleManagerCore.hasRole(MARKET_MAKER_ROLE, user1.address)).to.be.true;
    });

    it("Should allow extension to grant role", async function () {
      // PaymentProcessor is registered as an extension
      await paymentProcessor.adminGrantTier(user1.address, MARKET_MAKER_ROLE, MembershipTier.BRONZE, 30);
      expect(await roleManagerCore.hasRole(MARKET_MAKER_ROLE, user1.address)).to.be.true;
    });

    describe("checkMarketCreationLimitFor", function () {
      it("Should return true for user with role", async function () {
        await roleManagerCore.grantRoleByAdmin(MARKET_MAKER_ROLE, user1.address);
        // Use staticCall since the function is not view (for compatibility with TieredRoleManager)
        const result = await roleManagerCore.checkMarketCreationLimitFor.staticCall(user1.address, MARKET_MAKER_ROLE);
        expect(result).to.be.true;
      });

      it("Should return false for user without role", async function () {
        // Use staticCall since the function is not view (for compatibility with TieredRoleManager)
        const result = await roleManagerCore.checkMarketCreationLimitFor.staticCall(user1.address, MARKET_MAKER_ROLE);
        expect(result).to.be.false;
      });
    });
  });

  describe("MembershipManager", function () {
    describe("authorizedExtensions", function () {
      it("Should allow owner to set authorized extension", async function () {
        const newExtension = user2.address;
        await membershipManager.setAuthorizedExtension(newExtension, true);
        expect(await membershipManager.authorizedExtensions(newExtension)).to.be.true;
      });

      it("Should allow authorized extension to set membership expiration", async function () {
        // PaymentProcessor is authorized
        const expiration = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days

        await paymentProcessor.adminGrantTier(user1.address, MARKET_MAKER_ROLE, MembershipTier.BRONZE, 30);

        const storedExpiration = await membershipManager.getMembershipExpiration(user1.address, MARKET_MAKER_ROLE);
        expect(storedExpiration).to.be.gt(0);
      });

      it("Should reject unauthorized extension from setting membership expiration", async function () {
        // user2 is not authorized
        await expect(
          membershipManager.connect(user2).setMembershipExpiration(
            user1.address,
            MARKET_MAKER_ROLE,
            Math.floor(Date.now() / 1000) + 86400 * 30
          )
        ).to.be.revertedWith("Not authorized");
      });

      it("Should allow removing authorized extension", async function () {
        await membershipManager.setAuthorizedExtension(await paymentProcessor.getAddress(), false);
        expect(await membershipManager.authorizedExtensions(await paymentProcessor.getAddress())).to.be.false;
      });
    });
  });

  describe("TierRegistry", function () {
    describe("authorizedExtensions", function () {
      it("Should allow owner to set authorized extension", async function () {
        const newExtension = user2.address;
        await tierRegistry.setAuthorizedExtension(newExtension, true);
        expect(await tierRegistry.authorizedExtensions(newExtension)).to.be.true;
      });

      it("Should allow authorized extension to set user tier", async function () {
        // PaymentProcessor is authorized
        await paymentProcessor.adminGrantTier(user1.address, MARKET_MAKER_ROLE, MembershipTier.BRONZE, 30);

        const tier = await tierRegistry.getUserTier(user1.address, MARKET_MAKER_ROLE);
        expect(tier).to.equal(MembershipTier.BRONZE);
      });

      it("Should reject unauthorized extension from setting user tier", async function () {
        await expect(
          tierRegistry.connect(user2).setUserTier(user1.address, MARKET_MAKER_ROLE, MembershipTier.BRONZE)
        ).to.be.revertedWith("Not authorized");
      });
    });
  });

  describe("PaymentProcessor", function () {
    it("Should process tier purchase with token", async function () {
      const amount = ethers.parseUnits("100", 6);

      // Approve token spend
      await mockToken.connect(user1).approve(await paymentProcessor.getAddress(), amount);

      // Purchase tier
      await paymentProcessor.connect(user1).purchaseTierWithToken(
        MARKET_MAKER_ROLE,
        MembershipTier.BRONZE,
        await mockToken.getAddress(),
        amount
      );

      // Verify role granted
      expect(await roleManagerCore.hasRole(MARKET_MAKER_ROLE, user1.address)).to.be.true;

      // Verify tier set
      expect(await tierRegistry.getUserTier(user1.address, MARKET_MAKER_ROLE)).to.equal(MembershipTier.BRONZE);

      // Verify membership expiration set
      expect(await membershipManager.getMembershipExpiration(user1.address, MARKET_MAKER_ROLE)).to.be.gt(0);
    });
  });
});

describe("ConditionalMarketFactory with RoleManagerCore", function () {
  let ethers;
  let marketFactory;
  let roleManagerCore;
  let ctf1155;
  let collateralToken;
  let owner, marketMaker;

  const BetType = { PassFail: 0, YesNo: 1, MultiOutcome: 2 };

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, marketMaker] = await ethers.getSigners();

    // Deploy CTF1155
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // Deploy ConditionalMarketFactory
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);

    // Set CTF1155
    await marketFactory.setCTF1155(await ctf1155.getAddress());

    // Deploy RoleManagerCore (instead of TieredRoleManager)
    const RoleManagerCore = await ethers.getContractFactory("RoleManagerCore");
    roleManagerCore = await RoleManagerCore.deploy();
    await roleManagerCore.waitForDeployment();

    // Set role manager in factory
    await marketFactory.setRoleManager(await roleManagerCore.getAddress());

    // Grant MARKET_MAKER_ROLE to marketMaker
    const MARKET_MAKER_ROLE = await roleManagerCore.MARKET_MAKER_ROLE();
    await roleManagerCore.grantRoleByAdmin(MARKET_MAKER_ROLE, marketMaker.address);

    // Deploy mock collateral token
    const MockERC20 = await ethers.getContractFactory("ConditionalToken");
    collateralToken = await MockERC20.deploy("Collateral", "COL");
    await collateralToken.waitForDeployment();
  });

  it("Should use RoleManagerCore for role checks", async function () {
    const MARKET_MAKER_ROLE = await roleManagerCore.MARKET_MAKER_ROLE();
    expect(await roleManagerCore.hasRole(MARKET_MAKER_ROLE, marketMaker.address)).to.be.true;
  });

  it("Should allow market maker with RoleManagerCore role to deploy market", async function () {
    const proposalId = 100;
    const collateralTokenAddr = await collateralToken.getAddress();
    const liquidityAmount = ethers.parseEther("1000");
    const liquidityParameter = ethers.parseEther("100");
    const tradingPeriod = 7 * 24 * 60 * 60;

    await expect(
      marketFactory.connect(marketMaker).deployMarketPair(
        proposalId,
        collateralTokenAddr,
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.PassFail
      )
    ).to.emit(marketFactory, "MarketCreated");
  });

  it("Should allow updating role manager", async function () {
    // Deploy a second RoleManagerCore
    const RoleManagerCore = await ethers.getContractFactory("RoleManagerCore");
    const newRoleManagerCore = await RoleManagerCore.deploy();
    await newRoleManagerCore.waitForDeployment();

    // Update role manager (this was previously disallowed)
    await marketFactory.setRoleManager(await newRoleManagerCore.getAddress());

    // Verify update
    expect(await marketFactory.roleManager()).to.equal(await newRoleManagerCore.getAddress());
  });

  it("Should reject non-market-maker from deploying market", async function () {
    const proposalId = 101;
    const collateralTokenAddr = await collateralToken.getAddress();
    const liquidityAmount = ethers.parseEther("1000");
    const liquidityParameter = ethers.parseEther("100");
    const tradingPeriod = 7 * 24 * 60 * 60;

    // user without role tries to deploy
    const [, , nonMarketMaker] = await ethers.getSigners();

    await expect(
      marketFactory.connect(nonMarketMaker).deployMarketPair(
        proposalId,
        collateralTokenAddr,
        liquidityAmount,
        liquidityParameter,
        tradingPeriod,
        BetType.PassFail
      )
    ).to.be.revertedWith("Requires owner or MARKET_MAKER_ROLE");
  });
});
