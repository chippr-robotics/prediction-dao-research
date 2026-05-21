const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OracleRegistry", function () {
  let oracleRegistry;
  let mockAdapter1;
  let mockAdapter2;
  let owner;
  let user1;
  let user2;

  const ORACLE_ID_1 = ethers.keccak256(ethers.toUtf8Bytes("POLYMARKET"));
  const ORACLE_ID_2 = ethers.keccak256(ethers.toUtf8Bytes("CHAINLINK"));
  const ORACLE_ID_3 = ethers.keccak256(ethers.toUtf8Bytes("UMA"));
  const CONDITION_ID = ethers.keccak256(ethers.toUtf8Bytes("test-condition"));

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock adapters
    const MockOracleAdapter = await ethers.getContractFactory("MockOracleAdapter");
    mockAdapter1 = await MockOracleAdapter.deploy("Polymarket");
    mockAdapter2 = await MockOracleAdapter.deploy("Chainlink");

    // Deploy OracleRegistry
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    oracleRegistry = await OracleRegistry.deploy(owner.address);
  });

  describe("Constructor", function () {
    it("Should set the owner correctly", async function () {
      expect(await oracleRegistry.owner()).to.equal(owner.address);
    });

    it("Should start with no registered adapters", async function () {
      expect(await oracleRegistry.getAdapterCount()).to.equal(0);
    });
  });

  describe("registerAdapter", function () {
    it("Should register an adapter successfully", async function () {
      await expect(oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target))
        .to.emit(oracleRegistry, "AdapterRegistered")
        .withArgs(ORACLE_ID_1, mockAdapter1.target, "Polymarket");

      expect(await oracleRegistry.getAdapter(ORACLE_ID_1)).to.equal(mockAdapter1.target);
      expect(await oracleRegistry.getAdapterCount()).to.equal(1);
    });

    it("Should mark adapter as active after registration", async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      expect(await oracleRegistry.isAdapterActive(ORACLE_ID_1)).to.be.true;
    });

    it("Should revert when registering zero address", async function () {
      await expect(
        oracleRegistry.registerAdapter(ORACLE_ID_1, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(oracleRegistry, "InvalidAdapter");
    });

    it("Should revert when registering duplicate oracle ID", async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await expect(
        oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter2.target)
      ).to.be.revertedWithCustomError(oracleRegistry, "AdapterAlreadyRegistered");
    });

    it("Should only allow owner to register adapters", async function () {
      await expect(
        oracleRegistry.connect(user1).registerAdapter(ORACLE_ID_1, mockAdapter1.target)
      ).to.be.revertedWithCustomError(oracleRegistry, "OwnableUnauthorizedAccount");
    });

    it("Should allow registering multiple adapters", async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_2, mockAdapter2.target);

      expect(await oracleRegistry.getAdapterCount()).to.equal(2);
      expect(await oracleRegistry.getAdapter(ORACLE_ID_1)).to.equal(mockAdapter1.target);
      expect(await oracleRegistry.getAdapter(ORACLE_ID_2)).to.equal(mockAdapter2.target);
    });
  });

  describe("removeAdapter", function () {
    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_2, mockAdapter2.target);
    });

    it("Should remove an adapter successfully", async function () {
      await expect(oracleRegistry.removeAdapter(ORACLE_ID_1))
        .to.emit(oracleRegistry, "AdapterRemoved")
        .withArgs(ORACLE_ID_1, mockAdapter1.target);

      expect(await oracleRegistry.getAdapter(ORACLE_ID_1)).to.equal(ethers.ZeroAddress);
      expect(await oracleRegistry.getAdapterCount()).to.equal(1);
    });

    it("Should revert when removing non-existent adapter", async function () {
      await expect(
        oracleRegistry.removeAdapter(ORACLE_ID_3)
      ).to.be.revertedWithCustomError(oracleRegistry, "AdapterNotRegistered");
    });

    it("Should only allow owner to remove adapters", async function () {
      await expect(
        oracleRegistry.connect(user1).removeAdapter(ORACLE_ID_1)
      ).to.be.revertedWithCustomError(oracleRegistry, "OwnableUnauthorizedAccount");
    });

    it("Should handle removing first adapter correctly", async function () {
      await oracleRegistry.removeAdapter(ORACLE_ID_1);
      expect(await oracleRegistry.getAdapterCount()).to.equal(1);
      expect(await oracleRegistry.isAdapterActive(ORACLE_ID_1)).to.be.false;
      expect(await oracleRegistry.isAdapterActive(ORACLE_ID_2)).to.be.true;
    });

    it("Should handle removing last adapter correctly", async function () {
      await oracleRegistry.removeAdapter(ORACLE_ID_2);
      expect(await oracleRegistry.getAdapterCount()).to.equal(1);
      expect(await oracleRegistry.isAdapterActive(ORACLE_ID_1)).to.be.true;
      expect(await oracleRegistry.isAdapterActive(ORACLE_ID_2)).to.be.false;
    });
  });

  describe("verifyAdapter", function () {
    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
    });

    it("Should verify an adapter", async function () {
      await expect(oracleRegistry.verifyAdapter(mockAdapter1.target, true))
        .to.emit(oracleRegistry, "AdapterVerified")
        .withArgs(mockAdapter1.target, true);

      expect(await oracleRegistry.isAdapterVerified(ORACLE_ID_1)).to.be.true;
    });

    it("Should unverify an adapter", async function () {
      await oracleRegistry.verifyAdapter(mockAdapter1.target, true);
      await oracleRegistry.verifyAdapter(mockAdapter1.target, false);
      expect(await oracleRegistry.isAdapterVerified(ORACLE_ID_1)).to.be.false;
    });

    it("Should revert when verifying zero address", async function () {
      await expect(
        oracleRegistry.verifyAdapter(ethers.ZeroAddress, true)
      ).to.be.revertedWithCustomError(oracleRegistry, "InvalidAdapter");
    });

    it("Should only allow owner to verify adapters", async function () {
      await expect(
        oracleRegistry.connect(user1).verifyAdapter(mockAdapter1.target, true)
      ).to.be.revertedWithCustomError(oracleRegistry, "OwnableUnauthorizedAccount");
    });
  });

  describe("setAdapterStatus", function () {
    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
    });

    it("Should deactivate an adapter", async function () {
      await expect(oracleRegistry.setAdapterStatus(mockAdapter1.target, false))
        .to.emit(oracleRegistry, "AdapterStatusChanged")
        .withArgs(mockAdapter1.target, false);

      expect(await oracleRegistry.isAdapterActive(ORACLE_ID_1)).to.be.false;
    });

    it("Should reactivate an adapter", async function () {
      await oracleRegistry.setAdapterStatus(mockAdapter1.target, false);
      await oracleRegistry.setAdapterStatus(mockAdapter1.target, true);
      expect(await oracleRegistry.isAdapterActive(ORACLE_ID_1)).to.be.true;
    });

    it("Should revert when setting status for zero address", async function () {
      await expect(
        oracleRegistry.setAdapterStatus(ethers.ZeroAddress, true)
      ).to.be.revertedWithCustomError(oracleRegistry, "InvalidAdapter");
    });

    it("Should only allow owner to set adapter status", async function () {
      await expect(
        oracleRegistry.connect(user1).setAdapterStatus(mockAdapter1.target, false)
      ).to.be.revertedWithCustomError(oracleRegistry, "OwnableUnauthorizedAccount");
    });
  });

  describe("getAdapterInfo", function () {
    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
    });

    it("Should return adapter info for registered adapter", async function () {
      const [adapter, oracleType, isVerified, isActive] =
        await oracleRegistry.getAdapterInfo(ORACLE_ID_1);

      expect(adapter).to.equal(mockAdapter1.target);
      expect(oracleType).to.equal("Polymarket");
      expect(isVerified).to.be.false;
      expect(isActive).to.be.true;
    });

    it("Should return empty info for non-existent oracle ID", async function () {
      const [adapter, oracleType, isVerified, isActive] =
        await oracleRegistry.getAdapterInfo(ORACLE_ID_3);

      expect(adapter).to.equal(ethers.ZeroAddress);
      expect(oracleType).to.equal("");
      expect(isVerified).to.be.false;
      expect(isActive).to.be.false;
    });

    it("Should reflect verification status", async function () {
      await oracleRegistry.verifyAdapter(mockAdapter1.target, true);
      const [, , isVerified] = await oracleRegistry.getAdapterInfo(ORACLE_ID_1);
      expect(isVerified).to.be.true;
    });

    it("Should reflect active status", async function () {
      await oracleRegistry.setAdapterStatus(mockAdapter1.target, false);
      const [, , , isActive] = await oracleRegistry.getAdapterInfo(ORACLE_ID_1);
      expect(isActive).to.be.false;
    });
  });

  describe("getRegisteredOracleIds", function () {
    it("Should return empty array when no adapters registered", async function () {
      const ids = await oracleRegistry.getRegisteredOracleIds();
      expect(ids.length).to.equal(0);
    });

    it("Should return all registered oracle IDs", async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_2, mockAdapter2.target);

      const ids = await oracleRegistry.getRegisteredOracleIds();
      expect(ids.length).to.equal(2);
      expect(ids).to.include(ORACLE_ID_1);
      expect(ids).to.include(ORACLE_ID_2);
    });
  });

  describe("resolveCondition", function () {
    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      // Set up mock adapter to support and resolve condition
      await mockAdapter1.setConditionSupported(CONDITION_ID, true);
      await mockAdapter1.setConditionResolved(CONDITION_ID, true);
      await mockAdapter1.setOutcome(CONDITION_ID, true, 10000, Math.floor(Date.now() / 1000));
    });

    it("Should resolve condition through registry", async function () {
      const [outcome, confidence] = await oracleRegistry.resolveCondition(ORACLE_ID_1, CONDITION_ID);
      expect(outcome).to.be.true;
      expect(confidence).to.equal(10000);
    });

    it("Should revert for non-existent oracle ID", async function () {
      await expect(
        oracleRegistry.resolveCondition(ORACLE_ID_3, CONDITION_ID)
      ).to.be.revertedWithCustomError(oracleRegistry, "AdapterNotRegistered");
    });

    it("Should revert for inactive adapter", async function () {
      await oracleRegistry.setAdapterStatus(mockAdapter1.target, false);
      await expect(
        oracleRegistry.resolveCondition(ORACLE_ID_1, CONDITION_ID)
      ).to.be.revertedWithCustomError(oracleRegistry, "AdapterNotRegistered");
    });

    it("Should revert for unresolved condition", async function () {
      await mockAdapter1.setConditionResolved(CONDITION_ID, false);
      await expect(
        oracleRegistry.resolveCondition(ORACLE_ID_1, CONDITION_ID)
      ).to.be.revertedWithCustomError(oracleRegistry, "ConditionNotResolved");
    });
  });

  describe("findAdaptersForCondition", function () {
    beforeEach(async function () {
      await oracleRegistry.registerAdapter(ORACLE_ID_1, mockAdapter1.target);
      await oracleRegistry.registerAdapter(ORACLE_ID_2, mockAdapter2.target);
    });

    it("Should find all adapters that support a condition", async function () {
      await mockAdapter1.setConditionSupported(CONDITION_ID, true);
      await mockAdapter2.setConditionSupported(CONDITION_ID, true);

      const adapters = await oracleRegistry.findAdaptersForCondition(CONDITION_ID);
      expect(adapters.length).to.equal(2);
      expect(adapters).to.include(mockAdapter1.target);
      expect(adapters).to.include(mockAdapter2.target);
    });

    it("Should only return active adapters", async function () {
      await mockAdapter1.setConditionSupported(CONDITION_ID, true);
      await mockAdapter2.setConditionSupported(CONDITION_ID, true);
      await oracleRegistry.setAdapterStatus(mockAdapter1.target, false);

      const adapters = await oracleRegistry.findAdaptersForCondition(CONDITION_ID);
      expect(adapters.length).to.equal(1);
      expect(adapters[0]).to.equal(mockAdapter2.target);
    });

    it("Should return empty array when no adapters support condition", async function () {
      const adapters = await oracleRegistry.findAdaptersForCondition(CONDITION_ID);
      expect(adapters.length).to.equal(0);
    });
  });
});
