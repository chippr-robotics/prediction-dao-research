const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NullifierRegistry", function () {
  let nullifierRegistry;
  let roleManager;
  let owner;
  let admin;
  let nullifierAdmin;
  let user1;
  let user2;

  // Sample RSA parameters (2048-bit test values - NOT for production)
  // In production, use properly generated RSA modulus from trusted setup
  const TEST_RSA_N = "0x" + "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".repeat(8);
  const TEST_RSA_G = "0x" + "0000000000000000000000000000000000000000000000000000000000000002".repeat(8);
  const INITIAL_ACCUMULATOR = TEST_RSA_G; // Start with generator

  // Helper to convert to 256 bytes for RSA params
  const padTo256Bytes = (hex) => {
    const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
    return "0x" + stripped.padStart(512, "0");
  };

  // Test market hash
  const testMarketHash = ethers.keccak256(ethers.toUtf8Bytes("test_market_1"));
  const testMarketHash2 = ethers.keccak256(ethers.toUtf8Bytes("test_market_2"));

  beforeEach(async function () {
    [owner, admin, nullifierAdmin, user1, user2] = await ethers.getSigners();

    // Deploy MinimalRoleManager
    const MinimalRoleManager = await ethers.getContractFactory("MinimalRoleManager");
    roleManager = await MinimalRoleManager.deploy();
    await roleManager.waitForDeployment();

    // Deploy NullifierRegistry
    const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
    nullifierRegistry = await NullifierRegistry.deploy();
    await nullifierRegistry.waitForDeployment();

    // Get NULLIFIER_ADMIN_ROLE hash
    const NULLIFIER_ADMIN_ROLE = await nullifierRegistry.NULLIFIER_ADMIN_ROLE();

    // Grant NULLIFIER_ADMIN_ROLE to nullifierAdmin
    await nullifierRegistry.grantRole(NULLIFIER_ADMIN_ROLE, nullifierAdmin.address);
  });

  describe("Deployment", function () {
    it("Should deploy with correct initial state", async function () {
      expect(await nullifierRegistry.paramsInitialized()).to.equal(false);
      expect(await nullifierRegistry.nullifiedMarketCount()).to.equal(0);
      expect(await nullifierRegistry.nullifiedAddressCount()).to.equal(0);
      expect(await nullifierRegistry.paused()).to.equal(false);
    });

    it("Should set owner as DEFAULT_ADMIN_ROLE", async function () {
      const DEFAULT_ADMIN_ROLE = await nullifierRegistry.DEFAULT_ADMIN_ROLE();
      expect(await nullifierRegistry.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("RSA Parameter Initialization", function () {
    it("Should allow admin to initialize RSA parameters", async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);

      await expect(nullifierRegistry.initializeParams(n, g, acc))
        .to.emit(nullifierRegistry, "RSAParamsInitialized");

      expect(await nullifierRegistry.paramsInitialized()).to.equal(true);
    });

    it("Should reject double initialization", async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);

      await nullifierRegistry.initializeParams(n, g, acc);

      await expect(nullifierRegistry.initializeParams(n, g, acc))
        .to.be.revertedWithCustomError(nullifierRegistry, "ParamsAlreadyInitialized");
    });

    it("Should reject non-admin initialization", async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);

      await expect(nullifierRegistry.connect(user1).initializeParams(n, g, acc))
        .to.be.reverted;
    });

    it("Should reject invalid modulus length", async function () {
      const shortN = "0x1234";
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);

      await expect(nullifierRegistry.initializeParams(shortN, g, acc))
        .to.be.revertedWithCustomError(nullifierRegistry, "InvalidRSAModulus");
    });
  });

  describe("Market Nullification", function () {
    beforeEach(async function () {
      // Initialize RSA params
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);
      await nullifierRegistry.initializeParams(n, g, acc);
    });

    it("Should allow nullifier admin to nullify a market", async function () {
      await expect(
        nullifierRegistry.connect(nullifierAdmin).nullifyMarket(testMarketHash, 1, "Test reason")
      )
        .to.emit(nullifierRegistry, "MarketNullified")
        .withArgs(testMarketHash, 1, nullifierAdmin.address, expect.anything, "Test reason");

      expect(await nullifierRegistry.isMarketNullified(testMarketHash)).to.equal(true);
      expect(await nullifierRegistry.nullifiedMarketCount()).to.equal(1);
    });

    it("Should reject non-admin market nullification", async function () {
      await expect(
        nullifierRegistry.connect(user1).nullifyMarket(testMarketHash, 1, "Test reason")
      ).to.be.reverted;
    });

    it("Should reject double nullification", async function () {
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(testMarketHash, 1, "Test reason");

      await expect(
        nullifierRegistry.connect(nullifierAdmin).nullifyMarket(testMarketHash, 1, "Duplicate")
      ).to.be.revertedWithCustomError(nullifierRegistry, "MarketAlreadyNullified");
    });

    it("Should track nullification details", async function () {
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(testMarketHash, 1, "Test reason");

      const [nullified, timestamp, admin] = await nullifierRegistry.getMarketNullificationDetails(testMarketHash);

      expect(nullified).to.equal(true);
      expect(timestamp).to.be.gt(0);
      expect(admin).to.equal(nullifierAdmin.address);
    });
  });

  describe("Market Reinstatement", function () {
    beforeEach(async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);
      await nullifierRegistry.initializeParams(n, g, acc);

      // Nullify a market first
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(testMarketHash, 1, "Test reason");
    });

    it("Should allow reinstatement of nullified market", async function () {
      await expect(
        nullifierRegistry.connect(nullifierAdmin).reinstateMarket(testMarketHash, 1, "Reinstate reason")
      )
        .to.emit(nullifierRegistry, "MarketReinstated")
        .withArgs(testMarketHash, 1, nullifierAdmin.address, expect.anything, "Reinstate reason");

      expect(await nullifierRegistry.isMarketNullified(testMarketHash)).to.equal(false);
      expect(await nullifierRegistry.nullifiedMarketCount()).to.equal(0);
    });

    it("Should reject reinstatement of non-nullified market", async function () {
      await expect(
        nullifierRegistry.connect(nullifierAdmin).reinstateMarket(testMarketHash2, 2, "Invalid")
      ).to.be.revertedWithCustomError(nullifierRegistry, "MarketNotNullified");
    });

    it("Should clear nullification details after reinstatement", async function () {
      await nullifierRegistry.connect(nullifierAdmin).reinstateMarket(testMarketHash, 1, "Reinstate");

      const [nullified, timestamp, admin] = await nullifierRegistry.getMarketNullificationDetails(testMarketHash);

      expect(nullified).to.equal(false);
      expect(timestamp).to.equal(0);
      expect(admin).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Address Nullification", function () {
    beforeEach(async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);
      await nullifierRegistry.initializeParams(n, g, acc);
    });

    it("Should allow nullifier admin to nullify an address", async function () {
      await expect(
        nullifierRegistry.connect(nullifierAdmin).nullifyAddress(user1.address, "Bad actor")
      )
        .to.emit(nullifierRegistry, "AddressNullified")
        .withArgs(user1.address, nullifierAdmin.address, expect.anything, "Bad actor");

      expect(await nullifierRegistry.isAddressNullified(user1.address)).to.equal(true);
      expect(await nullifierRegistry.nullifiedAddressCount()).to.equal(1);
    });

    it("Should reject nullification of zero address", async function () {
      await expect(
        nullifierRegistry.connect(nullifierAdmin).nullifyAddress(ethers.ZeroAddress, "Zero")
      ).to.be.revertedWithCustomError(nullifierRegistry, "InvalidAddress");
    });

    it("Should reject double nullification of address", async function () {
      await nullifierRegistry.connect(nullifierAdmin).nullifyAddress(user1.address, "Bad actor");

      await expect(
        nullifierRegistry.connect(nullifierAdmin).nullifyAddress(user1.address, "Duplicate")
      ).to.be.revertedWithCustomError(nullifierRegistry, "AddressAlreadyNullified");
    });
  });

  describe("Address Reinstatement", function () {
    beforeEach(async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);
      await nullifierRegistry.initializeParams(n, g, acc);

      await nullifierRegistry.connect(nullifierAdmin).nullifyAddress(user1.address, "Bad actor");
    });

    it("Should allow reinstatement of nullified address", async function () {
      await expect(
        nullifierRegistry.connect(nullifierAdmin).reinstateAddress(user1.address, "Appeal approved")
      )
        .to.emit(nullifierRegistry, "AddressReinstated")
        .withArgs(user1.address, nullifierAdmin.address, expect.anything, "Appeal approved");

      expect(await nullifierRegistry.isAddressNullified(user1.address)).to.equal(false);
      expect(await nullifierRegistry.nullifiedAddressCount()).to.equal(0);
    });

    it("Should reject reinstatement of non-nullified address", async function () {
      await expect(
        nullifierRegistry.connect(nullifierAdmin).reinstateAddress(user2.address, "Invalid")
      ).to.be.revertedWithCustomError(nullifierRegistry, "AddressNotNullified");
    });
  });

  describe("Batch Operations", function () {
    beforeEach(async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);
      await nullifierRegistry.initializeParams(n, g, acc);
    });

    it("Should batch nullify multiple markets", async function () {
      const hashes = [testMarketHash, testMarketHash2];
      const ids = [1, 2];

      await expect(
        nullifierRegistry.connect(nullifierAdmin).batchNullifyMarkets(hashes, ids, "Batch action")
      )
        .to.emit(nullifierRegistry, "BatchMarketsNullified")
        .withArgs(hashes, nullifierAdmin.address, expect.anything);

      expect(await nullifierRegistry.isMarketNullified(testMarketHash)).to.equal(true);
      expect(await nullifierRegistry.isMarketNullified(testMarketHash2)).to.equal(true);
      expect(await nullifierRegistry.nullifiedMarketCount()).to.equal(2);
    });

    it("Should batch nullify multiple addresses", async function () {
      const addrs = [user1.address, user2.address];

      await expect(
        nullifierRegistry.connect(nullifierAdmin).batchNullifyAddresses(addrs, "Batch action")
      )
        .to.emit(nullifierRegistry, "BatchAddressesNullified")
        .withArgs(addrs, nullifierAdmin.address, expect.anything);

      expect(await nullifierRegistry.isAddressNullified(user1.address)).to.equal(true);
      expect(await nullifierRegistry.isAddressNullified(user2.address)).to.equal(true);
      expect(await nullifierRegistry.nullifiedAddressCount()).to.equal(2);
    });

    it("Should reject batch operations exceeding max size", async function () {
      // Create 51 addresses (exceeds MAX_BATCH_SIZE of 50)
      const addrs = [];
      for (let i = 0; i < 51; i++) {
        addrs.push(ethers.Wallet.createRandom().address);
      }

      await expect(
        nullifierRegistry.connect(nullifierAdmin).batchNullifyAddresses(addrs, "Too many")
      ).to.be.revertedWithCustomError(nullifierRegistry, "BatchTooLarge");
    });

    it("Should reject empty batch operations", async function () {
      await expect(
        nullifierRegistry.connect(nullifierAdmin).batchNullifyMarkets([], [], "Empty")
      ).to.be.revertedWithCustomError(nullifierRegistry, "EmptyBatch");
    });
  });

  describe("Accumulator Updates", function () {
    beforeEach(async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);
      await nullifierRegistry.initializeParams(n, g, acc);
    });

    it("Should allow admin to update accumulator", async function () {
      const newAcc = padTo256Bytes("0x" + "1234567890abcdef".repeat(32));

      await expect(
        nullifierRegistry.connect(nullifierAdmin).updateAccumulator(newAcc)
      )
        .to.emit(nullifierRegistry, "AccumulatorUpdated")
        .withArgs(newAcc, expect.anything, nullifierAdmin.address);

      const storedAcc = await nullifierRegistry.getAccumulator();
      expect(storedAcc.toLowerCase()).to.equal(newAcc.toLowerCase());
    });

    it("Should reject accumulator update before initialization", async function () {
      // Deploy new instance without initializing
      const NullifierRegistry = await ethers.getContractFactory("NullifierRegistry");
      const newRegistry = await NullifierRegistry.deploy();
      await newRegistry.waitForDeployment();

      const NULLIFIER_ADMIN_ROLE = await newRegistry.NULLIFIER_ADMIN_ROLE();
      await newRegistry.grantRole(NULLIFIER_ADMIN_ROLE, nullifierAdmin.address);

      const newAcc = padTo256Bytes("0x" + "1234567890abcdef".repeat(32));

      await expect(
        newRegistry.connect(nullifierAdmin).updateAccumulator(newAcc)
      ).to.be.revertedWithCustomError(newRegistry, "ParamsNotInitialized");
    });
  });

  describe("Pagination", function () {
    beforeEach(async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);
      await nullifierRegistry.initializeParams(n, g, acc);

      // Add multiple nullified items
      for (let i = 0; i < 5; i++) {
        const hash = ethers.keccak256(ethers.toUtf8Bytes(`market_${i}`));
        await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(hash, i, "Test");
      }
    });

    it("Should paginate nullified markets", async function () {
      const [firstPage, hasMore1] = await nullifierRegistry.getNullifiedMarkets(0, 3);
      expect(firstPage.length).to.equal(3);
      expect(hasMore1).to.equal(true);

      const [secondPage, hasMore2] = await nullifierRegistry.getNullifiedMarkets(3, 3);
      expect(secondPage.length).to.equal(2);
      expect(hasMore2).to.equal(false);
    });

    it("Should return empty array for out-of-bounds offset", async function () {
      const [markets, hasMore] = await nullifierRegistry.getNullifiedMarkets(100, 10);
      expect(markets.length).to.equal(0);
      expect(hasMore).to.equal(false);
    });
  });

  describe("Statistics", function () {
    beforeEach(async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);
      await nullifierRegistry.initializeParams(n, g, acc);
    });

    it("Should track statistics correctly", async function () {
      // Nullify 2 markets
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(testMarketHash, 1, "Test");
      await nullifierRegistry.connect(nullifierAdmin).nullifyMarket(testMarketHash2, 2, "Test");

      // Nullify 1 address
      await nullifierRegistry.connect(nullifierAdmin).nullifyAddress(user1.address, "Test");

      // Reinstate 1 market
      await nullifierRegistry.connect(nullifierAdmin).reinstateMarket(testMarketHash, 1, "Reinstate");

      const [markets, addresses, nullifications, reinstatements, lastUpdate] =
        await nullifierRegistry.getStats();

      expect(markets).to.equal(1); // 2 - 1 reinstated
      expect(addresses).to.equal(1);
      expect(nullifications).to.equal(3); // 2 markets + 1 address
      expect(reinstatements).to.equal(1);
      expect(lastUpdate).to.be.gt(0);
    });
  });

  describe("Prime Computation", function () {
    it("Should compute market prime deterministically", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const prime1 = await nullifierRegistry.computeMarketPrime(hash);
      const prime2 = await nullifierRegistry.computeMarketPrime(hash);

      expect(prime1).to.equal(prime2);
      expect(prime1).to.be.gt(0);
    });

    it("Should compute address prime deterministically", async function () {
      const prime1 = await nullifierRegistry.computeAddressPrime(user1.address);
      const prime2 = await nullifierRegistry.computeAddressPrime(user1.address);

      expect(prime1).to.equal(prime2);
      expect(prime1).to.be.gt(0);
    });

    it("Should compute different primes for different inputs", async function () {
      const prime1 = await nullifierRegistry.computeAddressPrime(user1.address);
      const prime2 = await nullifierRegistry.computeAddressPrime(user2.address);

      expect(prime1).to.not.equal(prime2);
    });
  });

  describe("Pausable", function () {
    beforeEach(async function () {
      const n = padTo256Bytes(TEST_RSA_N);
      const g = padTo256Bytes(TEST_RSA_G);
      const acc = padTo256Bytes(INITIAL_ACCUMULATOR);
      await nullifierRegistry.initializeParams(n, g, acc);
    });

    it("Should allow admin to pause", async function () {
      await nullifierRegistry.pause();
      expect(await nullifierRegistry.paused()).to.equal(true);
    });

    it("Should block operations when paused", async function () {
      await nullifierRegistry.pause();

      await expect(
        nullifierRegistry.connect(nullifierAdmin).nullifyMarket(testMarketHash, 1, "Test")
      ).to.be.revertedWithCustomError(nullifierRegistry, "EnforcedPause");
    });

    it("Should allow admin to unpause", async function () {
      await nullifierRegistry.pause();
      await nullifierRegistry.unpause();

      expect(await nullifierRegistry.paused()).to.equal(false);

      // Should work again after unpause
      await expect(
        nullifierRegistry.connect(nullifierAdmin).nullifyMarket(testMarketHash, 1, "Test")
      ).to.emit(nullifierRegistry, "MarketNullified");
    });
  });
});
