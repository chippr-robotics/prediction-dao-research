const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Integration Tests for Nullifier System
 *
 * Tests the full flow of:
 * 1. NullifierRegistry deployment and initialization
 * 2. Integration with ConditionalMarketFactory
 * 3. Market nullification affecting trading
 * 4. Address nullification affecting user operations
 */
describe("Nullifier Integration Tests", function () {
  let nullifierRegistry;
  let marketFactory;
  let roleManager;
  let ctf1155;
  let collateralToken;

  let owner;
  let nullifierAdmin;
  let marketMaker;
  let trader;
  let blockedUser;

  // RSA test parameters
  const TEST_RSA_N = "0x" + "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".repeat(8);
  const TEST_RSA_G = "0x" + "0000000000000000000000000000000000000000000000000000000000000002".repeat(8);
  const padTo256Bytes = (hex) => {
    const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
    return "0x" + stripped.padStart(512, "0");
  };

  beforeEach(async function () {
    [owner, nullifierAdmin, marketMaker, trader, blockedUser] = await ethers.getSigners();

    // Deploy MinimalRoleManager
    const MinimalRoleManager = await ethers.getContractFactory("MinimalRoleManager");
    roleManager = await MinimalRoleManager.deploy();
    await roleManager.waitForDeployment();

    // Deploy mock collateral token
    const ERC20Mock = await ethers.getContractFactory("ConditionalToken");
    collateralToken = await ERC20Mock.deploy("Collateral", "COL");
    await collateralToken.waitForDeployment();

    // Mint tokens to trader
    await collateralToken.mint(trader.address, ethers.parseEther("1000"));
    await collateralToken.mint(blockedUser.address, ethers.parseEther("1000"));

    // Deploy CTF1155
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    ctf1155 = await CTF1155.deploy("https://example.com/metadata/");
    await ctf1155.waitForDeployment();

    // Deploy NullifierRegistry
    const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
    nullifierRegistry = await NullifierRegistry.deploy();
    await nullifierRegistry.waitForDeployment();

    // Initialize RSA parameters
    await nullifierRegistry.initializeParams(
      padTo256Bytes(TEST_RSA_N),
      padTo256Bytes(TEST_RSA_G),
      padTo256Bytes(TEST_RSA_G)
    );

    // Grant NULLIFIER_ADMIN_ROLE
    const NULLIFIER_ADMIN_ROLE = await nullifierRegistry.NULLIFIER_ADMIN_ROLE();
    await nullifierRegistry.grantRole(NULLIFIER_ADMIN_ROLE, nullifierAdmin.address);

    // Deploy ConditionalMarketFactory
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.waitForDeployment();

    // Set up market factory
    await marketFactory.setCTF1155(await ctf1155.getAddress());
    await marketFactory.setRoleManager(await roleManager.getAddress());
    await marketFactory.setNullifierRegistry(await nullifierRegistry.getAddress());

    // Grant MARKET_MAKER_ROLE
    const MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();
    await roleManager.grantTier(marketMaker.address, MARKET_MAKER_ROLE, 1, 365);
  });

  describe("Market Factory Nullifier Integration", function () {
    let marketId;
    let marketHash;

    beforeEach(async function () {
      // Create a market
      const tx = await marketFactory.connect(marketMaker).deployMarketPair(
        1, // proposalId
        await collateralToken.getAddress(),
        ethers.parseEther("100"),
        ethers.parseEther("1"),
        10 * 24 * 60 * 60, // 10 days
        0 // BetType.YesNo
      );

      marketId = 0;

      // Get the market hash
      marketHash = await marketFactory.computeMarketHash(marketId);
    });

    it("Should correctly compute market hash", async function () {
      expect(marketHash).to.not.equal(ethers.ZeroHash);
    });

    it("Should report market as not nullified initially", async function () {
      const isNullified = await marketFactory.isMarketNullified(marketId);
      expect(isNullified).to.equal(false);
    });

    it("Should report market as nullified after nullification", async function () {
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(
        marketHash,
        marketId,
        "Test nullification"
      );

      const isNullified = await marketFactory.isMarketNullified(marketId);
      expect(isNullified).to.equal(true);
    });

    it("Should allow trading on non-nullified market (enforcement disabled)", async function () {
      // Enforcement is disabled by default
      const enforcement = await marketFactory.enforceNullificationOnChain();
      expect(enforcement).to.equal(false);

      // Approve collateral
      await collateralToken.connect(trader).approve(
        await marketFactory.getAddress(),
        ethers.parseEther("10")
      );

      // Trading should work
      await expect(
        marketFactory.connect(trader).buyTokens(marketId, true, ethers.parseEther("10"))
      ).to.not.be.reverted;
    });

    it("Should block trading on nullified market when enforcement is enabled", async function () {
      // Enable on-chain enforcement
      await marketFactory.setNullificationEnforcement(true);

      // Nullify the market
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(
        marketHash,
        marketId,
        "Market has issues"
      );

      // Approve collateral
      await collateralToken.connect(trader).approve(
        await marketFactory.getAddress(),
        ethers.parseEther("10")
      );

      // Trading should be blocked
      await expect(
        marketFactory.connect(trader).buyTokens(marketId, true, ethers.parseEther("10"))
      ).to.be.revertedWith("Market is nullified");
    });

    it("Should allow trading after market is reinstated", async function () {
      // Enable enforcement and nullify
      await marketFactory.setNullificationEnforcement(true);
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(
        marketHash,
        marketId,
        "Temporary nullification"
      );

      // Reinstate the market
      await nullifierRegistry.connect(nullifierAdmin).reinstateMarket(
        marketHash,
        marketId,
        "Issue resolved"
      );

      // Approve collateral
      await collateralToken.connect(trader).approve(
        await marketFactory.getAddress(),
        ethers.parseEther("10")
      );

      // Trading should work again
      await expect(
        marketFactory.connect(trader).buyTokens(marketId, true, ethers.parseEther("10"))
      ).to.not.be.reverted;
    });
  });

  describe("Address Nullification Integration", function () {
    let marketId;

    beforeEach(async function () {
      // Create a market
      await marketFactory.connect(marketMaker).deployMarketPair(
        1,
        await collateralToken.getAddress(),
        ethers.parseEther("100"),
        ethers.parseEther("1"),
        10 * 24 * 60 * 60,
        0
      );
      marketId = 0;

      // Enable on-chain enforcement
      await marketFactory.setNullificationEnforcement(true);
    });

    it("Should block nullified address from buying tokens", async function () {
      // Nullify the blocked user
      await nullifierRegistry.connect(nullifierAdmin).nullifyAddress(
        blockedUser.address,
        "Suspicious activity"
      );

      // Approve collateral
      await collateralToken.connect(blockedUser).approve(
        await marketFactory.getAddress(),
        ethers.parseEther("10")
      );

      // Trading should be blocked
      await expect(
        marketFactory.connect(blockedUser).buyTokens(marketId, true, ethers.parseEther("10"))
      ).to.be.revertedWith("Address is nullified");
    });

    it("Should allow non-nullified address to trade", async function () {
      // Nullify a different address
      await nullifierRegistry.connect(nullifierAdmin).nullifyAddress(
        blockedUser.address,
        "Suspicious activity"
      );

      // Regular trader should still work
      await collateralToken.connect(trader).approve(
        await marketFactory.getAddress(),
        ethers.parseEther("10")
      );

      await expect(
        marketFactory.connect(trader).buyTokens(marketId, true, ethers.parseEther("10"))
      ).to.not.be.reverted;
    });

    it("Should allow reinstated address to trade", async function () {
      // Nullify and then reinstate
      await nullifierRegistry.connect(nullifierAdmin).nullifyAddress(
        blockedUser.address,
        "Temporary block"
      );
      await nullifierRegistry.connect(nullifierAdmin).reinstateAddress(
        blockedUser.address,
        "Cleared"
      );

      // Approve and trade
      await collateralToken.connect(blockedUser).approve(
        await marketFactory.getAddress(),
        ethers.parseEther("10")
      );

      await expect(
        marketFactory.connect(blockedUser).buyTokens(marketId, true, ethers.parseEther("10"))
      ).to.not.be.reverted;
    });
  });

  describe("Batch Operations Integration", function () {
    let market1Hash;
    let market2Hash;

    beforeEach(async function () {
      // Create multiple markets
      await marketFactory.connect(marketMaker).deployMarketPair(
        1,
        await collateralToken.getAddress(),
        ethers.parseEther("100"),
        ethers.parseEther("1"),
        10 * 24 * 60 * 60,
        0
      );
      await marketFactory.connect(marketMaker).deployMarketPair(
        2,
        await collateralToken.getAddress(),
        ethers.parseEther("100"),
        ethers.parseEther("1"),
        10 * 24 * 60 * 60,
        0
      );

      market1Hash = await marketFactory.computeMarketHash(0);
      market2Hash = await marketFactory.computeMarketHash(1);
    });

    it("Should batch nullify multiple markets", async function () {
      await nullifierRegistry.connect(nullifierAdmin).batchNullifyMarkets(
        [market1Hash, market2Hash],
        [0, 1],
        "Batch nullification for security"
      );

      expect(await nullifierRegistry.isMarketNullified(market1Hash)).to.equal(true);
      expect(await nullifierRegistry.isMarketNullified(market2Hash)).to.equal(true);
      expect(await nullifierRegistry.nullifiedMarketCount()).to.equal(2);
    });

    it("Should skip already nullified markets in batch", async function () {
      // Nullify first market individually
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(
        market1Hash,
        0,
        "First nullification"
      );

      // Batch should only add the second market
      await nullifierRegistry.connect(nullifierAdmin).batchNullifyMarkets(
        [market1Hash, market2Hash],
        [0, 1],
        "Batch operation"
      );

      expect(await nullifierRegistry.nullifiedMarketCount()).to.equal(2);
    });
  });

  describe("Statistics Tracking", function () {
    it("Should track cumulative statistics", async function () {
      // Perform various operations
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("market1"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("market2"));

      // Nullify 2 markets
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(hash1, 0, "Test");
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(hash2, 1, "Test");

      // Nullify 1 address
      await nullifierRegistry.connect(nullifierAdmin).nullifyAddress(
        blockedUser.address,
        "Test"
      );

      // Reinstate 1 market
      await nullifierRegistry.connect(nullifierAdmin).reinstateMarket(hash1, 0, "Test");

      // Check stats
      const [markets, addresses, nullifications, reinstatements, _] =
        await nullifierRegistry.getStats();

      expect(markets).to.equal(1); // 2 nullified - 1 reinstated
      expect(addresses).to.equal(1);
      expect(nullifications).to.equal(3); // 2 markets + 1 address
      expect(reinstatements).to.equal(1);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle nullification when registry is not set", async function () {
      // Deploy factory without nullifier registry
      const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
      const bareFactory = await ConditionalMarketFactory.deploy();
      await bareFactory.waitForDeployment();
      await bareFactory.setCTF1155(await ctf1155.getAddress());
      await bareFactory.setRoleManager(await roleManager.getAddress());

      // Create market
      const MARKET_MAKER_ROLE = await roleManager.MARKET_MAKER_ROLE();
      await bareFactory.connect(marketMaker).deployMarketPair(
        1,
        await collateralToken.getAddress(),
        ethers.parseEther("100"),
        ethers.parseEther("1"),
        10 * 24 * 60 * 60,
        0
      );

      // isMarketNullified should return false when registry not set
      expect(await bareFactory.isMarketNullified(0)).to.equal(false);
    });

    it("Should handle enforcement toggle correctly", async function () {
      // Create market
      await marketFactory.connect(marketMaker).deployMarketPair(
        10,
        await collateralToken.getAddress(),
        ethers.parseEther("100"),
        ethers.parseEther("1"),
        10 * 24 * 60 * 60,
        0
      );
      const marketId = 0;
      const marketHash = await marketFactory.computeMarketHash(marketId);

      // Nullify market
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(
        marketHash,
        marketId,
        "Test"
      );

      // Approve collateral for trader
      await collateralToken.connect(trader).approve(
        await marketFactory.getAddress(),
        ethers.parseEther("100")
      );

      // With enforcement OFF, trading should work
      expect(await marketFactory.enforceNullificationOnChain()).to.equal(false);
      await expect(
        marketFactory.connect(trader).buyTokens(marketId, true, ethers.parseEther("1"))
      ).to.not.be.reverted;

      // Turn enforcement ON
      await marketFactory.setNullificationEnforcement(true);

      // Now trading should fail
      await expect(
        marketFactory.connect(trader).buyTokens(marketId, true, ethers.parseEther("1"))
      ).to.be.revertedWith("Market is nullified");

      // Turn enforcement back OFF
      await marketFactory.setNullificationEnforcement(false);

      // Trading should work again
      await expect(
        marketFactory.connect(trader).buyTokens(marketId, true, ethers.parseEther("1"))
      ).to.not.be.reverted;
    });
  });
});
