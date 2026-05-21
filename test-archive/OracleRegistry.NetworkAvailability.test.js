const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Network Availability Tests for OracleRegistry
 *
 * Tests the network-aware oracle functionality:
 * - isOracleAvailable() for checking oracle deployment status
 * - getAvailableOracles() for listing usable oracles
 * - getNetworkOracleStatus() for comprehensive status
 *
 * These functions allow applications to detect whether external oracles
 * (Polymarket, UMA, Chainlink) are available on the current network.
 */
describe("OracleRegistry - Network Availability", function () {
  let oracleRegistry;
  let mockAdapter1;
  let mockAdapter2;
  let mockAdapter3;
  let owner;
  let user;

  const ORACLE_ID_1 = ethers.keccak256(ethers.toUtf8Bytes("CHAINLINK"));
  const ORACLE_ID_2 = ethers.keccak256(ethers.toUtf8Bytes("UMA"));
  const ORACLE_ID_3 = ethers.keccak256(ethers.toUtf8Bytes("POLYMARKET"));

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy mock adapters
    const MockOracleAdapter = await ethers.getContractFactory("MockOracleAdapter");
    mockAdapter1 = await MockOracleAdapter.deploy("Chainlink");
    mockAdapter2 = await MockOracleAdapter.deploy("UMA");
    mockAdapter3 = await MockOracleAdapter.deploy("Polymarket");

    // Deploy OracleRegistry
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    oracleRegistry = await OracleRegistry.deploy(owner.address);
  });

  describe("isOracleAvailable", function () {
    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_2, mockAdapter2.target);
    });

    it("Should return true for available oracle", async function () {
      // Mock adapter defaults to available
      expect(await oracleRegistry.isOracleAvailable(ORACLE_ID_1)).to.be.true;
    });

    it("Should return false for unavailable oracle", async function () {
      // Set adapter as unavailable
      await mockAdapter1.setAvailable(false);
      expect(await oracleRegistry.isOracleAvailable(ORACLE_ID_1)).to.be.false;
    });

    it("Should return false for unregistered oracle", async function () {
      expect(await oracleRegistry.isOracleAvailable(ORACLE_ID_3)).to.be.false;
    });

    it("Should return false for inactive oracle", async function () {
      await oracleRegistry.setAdapterStatus(mockAdapter1.target, false);
      expect(await oracleRegistry.isOracleAvailable(ORACLE_ID_1)).to.be.false;
    });
  });

  describe("getAvailableOracles", function () {
    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_2, mockAdapter2.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_3, mockAdapter3.target);
    });

    it("Should return all available oracles", async function () {
      const [oracleIds, adapters] = await oracleRegistry.getAvailableOracles();

      expect(oracleIds.length).to.equal(3);
      expect(adapters.length).to.equal(3);
      expect(oracleIds).to.include(ORACLE_ID_1);
      expect(oracleIds).to.include(ORACLE_ID_2);
      expect(oracleIds).to.include(ORACLE_ID_3);
    });

    it("Should exclude unavailable oracles", async function () {
      await mockAdapter1.setAvailable(false);
      await mockAdapter3.setAvailable(false);

      const [oracleIds, adapters] = await oracleRegistry.getAvailableOracles();

      expect(oracleIds.length).to.equal(1);
      expect(oracleIds[0]).to.equal(ORACLE_ID_2);
      expect(adapters[0]).to.equal(mockAdapter2.target);
    });

    it("Should exclude inactive oracles", async function () {
      await oracleRegistry.setAdapterStatus(mockAdapter2.target, false);

      const [oracleIds, adapters] = await oracleRegistry.getAvailableOracles();

      expect(oracleIds.length).to.equal(2);
      expect(oracleIds).to.not.include(ORACLE_ID_2);
    });

    it("Should return empty arrays when no oracles available", async function () {
      await mockAdapter1.setAvailable(false);
      await mockAdapter2.setAvailable(false);
      await mockAdapter3.setAvailable(false);

      const [oracleIds, adapters] = await oracleRegistry.getAvailableOracles();

      expect(oracleIds.length).to.equal(0);
      expect(adapters.length).to.equal(0);
    });
  });

  describe("getNetworkOracleStatus", function () {
    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_2, mockAdapter2.target);
    });

    it("Should return status for all registered oracles", async function () {
      const [oracleIds, oracleTypes, availabilities, chainIds] =
        await oracleRegistry.getNetworkOracleStatus();

      expect(oracleIds.length).to.equal(2);
      expect(oracleTypes[0]).to.equal("Chainlink");
      expect(oracleTypes[1]).to.equal("UMA");
      expect(availabilities[0]).to.be.true;
      expect(availabilities[1]).to.be.true;
    });

    it("Should reflect availability changes", async function () {
      await mockAdapter1.setAvailable(false);

      const [, , availabilities, ] =
        await oracleRegistry.getNetworkOracleStatus();

      expect(availabilities[0]).to.be.false;
      expect(availabilities[1]).to.be.true;
    });

    it("Should return chain IDs", async function () {
      const expectedChainId = 1337n; // Hardhat default

      const [, , , chainIds] = await oracleRegistry.getNetworkOracleStatus();

      expect(chainIds[0]).to.equal(expectedChainId);
      expect(chainIds[1]).to.equal(expectedChainId);
    });

    it("Should handle custom chain IDs", async function () {
      await mockAdapter1.setChainId(137); // Polygon
      await mockAdapter2.setChainId(1); // Mainnet

      const [, , , chainIds] = await oracleRegistry.getNetworkOracleStatus();

      expect(chainIds[0]).to.equal(137n);
      expect(chainIds[1]).to.equal(1n);
    });
  });

  describe("resolveConditionIfAvailable", function () {
    let conditionId;

    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      conditionId = ethers.keccak256(ethers.toUtf8Bytes("test-condition"));

      // Set up condition
      await mockAdapter1.setConditionSupported(conditionId, true);
      await mockAdapter1.setOutcome(conditionId, true, 10000, Date.now());
    });

    it("Should resolve when oracle is available", async function () {
      const [outcome, confidence] =
        await oracleRegistry.resolveConditionIfAvailable(ORACLE_ID_1, conditionId);

      expect(outcome).to.be.true;
      expect(confidence).to.equal(10000);
    });

    it("Should revert when oracle is unavailable", async function () {
      await mockAdapter1.setAvailable(false);

      await expect(
        oracleRegistry.resolveConditionIfAvailable(ORACLE_ID_1, conditionId)
      ).to.be.revertedWithCustomError(oracleRegistry, "OracleNotAvailable");
    });

    it("Should revert when condition not resolved", async function () {
      await mockAdapter1.setConditionResolved(conditionId, false);

      await expect(
        oracleRegistry.resolveConditionIfAvailable(ORACLE_ID_1, conditionId)
      ).to.be.revertedWithCustomError(oracleRegistry, "ConditionNotResolved");
    });

    it("Should revert for unregistered adapter", async function () {
      await expect(
        oracleRegistry.resolveConditionIfAvailable(ORACLE_ID_2, conditionId)
      ).to.be.revertedWithCustomError(oracleRegistry, "AdapterNotRegistered");
    });
  });

  describe("Mordor Testnet Simulation", function () {
    it("Should correctly identify unavailable external oracles", async function () {
      // Simulate Mordor deployment where external oracles aren't available
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_2, mockAdapter2.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_3, mockAdapter3.target);

      // Mark UMA and Polymarket as unavailable (not deployed on Mordor)
      await mockAdapter2.setAvailable(false);
      await mockAdapter3.setAvailable(false);

      // Check availability
      expect(await oracleRegistry.isOracleAvailable(ORACLE_ID_1)).to.be.true;
      expect(await oracleRegistry.isOracleAvailable(ORACLE_ID_2)).to.be.false;
      expect(await oracleRegistry.isOracleAvailable(ORACLE_ID_3)).to.be.false;

      // Get only available oracles
      const [availableIds, ] = await oracleRegistry.getAvailableOracles();
      expect(availableIds.length).to.equal(1);
      expect(availableIds[0]).to.equal(ORACLE_ID_1);
    });

    it("Should provide full status for UI display", async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_2, mockAdapter2.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_3, mockAdapter3.target);

      // Simulate Mordor state
      await mockAdapter1.setAvailable(true);   // Mock adapter works
      await mockAdapter2.setAvailable(false);  // UMA not on Mordor
      await mockAdapter3.setAvailable(false);  // Polymarket not on Mordor

      const [oracleIds, oracleTypes, availabilities, chainIds] =
        await oracleRegistry.getNetworkOracleStatus();

      // Application can use this to show:
      // - Chainlink: Available
      // - UMA: Not available on this network
      // - Polymarket: Not available on this network
      expect(availabilities[0]).to.be.true;
      expect(availabilities[1]).to.be.false;
      expect(availabilities[2]).to.be.false;
    });
  });

  describe("Adapter Interface", function () {
    it("MockOracleAdapter should implement isAvailable()", async function () {
      expect(await mockAdapter1.isAvailable()).to.be.true;
      await mockAdapter1.setAvailable(false);
      expect(await mockAdapter1.isAvailable()).to.be.false;
    });

    it("MockOracleAdapter should implement getConfiguredChainId()", async function () {
      const chainId = await mockAdapter1.getConfiguredChainId();
      expect(chainId).to.equal(1337n); // Hardhat default
    });
  });
});
