import { expect } from "chai";
import hre from "hardhat";

describe("OracleResolver", function () {
  let ethers;
  let oracleResolver;
  let owner;
  let reporter;
  let challenger;

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
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

    it("Should reject report for already reported proposal", async function () {
      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Evidence data");
      const reporterBond = await oracleResolver.REPORTER_BOND();

      // First report
      await oracleResolver.connect(reporter).submitReport(
        proposalId,
        passValue,
        failValue,
        evidence,
        { value: reporterBond }
      );

      // Try to submit again
      await expect(
        oracleResolver.connect(reporter).submitReport(
          proposalId,
          passValue,
          failValue,
          evidence,
          { value: reporterBond }
        )
      ).to.be.revertedWith("Already reported");
    });

    it("Should store report details correctly", async function () {
      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Evidence data");
      const reporterBond = await oracleResolver.REPORTER_BOND();

      await oracleResolver.connect(reporter).submitReport(
        proposalId,
        passValue,
        failValue,
        evidence,
        { value: reporterBond }
      );

      const report = await oracleResolver.getReport(proposalId);
      expect(report.reporter).to.equal(reporter.address);
      expect(report.passValue).to.equal(passValue);
      expect(report.failValue).to.equal(failValue);
      expect(report.bond).to.equal(reporterBond);
    });
  });

  describe("Report Challenge", function () {
    beforeEach(async function () {
      await oracleResolver.addDesignatedReporter(reporter.address);
      
      // Submit initial report
      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Evidence data");
      const reporterBond = await oracleResolver.REPORTER_BOND();

      await oracleResolver.connect(reporter).submitReport(
        proposalId,
        passValue,
        failValue,
        evidence,
        { value: reporterBond }
      );
    });

    it("Should allow challenge with correct bond", async function () {
      const proposalId = 1;
      const counterPassValue = 800;
      const counterFailValue = 600;
      const counterEvidence = ethers.toUtf8Bytes("Counter evidence");
      const challengerBond = await oracleResolver.CHALLENGER_BOND();

      await expect(
        oracleResolver.connect(challenger).challengeReport(
          proposalId,
          counterPassValue,
          counterFailValue,
          counterEvidence,
          { value: challengerBond }
        )
      ).to.emit(oracleResolver, "ReportChallenged")
        .withArgs(proposalId, challenger.address, counterPassValue, counterFailValue);
    });

    it("Should reject challenge with insufficient bond", async function () {
      const proposalId = 1;
      const counterPassValue = 800;
      const counterFailValue = 600;
      const counterEvidence = ethers.toUtf8Bytes("Counter evidence");

      await expect(
        oracleResolver.connect(challenger).challengeReport(
          proposalId,
          counterPassValue,
          counterFailValue,
          counterEvidence,
          { value: ethers.parseEther("50") }
        )
      ).to.be.revertedWith("Incorrect bond amount");
    });

    it("Should reject challenge if not in challenge period", async function () {
      const proposalId = 2; // Not reported
      const counterPassValue = 800;
      const counterFailValue = 600;
      const counterEvidence = ethers.toUtf8Bytes("Counter evidence");
      const challengerBond = await oracleResolver.CHALLENGER_BOND();

      await expect(
        oracleResolver.connect(challenger).challengeReport(
          proposalId,
          counterPassValue,
          counterFailValue,
          counterEvidence,
          { value: challengerBond }
        )
      ).to.be.revertedWith("Not in challenge period");
    });

    it("Should reject challenge after challenge period ends", async function () {
      const proposalId = 1;
      const counterPassValue = 800;
      const counterFailValue = 600;
      const counterEvidence = ethers.toUtf8Bytes("Counter evidence");
      const challengerBond = await oracleResolver.CHALLENGER_BOND();

      // Fast forward past challenge period
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      await expect(
        oracleResolver.connect(challenger).challengeReport(
          proposalId,
          counterPassValue,
          counterFailValue,
          counterEvidence,
          { value: challengerBond }
        )
      ).to.be.revertedWith("Challenge period ended");
    });

    it("Should store challenge details correctly", async function () {
      const proposalId = 1;
      const counterPassValue = 800;
      const counterFailValue = 600;
      const counterEvidence = ethers.toUtf8Bytes("Counter evidence");
      const challengerBond = await oracleResolver.CHALLENGER_BOND();

      await oracleResolver.connect(challenger).challengeReport(
        proposalId,
        counterPassValue,
        counterFailValue,
        counterEvidence,
        { value: challengerBond }
      );

      const challenge = await oracleResolver.getChallenge(proposalId);
      expect(challenge.challenger).to.equal(challenger.address);
      expect(challenge.counterPassValue).to.equal(counterPassValue);
      expect(challenge.counterFailValue).to.equal(counterFailValue);
      expect(challenge.bond).to.equal(challengerBond);
    });
  });

  describe("UMA Escalation", function () {
    beforeEach(async function () {
      await oracleResolver.addDesignatedReporter(reporter.address);
      
      // Submit report and challenge
      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Evidence data");
      const reporterBond = await oracleResolver.REPORTER_BOND();

      await oracleResolver.connect(reporter).submitReport(
        proposalId,
        passValue,
        failValue,
        evidence,
        { value: reporterBond }
      );

      const counterPassValue = 800;
      const counterFailValue = 600;
      const counterEvidence = ethers.toUtf8Bytes("Counter evidence");
      const challengerBond = await oracleResolver.CHALLENGER_BOND();

      await oracleResolver.connect(challenger).challengeReport(
        proposalId,
        counterPassValue,
        counterFailValue,
        counterEvidence,
        { value: challengerBond }
      );
    });

    it("Should allow owner to escalate to UMA", async function () {
      const proposalId = 1;

      await expect(
        oracleResolver.escalateToUMA(proposalId)
      ).to.emit(oracleResolver, "DisputeEscalated")
        .withArgs(proposalId);
    });

    it("Should reject escalation if not in challenge stage", async function () {
      const proposalId = 2; // Not reported

      await expect(
        oracleResolver.escalateToUMA(proposalId)
      ).to.be.revertedWith("Not in challenge stage");
    });

    it("Should only allow owner to escalate", async function () {
      const proposalId = 1;

      await expect(
        oracleResolver.connect(reporter).escalateToUMA(proposalId)
      ).to.be.revertedWithCustomError(oracleResolver, "OwnableUnauthorizedAccount");
    });
  });

  describe("Resolution Finalization", function () {
    describe("Without Challenge", function () {
      beforeEach(async function () {
        await oracleResolver.addDesignatedReporter(reporter.address);
        
        // Submit report
        const proposalId = 1;
        const passValue = 1000;
        const failValue = 500;
        const evidence = ethers.toUtf8Bytes("Evidence data");
        const reporterBond = await oracleResolver.REPORTER_BOND();

        await oracleResolver.connect(reporter).submitReport(
          proposalId,
          passValue,
          failValue,
          evidence,
          { value: reporterBond }
        );
      });

      it("Should finalize resolution after challenge period", async function () {
        const proposalId = 1;

        // Fast forward past challenge period
        await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine");

        await expect(
          oracleResolver.finalizeResolution(proposalId)
        ).to.emit(oracleResolver, "ResolutionFinalized")
          .withArgs(proposalId, 1000, 500);

        const [stage, finalPassValue, finalFailValue, finalized] = await oracleResolver.getResolution(proposalId);
        expect(finalized).to.equal(true);
        expect(finalPassValue).to.equal(1000);
        expect(finalFailValue).to.equal(500);
        expect(stage).to.equal(4); // ResolutionStage.Finalized
      });

      it("Should return bond to reporter on finalization", async function () {
        const proposalId = 1;
        const reporterBond = await oracleResolver.REPORTER_BOND();

        // Fast forward past challenge period
        await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine");

        const reporterBalanceBefore = await ethers.provider.getBalance(reporter.address);
        await oracleResolver.finalizeResolution(proposalId);
        const reporterBalanceAfter = await ethers.provider.getBalance(reporter.address);

        expect(reporterBalanceAfter - reporterBalanceBefore).to.equal(reporterBond);
      });

      it("Should reject finalization before challenge period ends", async function () {
        const proposalId = 1;

        await expect(
          oracleResolver.finalizeResolution(proposalId)
        ).to.be.revertedWith("Challenge period not ended");
      });

      it("Should reject double finalization", async function () {
        const proposalId = 1;

        // Fast forward and finalize
        await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine");
        await oracleResolver.finalizeResolution(proposalId);

        // Try to finalize again
        await expect(
          oracleResolver.finalizeResolution(proposalId)
        ).to.be.revertedWith("Already finalized");
      });
    });

    describe("With Challenge", function () {
      beforeEach(async function () {
        await oracleResolver.addDesignatedReporter(reporter.address);
        
        // Submit report and challenge
        const proposalId = 1;
        const passValue = 1000;
        const failValue = 500;
        const evidence = ethers.toUtf8Bytes("Evidence data");
        const reporterBond = await oracleResolver.REPORTER_BOND();

        await oracleResolver.connect(reporter).submitReport(
          proposalId,
          passValue,
          failValue,
          evidence,
          { value: reporterBond }
        );

        const counterPassValue = 800;
        const counterFailValue = 600;
        const counterEvidence = ethers.toUtf8Bytes("Counter evidence");
        const challengerBond = await oracleResolver.CHALLENGER_BOND();

        await oracleResolver.connect(challenger).challengeReport(
          proposalId,
          counterPassValue,
          counterFailValue,
          counterEvidence,
          { value: challengerBond }
        );
      });

      it("Should finalize with challenger's values", async function () {
        const proposalId = 1;

        await expect(
          oracleResolver.finalizeResolution(proposalId)
        ).to.emit(oracleResolver, "ResolutionFinalized")
          .withArgs(proposalId, 800, 600);

        const [, finalPassValue, finalFailValue, finalized] = await oracleResolver.getResolution(proposalId);
        expect(finalized).to.equal(true);
        expect(finalPassValue).to.equal(800);
        expect(finalFailValue).to.equal(600);
      });

      it("Should return both bonds to challenger", async function () {
        const proposalId = 1;
        const reporterBond = await oracleResolver.REPORTER_BOND();
        const challengerBond = await oracleResolver.CHALLENGER_BOND();
        const totalBonds = reporterBond + challengerBond;

        const challengerBalanceBefore = await ethers.provider.getBalance(challenger.address);
        await oracleResolver.finalizeResolution(proposalId);
        const challengerBalanceAfter = await ethers.provider.getBalance(challenger.address);

        expect(challengerBalanceAfter - challengerBalanceBefore).to.equal(totalBonds);
      });
    });

    it("Should only allow owner to finalize", async function () {
      await oracleResolver.addDesignatedReporter(reporter.address);
      
      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Evidence data");
      const reporterBond = await oracleResolver.REPORTER_BOND();

      await oracleResolver.connect(reporter).submitReport(
        proposalId,
        passValue,
        failValue,
        evidence,
        { value: reporterBond }
      );

      // Fast forward past challenge period
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      await expect(
        oracleResolver.connect(reporter).finalizeResolution(proposalId)
      ).to.be.revertedWithCustomError(oracleResolver, "OwnableUnauthorizedAccount");
    });
  });

  describe("Query Functions", function () {
    it("Should return empty resolution for unreported proposal", async function () {
      const proposalId = 999;
      const [stage, finalPassValue, finalFailValue, finalized] = await oracleResolver.getResolution(proposalId);
      
      expect(stage).to.equal(0); // ResolutionStage.Unreported
      expect(finalPassValue).to.equal(0);
      expect(finalFailValue).to.equal(0);
      expect(finalized).to.equal(false);
    });

    it("Should return correct resolution stage", async function () {
      await oracleResolver.addDesignatedReporter(reporter.address);
      
      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Evidence data");
      const reporterBond = await oracleResolver.REPORTER_BOND();

      // Check unreported stage
      let [stage] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(0);

      // Submit report
      await oracleResolver.connect(reporter).submitReport(
        proposalId,
        passValue,
        failValue,
        evidence,
        { value: reporterBond }
      );

      // Check designated reporting stage
      [stage] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(1);
    });
  });
});
