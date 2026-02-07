import { expect } from "chai";
import hre from "hardhat";

describe("WelfareMetricRegistry", function () {
  let ethers;
  let welfareRegistry;
  let owner;
  let addr1;

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    [owner, addr1] = await ethers.getSigners();
    
    const WelfareMetricRegistry = await ethers.getContractFactory("WelfareMetricRegistry");
    welfareRegistry = await WelfareMetricRegistry.deploy();
    await welfareRegistry.initialize(owner.address);
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
      await welfareRegistry.proposeMetric("Treasury Value", "TWAP of treasury holdings", 5000, 0); // 0 = Governance
      
      expect(await welfareRegistry.metricCount()).to.equal(1);
      
      const metric = await welfareRegistry.getMetric(0);
      expect(metric.name).to.equal("Treasury Value");
      expect(metric.weight).to.equal(5000);
      expect(metric.active).to.equal(false);
    });

    it("Should reject metric with zero weight", async function () {
      await expect(
        welfareRegistry.proposeMetric("Invalid", "Invalid metric", 0, 0)
      ).to.be.revertedWith("Invalid weight");
    });

    it("Should reject metric with weight > 10000", async function () {
      await expect(
        welfareRegistry.proposeMetric("Invalid", "Invalid metric", 10001, 0)
      ).to.be.revertedWith("Invalid weight");
    });

    it("Should reject metric with empty name", async function () {
      await expect(
        welfareRegistry.proposeMetric("", "Invalid metric", 1000, 0)
      ).to.be.revertedWith("Empty name");
    });

    it("Should only allow owner to propose metrics", async function () {
      await expect(
        welfareRegistry.connect(addr1).proposeMetric("Test", "Test metric", 1000, 0)
      ).to.be.revertedWithCustomError(welfareRegistry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Metric Activation", function () {
    beforeEach(async function () {
      await welfareRegistry.proposeMetric("Treasury Value", "TWAP of treasury holdings", 5000, 0);
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
      await welfareRegistry.proposeMetric("Treasury Value", "TWAP of treasury holdings", 5000, 0);
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
      await welfareRegistry.proposeMetric("Treasury Value", "TWAP of treasury holdings", 5000, 0);
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

    it("Should emit event on weight update", async function () {
      await expect(
        welfareRegistry.updateMetricWeight(0, 7000)
      ).to.emit(welfareRegistry, "MetricUpdated")
        .withArgs(0, 7000);
    });
  });

  describe("Metric Value Recording", function () {
    beforeEach(async function () {
      await welfareRegistry.proposeMetric("Treasury Value", "TWAP of treasury holdings", 5000, 0);
      await welfareRegistry.activateMetric(0);
    });

    it("Should allow owner to record metric value", async function () {
      const value = 1000000;
      
      await expect(
        welfareRegistry.recordMetricValue(0, value)
      ).to.emit(welfareRegistry, "MetricValueRecorded");

      const history = await welfareRegistry.getMetricHistory(0, 1);
      expect(history.length).to.equal(1);
      expect(history[0].value).to.equal(value);
      expect(history[0].reporter).to.equal(owner.address);
    });

    it("Should reject recording for invalid metric ID", async function () {
      await expect(
        welfareRegistry.recordMetricValue(99, 1000000)
      ).to.be.revertedWith("Invalid metric ID");
    });

    it("Should reject recording for inactive metric", async function () {
      await welfareRegistry.proposeMetric("Inactive Metric", "Test", 2000, 1);
      
      await expect(
        welfareRegistry.recordMetricValue(1, 1000000)
      ).to.be.revertedWith("Metric not active");
    });

    it("Should only allow owner to record values", async function () {
      await expect(
        welfareRegistry.connect(addr1).recordMetricValue(0, 1000000)
      ).to.be.revertedWithCustomError(welfareRegistry, "OwnableUnauthorizedAccount");
    });

    it("Should store multiple historical values", async function () {
      await welfareRegistry.recordMetricValue(0, 1000);
      await welfareRegistry.recordMetricValue(0, 2000);
      await welfareRegistry.recordMetricValue(0, 3000);

      const history = await welfareRegistry.getMetricHistory(0, 3);
      expect(history.length).to.equal(3);
      expect(history[0].value).to.equal(1000);
      expect(history[1].value).to.equal(2000);
      expect(history[2].value).to.equal(3000);
    });

    it("Should return limited history when count exceeds length", async function () {
      await welfareRegistry.recordMetricValue(0, 1000);
      await welfareRegistry.recordMetricValue(0, 2000);

      const history = await welfareRegistry.getMetricHistory(0, 10);
      expect(history.length).to.equal(2);
    });

    it("Should return empty history for new metric", async function () {
      const history = await welfareRegistry.getMetricHistory(0, 10);
      expect(history.length).to.equal(0);
    });
  });

  describe("Aggregated Metrics", function () {
    beforeEach(async function () {
      // Create metrics in different categories
      await welfareRegistry.proposeMetric("Governance Metric", "Test", 3000, 0); // Governance
      await welfareRegistry.proposeMetric("Financial Metric", "Test", 4000, 1); // Financial
      await welfareRegistry.proposeMetric("Betting Metric", "Test", 2000, 2); // Betting
      await welfareRegistry.proposeMetric("Private Sector Metric", "Test", 1000, 3); // PrivateSector
      
      // Activate all
      await welfareRegistry.activateMetric(0);
      await welfareRegistry.activateMetric(1);
      await welfareRegistry.activateMetric(2);
      await welfareRegistry.activateMetric(3);
      
      // Record values
      await welfareRegistry.recordMetricValue(0, 100); // Governance
      await welfareRegistry.recordMetricValue(1, 200); // Financial
      await welfareRegistry.recordMetricValue(2, 150); // Betting
      await welfareRegistry.recordMetricValue(3, 180); // PrivateSector
    });

    it("Should calculate aggregated metrics correctly", async function () {
      const aggregated = await welfareRegistry.getAggregatedMetrics();
      
      expect(aggregated.governanceScore).to.equal(100);
      expect(aggregated.financialScore).to.equal(200);
      expect(aggregated.bettingScore).to.equal(150);
      expect(aggregated.privateSectorScore).to.equal(180);
      
      // Overall score is average of all categories (integer division)
      const expectedOverall = BigInt(100 + 200 + 150 + 180) / BigInt(4);
      expect(aggregated.overallScore).to.equal(expectedOverall);
    });

    it("Should handle zero values correctly", async function () {
      // Create a new metric with no values
      await welfareRegistry.proposeMetric("New Metric", "Test", 5000, 0);
      await welfareRegistry.activateMetric(4);
      
      const aggregated = await welfareRegistry.getAggregatedMetrics();
      expect(aggregated.governanceScore).to.be.gte(0);
    });

    it("Should return current timestamp", async function () {
      const aggregated = await welfareRegistry.getAggregatedMetrics();
      const currentBlock = await ethers.provider.getBlock('latest');
      
      expect(aggregated.timestamp).to.be.closeTo(currentBlock.timestamp, 2);
    });
  });

  describe("Metrics by Category", function () {
    beforeEach(async function () {
      // Create multiple metrics in different categories
      await welfareRegistry.proposeMetric("Governance 1", "Test", 2000, 0);
      await welfareRegistry.proposeMetric("Governance 2", "Test", 3000, 0);
      await welfareRegistry.proposeMetric("Financial 1", "Test", 4000, 1);
      await welfareRegistry.proposeMetric("Betting 1", "Test", 1000, 2);
      
      // Activate all
      await welfareRegistry.activateMetric(0);
      await welfareRegistry.activateMetric(1);
      await welfareRegistry.activateMetric(2);
      await welfareRegistry.activateMetric(3);
    });

    it("Should return metrics filtered by Governance category", async function () {
      const governanceMetrics = await welfareRegistry.getMetricsByCategory(0); // Governance
      expect(governanceMetrics.length).to.equal(2);
      expect(governanceMetrics).to.include(0n);
      expect(governanceMetrics).to.include(1n);
    });

    it("Should return metrics filtered by Financial category", async function () {
      const financialMetrics = await welfareRegistry.getMetricsByCategory(1); // Financial
      expect(financialMetrics.length).to.equal(1);
      expect(financialMetrics[0]).to.equal(2);
    });

    it("Should return metrics filtered by Betting category", async function () {
      const bettingMetrics = await welfareRegistry.getMetricsByCategory(2); // Betting
      expect(bettingMetrics.length).to.equal(1);
      expect(bettingMetrics[0]).to.equal(3);
    });

    it("Should return empty array for category with no metrics", async function () {
      const privateSectorMetrics = await welfareRegistry.getMetricsByCategory(3); // PrivateSector
      expect(privateSectorMetrics.length).to.equal(0);
    });

    it("Should only return active metrics", async function () {
      await welfareRegistry.deactivateMetric(0);
      
      const governanceMetrics = await welfareRegistry.getMetricsByCategory(0);
      expect(governanceMetrics.length).to.equal(1);
      expect(governanceMetrics[0]).to.equal(1);
    });
  });

  describe("Multiple Metric Scenarios", function () {
    it("Should handle multiple metrics with different weights", async function () {
      await welfareRegistry.proposeMetric("Metric 1", "Test", 2000, 0);
      await welfareRegistry.proposeMetric("Metric 2", "Test", 3000, 1);
      await welfareRegistry.proposeMetric("Metric 3", "Test", 5000, 2);
      
      expect(await welfareRegistry.metricCount()).to.equal(3);
      
      const metric1 = await welfareRegistry.getMetric(0);
      const metric2 = await welfareRegistry.getMetric(1);
      const metric3 = await welfareRegistry.getMetric(2);
      
      expect(metric1.weight).to.equal(2000);
      expect(metric2.weight).to.equal(3000);
      expect(metric3.weight).to.equal(5000);
    });

    it("Should maintain active metrics list correctly", async function () {
      await welfareRegistry.proposeMetric("Metric 1", "Test", 2000, 0);
      await welfareRegistry.proposeMetric("Metric 2", "Test", 3000, 1);
      await welfareRegistry.proposeMetric("Metric 3", "Test", 5000, 2);
      
      await welfareRegistry.activateMetric(0);
      await welfareRegistry.activateMetric(2);
      
      let activeMetrics = await welfareRegistry.getActiveMetrics();
      expect(activeMetrics.length).to.equal(2);
      
      await welfareRegistry.deactivateMetric(0);
      activeMetrics = await welfareRegistry.getActiveMetrics();
      expect(activeMetrics.length).to.equal(1);
      expect(activeMetrics[0]).to.equal(2);
    });

    it("Should track metric activation timestamp", async function () {
      await welfareRegistry.proposeMetric("Metric 1", "Test", 2000, 0);
      
      const blockBefore = await ethers.provider.getBlock('latest');
      await welfareRegistry.activateMetric(0);
      const blockAfter = await ethers.provider.getBlock('latest');
      
      const metric = await welfareRegistry.getMetric(0);
      expect(metric.activatedAt).to.be.gte(blockBefore.timestamp);
      expect(metric.activatedAt).to.be.lte(blockAfter.timestamp);
    });
  });

  describe("Query Functions Edge Cases", function () {
    it("Should reject getMetric with invalid ID", async function () {
      await expect(
        welfareRegistry.getMetric(99)
      ).to.be.revertedWith("Invalid metric ID");
    });

    it("Should reject getMetricHistory with invalid ID", async function () {
      await expect(
        welfareRegistry.getMetricHistory(99, 10)
      ).to.be.revertedWith("Invalid metric ID");
    });

    it("Should return correct metric count after multiple proposals", async function () {
      expect(await welfareRegistry.metricCount()).to.equal(0);
      
      await welfareRegistry.proposeMetric("M1", "Test", 1000, 0);
      expect(await welfareRegistry.metricCount()).to.equal(1);
      
      await welfareRegistry.proposeMetric("M2", "Test", 2000, 1);
      expect(await welfareRegistry.metricCount()).to.equal(2);
      
      await welfareRegistry.proposeMetric("M3", "Test", 3000, 2);
      expect(await welfareRegistry.metricCount()).to.equal(3);
    });
  });
});
