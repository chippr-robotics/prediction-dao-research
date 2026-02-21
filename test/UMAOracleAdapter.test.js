const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("UMAOracleAdapter", function () {
  let umaAdapter;
  let mockUmaOracle;
  let mockToken;
  let owner;
  let user1;
  let user2;

  const DEFAULT_BOND = ethers.parseEther("0.1");
  const DEFAULT_LIVENESS = 2 * 60 * 60; // 2 hours

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock ERC20 token for bonds
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Mock USDC", "USDC", 0);

    // Mint tokens to users
    await mockToken.mint(owner.address, ethers.parseEther("1000"));
    await mockToken.mint(user1.address, ethers.parseEther("1000"));
    await mockToken.mint(user2.address, ethers.parseEther("1000"));

    // Deploy mock UMA Oracle
    const MockUMAOptimisticOracle = await ethers.getContractFactory("MockUMAOptimisticOracle");
    mockUmaOracle = await MockUMAOptimisticOracle.deploy();

    // Deploy UMAOracleAdapter
    const UMAOracleAdapter = await ethers.getContractFactory("UMAOracleAdapter");
    umaAdapter = await UMAOracleAdapter.deploy(
      owner.address,
      mockUmaOracle.target,
      mockToken.target
    );

    // Approve adapter to spend tokens
    await mockToken.approve(umaAdapter.target, ethers.parseEther("100"));
    await mockToken.connect(user1).approve(umaAdapter.target, ethers.parseEther("100"));
    await mockToken.connect(user2).approve(umaAdapter.target, ethers.parseEther("100"));
  });

  describe("Constructor", function () {
    it("Should set the owner correctly", async function () {
      expect(await umaAdapter.owner()).to.equal(owner.address);
    });

    it("Should return correct oracle type", async function () {
      expect(await umaAdapter.oracleType()).to.equal("UMA");
    });

    it("Should have correct default bond and liveness", async function () {
      expect(await umaAdapter.defaultBond()).to.equal(DEFAULT_BOND);
      expect(await umaAdapter.defaultLiveness()).to.equal(DEFAULT_LIVENESS);
    });

    it("Should revert with zero oracle address", async function () {
      const UMAOracleAdapter = await ethers.getContractFactory("UMAOracleAdapter");
      await expect(
        UMAOracleAdapter.deploy(owner.address, ethers.ZeroAddress, mockToken.target)
      ).to.be.revertedWithCustomError(umaAdapter, "InvalidOracleAddress");
    });
  });

  describe("Configuration", function () {
    it("Should update config", async function () {
      const newBond = ethers.parseEther("0.5");
      const newLiveness = 4 * 60 * 60; // 4 hours

      await expect(umaAdapter.setConfig(newBond, newLiveness))
        .to.emit(umaAdapter, "ConfigUpdated")
        .withArgs(newBond, newLiveness);

      expect(await umaAdapter.defaultBond()).to.equal(newBond);
      expect(await umaAdapter.defaultLiveness()).to.equal(newLiveness);
    });

    it("Should only allow owner to update config", async function () {
      await expect(
        umaAdapter.connect(user1).setConfig(ethers.parseEther("1"), 3600)
      ).to.be.revertedWithCustomError(umaAdapter, "OwnableUnauthorizedAccount");
    });

    it("Should update UMA Oracle address", async function () {
      const MockUMAOptimisticOracle = await ethers.getContractFactory("MockUMAOptimisticOracle");
      const newOracle = await MockUMAOptimisticOracle.deploy();

      await umaAdapter.setUMAOracle(newOracle.target);
      expect(await umaAdapter.umaOracle()).to.equal(newOracle.target);
    });
  });

  describe("Condition Creation", function () {
    const description = "Lakers will win the 2025 NBA Finals";
    const futureDeadline = () => Math.floor(Date.now() / 1000) + 86400;

    it("Should create a condition", async function () {
      const deadline = futureDeadline();

      const tx = await umaAdapter.createCondition(description, deadline);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "ConditionCreated";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      const parsedEvent = umaAdapter.interface.parseLog(event);
      expect(parsedEvent.args.description).to.equal(description);
      expect(parsedEvent.args.deadline).to.equal(deadline);
    });

    it("Should revert for deadline in past", async function () {
      const pastDeadline = Math.floor(Date.now() / 1000) - 3600;
      await expect(
        umaAdapter.createCondition(description, pastDeadline)
      ).to.be.revertedWithCustomError(umaAdapter, "DeadlineInPast");
    });

    it("Should return condition details", async function () {
      const deadline = futureDeadline();
      const tx = await umaAdapter.createCondition(description, deadline);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "ConditionCreated";
        } catch { return false; }
      });
      const conditionId = umaAdapter.interface.parseLog(event).args.conditionId;

      const condition = await umaAdapter.getCondition(conditionId);
      expect(condition.description).to.equal(description);
      expect(condition.deadline).to.equal(deadline);
      expect(condition.assertionId).to.equal(ethers.ZeroHash);
      expect(condition.registered).to.be.true;
    });
  });

  describe("Assertion", function () {
    let conditionId;

    beforeEach(async function () {
      const deadline = (await time.latest()) + 86400;
      const tx = await umaAdapter.createCondition("Test condition", deadline);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "ConditionCreated";
        } catch { return false; }
      });
      conditionId = umaAdapter.interface.parseLog(event).args.conditionId;
    });

    it("Should revert assertion before deadline", async function () {
      await expect(
        umaAdapter.assertOutcome(conditionId, true)
      ).to.be.revertedWithCustomError(umaAdapter, "DeadlineNotReached");
    });

    it("Should allow assertion after deadline", async function () {
      await time.increase(86401);

      // Approve tokens for bond
      await mockToken.approve(umaAdapter.target, DEFAULT_BOND);

      const tx = await umaAdapter.assertOutcome(conditionId, true);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "AssertionMade";
        } catch { return false; }
      });

      expect(event).to.not.be.undefined;
      const parsedEvent = umaAdapter.interface.parseLog(event);
      expect(parsedEvent.args.conditionId).to.equal(conditionId);
      expect(parsedEvent.args.outcome).to.be.true;
    });

    it("Should revert double assertion", async function () {
      await time.increase(86401);
      await umaAdapter.assertOutcome(conditionId, true);

      await expect(
        umaAdapter.assertOutcome(conditionId, true)
      ).to.be.revertedWithCustomError(umaAdapter, "ConditionAlreadyAsserted");
    });

    it("Should check if condition can be asserted", async function () {
      expect(await umaAdapter.canAssert(conditionId)).to.be.false;

      await time.increase(86401);
      expect(await umaAdapter.canAssert(conditionId)).to.be.true;

      await umaAdapter.assertOutcome(conditionId, true);
      expect(await umaAdapter.canAssert(conditionId)).to.be.false;
    });
  });

  describe("Settlement", function () {
    let conditionId;
    let assertionId;

    beforeEach(async function () {
      const deadline = (await time.latest()) + 86400;
      let tx = await umaAdapter.createCondition("Test condition", deadline);
      let receipt = await tx.wait();

      let event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "ConditionCreated";
        } catch { return false; }
      });
      conditionId = umaAdapter.interface.parseLog(event).args.conditionId;

      // Advance time and make assertion
      await time.increase(86401);
      tx = await umaAdapter.assertOutcome(conditionId, true);
      receipt = await tx.wait();

      event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "AssertionMade";
        } catch { return false; }
      });
      assertionId = umaAdapter.interface.parseLog(event).args.assertionId;
    });

    it("Should settle undisputed assertion after liveness", async function () {
      // Fast-forward past liveness period
      await time.increase(DEFAULT_LIVENESS + 1);

      await umaAdapter.settleCondition(conditionId);

      const resolution = await umaAdapter.getResolution(conditionId);
      expect(resolution.resolved).to.be.true;
      expect(resolution.outcome).to.be.true;
      expect(resolution.confidence).to.equal(10000);
    });

    it("Should handle disputed assertion", async function () {
      // Approve tokens for disputer bond
      await mockToken.connect(user1).approve(mockUmaOracle.target, DEFAULT_BOND);

      // Dispute the assertion
      await mockUmaOracle.connect(user1).disputeAssertion(assertionId, user1.address);

      // Set dispute result (simulates DVM resolution)
      await mockUmaOracle.setDisputeResult(assertionId, false); // Disputer wins

      // Settle
      await mockUmaOracle.settleAssertion(assertionId);

      // The callback should have resolved the condition
      const resolution = await umaAdapter.getResolution(conditionId);
      expect(resolution.resolved).to.be.true;
      expect(resolution.outcome).to.be.false; // Opposite of asserted because dispute succeeded
    });

    it("Should check if condition can be settled", async function () {
      // Before liveness period ends
      expect(await umaAdapter.canSettle(conditionId)).to.be.false;

      // After liveness period (UMA assertion not settled yet)
      await time.increase(DEFAULT_LIVENESS + 1);
      // UMA assertion is not settled yet, so canSettle still false
      expect(await umaAdapter.canSettle(conditionId)).to.be.false;

      // After UMA assertion is settled (callback auto-resolves condition)
      await mockUmaOracle.settleAssertion(assertionId);
      // Condition is now resolved via callback, so canSettle is false
      expect(await umaAdapter.canSettle(conditionId)).to.be.false;

      // Verify condition was resolved by callback
      expect(await umaAdapter.isConditionResolved(conditionId)).to.be.true;
    });

    it("Should not re-settle already settled condition", async function () {
      await time.increase(DEFAULT_LIVENESS + 1);
      await umaAdapter.settleCondition(conditionId);

      // Second settlement should not fail, just return
      await umaAdapter.settleCondition(conditionId);

      const resolution = await umaAdapter.getResolution(conditionId);
      expect(resolution.resolved).to.be.true;
    });
  });

  describe("IOracleAdapter Interface", function () {
    let conditionId;

    beforeEach(async function () {
      const deadline = (await time.latest()) + 86400;
      const tx = await umaAdapter.createCondition("Test condition", deadline);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try {
          return umaAdapter.interface.parseLog(log)?.name === "ConditionCreated";
        } catch { return false; }
      });
      conditionId = umaAdapter.interface.parseLog(event).args.conditionId;
    });

    it("Should report condition as supported", async function () {
      expect(await umaAdapter.isConditionSupported(conditionId)).to.be.true;
    });

    it("Should report unknown condition as not supported", async function () {
      const unknownId = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      expect(await umaAdapter.isConditionSupported(unknownId)).to.be.false;
    });

    it("Should report unresolved condition correctly", async function () {
      expect(await umaAdapter.isConditionResolved(conditionId)).to.be.false;
    });

    it("Should report resolved condition correctly", async function () {
      await time.increase(86401);
      await umaAdapter.assertOutcome(conditionId, true);
      await time.increase(DEFAULT_LIVENESS + 1);
      await umaAdapter.settleCondition(conditionId);

      expect(await umaAdapter.isConditionResolved(conditionId)).to.be.true;
    });

    it("Should return outcome with confidence", async function () {
      await time.increase(86401);
      await umaAdapter.assertOutcome(conditionId, true);
      await time.increase(DEFAULT_LIVENESS + 1);
      await umaAdapter.settleCondition(conditionId);

      const [outcome, confidence, resolvedAt] = await umaAdapter.getOutcome(conditionId);
      expect(outcome).to.be.true;
      expect(confidence).to.equal(10000);
      expect(resolvedAt).to.be.gt(0);
    });

    it("Should return zero outcome for unresolved condition", async function () {
      const [outcome, confidence, resolvedAt] = await umaAdapter.getOutcome(conditionId);
      expect(outcome).to.be.false;
      expect(confidence).to.equal(0);
      expect(resolvedAt).to.equal(0);
    });

    it("Should return condition metadata", async function () {
      const [description, expectedResolutionTime] = await umaAdapter.getConditionMetadata(conditionId);
      expect(description).to.equal("Test condition");
      expect(expectedResolutionTime).to.be.gt(0);
    });
  });
});
