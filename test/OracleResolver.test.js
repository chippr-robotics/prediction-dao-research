const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OracleResolver", function () {
  let oracleResolver;
  let owner;
  let reporter;
  let challenger;

  beforeEach(async function () {
    [owner, reporter, challenger] = await ethers.getSigners();
    
    const OracleResolver = await ethers.getContractFactory("OracleResolver");
    oracleResolver = await OracleResolver.deploy();
    await oracleResolver.initialize(owner.address);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await oracleResolver.owner()).to.equal(owner.address);
    });

    it("Should set owner as designated reporter", async function () {
      expect(await oracleResolver.designatedReporters(owner.address)).to.equal(true);
    });

    it("Should set correct settlement window", async function () {
      expect(await oracleResolver.SETTLEMENT_WINDOW()).to.equal(3 * 24 * 60 * 60); // 3 days
    });

    it("Should set correct challenge period", async function () {
      expect(await oracleResolver.CHALLENGE_PERIOD()).to.equal(2 * 24 * 60 * 60); // 2 days
    });
  });

  describe("Reporter Management", function () {
    it("Should allow owner to add designated reporter", async function () {
      await expect(
        oracleResolver.addDesignatedReporter(reporter.address)
      ).to.emit(oracleResolver, "ReporterAdded")
        .withArgs(reporter.address);
      
      expect(await oracleResolver.designatedReporters(reporter.address)).to.equal(true);
    });

    it("Should allow owner to remove designated reporter", async function () {
      await oracleResolver.addDesignatedReporter(reporter.address);
      
      await expect(
        oracleResolver.removeDesignatedReporter(reporter.address)
      ).to.emit(oracleResolver, "ReporterRemoved")
        .withArgs(reporter.address);
      
      expect(await oracleResolver.designatedReporters(reporter.address)).to.equal(false);
    });

    it("Should only allow owner to add reporters", async function () {
      await expect(
        oracleResolver.connect(reporter).addDesignatedReporter(challenger.address)
      ).to.be.revertedWithCustomError(oracleResolver, "OwnableUnauthorizedAccount");
    });

    it("Should only allow owner to remove reporters", async function () {
      await oracleResolver.addDesignatedReporter(reporter.address);
      
      await expect(
        oracleResolver.connect(reporter).removeDesignatedReporter(reporter.address)
      ).to.be.revertedWithCustomError(oracleResolver, "OwnableUnauthorizedAccount");
    });
  });

  describe("Report Submission", function () {
    beforeEach(async function () {
      await oracleResolver.addDesignatedReporter(reporter.address);
    });

    it("Should allow designated reporter to submit report", async function () {
      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Evidence data");
      const reporterBond = await oracleResolver.REPORTER_BOND();

      await expect(
        oracleResolver.connect(reporter).submitReport(
          proposalId,
          passValue,
          failValue,
          evidence,
          { value: reporterBond }
        )
      ).to.emit(oracleResolver, "ReportSubmitted")
        .withArgs(proposalId, reporter.address, passValue, failValue);
    });

    it("Should reject report from non-designated reporter", async function () {
      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Evidence data");
      const reporterBond = await oracleResolver.REPORTER_BOND();

      await expect(
        oracleResolver.connect(challenger).submitReport(
          proposalId,
          passValue,
          failValue,
          evidence,
          { value: reporterBond }
        )
      ).to.be.revertedWith("Not designated reporter");
    });

    it("Should reject report with insufficient bond", async function () {
      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Evidence data");

      await expect(
        oracleResolver.connect(reporter).submitReport(
          proposalId,
          passValue,
          failValue,
          evidence,
          { value: ethers.parseEther("50") }
        )
      ).to.be.revertedWith("Incorrect bond amount");
    });
  });
});
