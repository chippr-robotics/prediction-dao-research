const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WelfareMetricRegistry", function () {
  let welfareRegistry;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    
    const WelfareMetricRegistry = await ethers.getContractFactory("WelfareMetricRegistry");
    welfareRegistry = await WelfareMetricRegistry.deploy();
    await welfareRegistry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await welfareRegistry.owner()).to.equal(owner.address);
    });

    it("Should initialize with zero metrics", async function () {
      expect(await welfareRegistry.metricCount()).to.equal(0);
    });
  });

  describe("Metric Proposal", function () {
    it("Should allow owner to propose a metric", async function () {
      await welfareRegistry.proposeMetric("Treasury Value", "TWAP of treasury holdings", 5000);
      
      expect(await welfareRegistry.metricCount()).to.equal(1);
      
      const metric = await welfareRegistry.getMetric(0);
      expect(metric.name).to.equal("Treasury Value");
      expect(metric.weight).to.equal(5000);
      expect(metric.active).to.equal(false);
    });

    it("Should reject metric with zero weight", async function () {
      await expect(
        welfareRegistry.proposeMetric("Invalid", "Invalid metric", 0)
      ).to.be.revertedWith("Invalid weight");
    });

    it("Should reject metric with weight > 10000", async function () {
      await expect(
        welfareRegistry.proposeMetric("Invalid", "Invalid metric", 10001)
      ).to.be.revertedWith("Invalid weight");
    });

    it("Should reject metric with empty name", async function () {
      await expect(
        welfareRegistry.proposeMetric("", "Invalid metric", 1000)
      ).to.be.revertedWith("Empty name");
    });

    it("Should only allow owner to propose metrics", async function () {
      await expect(
        welfareRegistry.connect(addr1).proposeMetric("Test", "Test metric", 1000)
      ).to.be.revertedWithCustomError(welfareRegistry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Metric Activation", function () {
    beforeEach(async function () {
      await welfareRegistry.proposeMetric("Treasury Value", "TWAP of treasury holdings", 5000);
    });

    it("Should allow owner to activate a metric", async function () {
      await welfareRegistry.activateMetric(0);
      
      const metric = await welfareRegistry.getMetric(0);
      expect(metric.active).to.equal(true);
      
      const activeMetrics = await welfareRegistry.getActiveMetrics();
      expect(activeMetrics.length).to.equal(1);
      expect(activeMetrics[0]).to.equal(0);
    });

    it("Should reject activation of already active metric", async function () {
      await welfareRegistry.activateMetric(0);
      await expect(
        welfareRegistry.activateMetric(0)
      ).to.be.revertedWith("Already active");
    });

    it("Should reject activation with invalid metric ID", async function () {
      await expect(
        welfareRegistry.activateMetric(99)
      ).to.be.revertedWith("Invalid metric ID");
    });
  });

  describe("Metric Deactivation", function () {
    beforeEach(async function () {
      await welfareRegistry.proposeMetric("Treasury Value", "TWAP of treasury holdings", 5000);
      await welfareRegistry.activateMetric(0);
    });

    it("Should allow owner to deactivate a metric", async function () {
      await welfareRegistry.deactivateMetric(0);
      
      const metric = await welfareRegistry.getMetric(0);
      expect(metric.active).to.equal(false);
      
      const activeMetrics = await welfareRegistry.getActiveMetrics();
      expect(activeMetrics.length).to.equal(0);
    });

    it("Should reject deactivation of inactive metric", async function () {
      await welfareRegistry.deactivateMetric(0);
      await expect(
        welfareRegistry.deactivateMetric(0)
      ).to.be.revertedWith("Not active");
    });
  });

  describe("Metric Weight Update", function () {
    beforeEach(async function () {
      await welfareRegistry.proposeMetric("Treasury Value", "TWAP of treasury holdings", 5000);
    });

    it("Should allow owner to update metric weight", async function () {
      await welfareRegistry.updateMetricWeight(0, 7000);
      
      const metric = await welfareRegistry.getMetric(0);
      expect(metric.weight).to.equal(7000);
    });

    it("Should reject invalid weight update", async function () {
      await expect(
        welfareRegistry.updateMetricWeight(0, 0)
      ).to.be.revertedWith("Invalid weight");
      
      await expect(
        welfareRegistry.updateMetricWeight(0, 10001)
      ).to.be.revertedWith("Invalid weight");
    });

    it("Should reject update with invalid metric ID", async function () {
      await expect(
        welfareRegistry.updateMetricWeight(99, 5000)
      ).to.be.revertedWith("Invalid metric ID");
    });
  });
});
