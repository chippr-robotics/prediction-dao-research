const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySystemFixture } = require("../fixtures/deploySystem");

/**
 * Integration tests for Multi-Stage Oracle Resolution
 * Tests the complete oracle resolution workflow including:
 * - Initial report submission by designated reporter
 * - Challenge period where reports can be contested
 * - Dispute resolution escalation
 * - Final settlement with bond distribution
 */
describe("Integration: Multi-Stage Oracle Resolution", function () {
  // Increase timeout for integration tests
  this.timeout(120000);

  describe("Happy Path: Unchallenged Resolution", function () {
    it("Should complete oracle resolution without challenge", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { owner, reporter } = accounts;

      const proposalId = 1;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("IPFS hash: QmTest123");

      // Step 1: Designated reporter submits initial report
      console.log("Step 1: Submitting initial oracle report...");
      const reportTx = await oracleResolver
        .connect(reporter)
        .submitReport(
          proposalId,
          passValue,
          failValue,
          evidence,
          { value: constants.ORACLE_BOND }
        );

      await expect(reportTx)
        .to.emit(oracleResolver, "ReportSubmitted")
        .withArgs(proposalId, reporter.address, passValue, failValue);

      console.log("  ✓ Report submitted successfully");

      // Verify report details
      const report = await oracleResolver.getReport(proposalId);
      expect(report.reporter).to.equal(reporter.address);
      expect(report.passValue).to.equal(passValue);
      expect(report.failValue).to.equal(failValue);
      expect(report.bond).to.equal(constants.ORACLE_BOND);

      // Verify resolution stage
      let [stage, , , finalized] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(1); // DesignatedReporting
      expect(finalized).to.equal(false);

      // Step 2: Wait for challenge period to expire
      console.log("Step 2: Waiting for challenge period (2 days)...");
      const challengePeriod = await oracleResolver.CHALLENGE_PERIOD();
      await time.increase(challengePeriod + 1n);
      console.log("  ✓ Challenge period expired");

      // Step 3: Finalize resolution (no challenges received)
      console.log("Step 3: Finalizing resolution...");
      const reporterBalanceBefore = await ethers.provider.getBalance(reporter.address);

      const finalizeTx = await oracleResolver
        .connect(owner)
        .finalizeResolution(proposalId);

      await expect(finalizeTx)
        .to.emit(oracleResolver, "ResolutionFinalized")
        .withArgs(proposalId, passValue, failValue);

      console.log("  ✓ Resolution finalized");

      // Step 4: Verify final state
      let finalPassValue, finalFailValue;
      [stage, finalPassValue, finalFailValue, finalized] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(4); // Finalized
      expect(finalPassValue).to.equal(passValue);
      expect(finalFailValue).to.equal(failValue);
      expect(finalized).to.equal(true);

      // Step 5: Verify reporter bond was returned
      const reporterBalanceAfter = await ethers.provider.getBalance(reporter.address);
      expect(reporterBalanceAfter - reporterBalanceBefore).to.equal(constants.ORACLE_BOND);
      console.log("  ✓ Reporter bond returned successfully");

      console.log("\n✅ Unchallenged resolution completed successfully");
    });
  });

  describe("Challenge Workflow: Successful Challenge", function () {
    it("Should handle challenge and award bonds to challenger", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { owner, reporter, challenger } = accounts;

      const proposalId = 2;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Initial evidence");

      // Step 1: Reporter submits initial report
      console.log("Step 1: Submitting initial report...");
      await oracleResolver
        .connect(reporter)
        .submitReport(
          proposalId,
          passValue,
          failValue,
          evidence,
          { value: constants.ORACLE_BOND }
        );
      console.log("  ✓ Report submitted");

      // Step 2: Challenger submits challenge within challenge period
      console.log("Step 2: Submitting challenge...");
      const counterPassValue = 800;
      const counterFailValue = 600;
      const counterEvidence = ethers.toUtf8Bytes("Counter evidence showing different metrics");

      const challengeTx = await oracleResolver
        .connect(challenger)
        .challengeReport(
          proposalId,
          counterPassValue,
          counterFailValue,
          counterEvidence,
          { value: constants.CHALLENGE_BOND }
        );

      await expect(challengeTx)
        .to.emit(oracleResolver, "ReportChallenged")
        .withArgs(proposalId, challenger.address, counterPassValue, counterFailValue);

      console.log("  ✓ Challenge submitted successfully");

      // Verify challenge details
      const challenge = await oracleResolver.getChallenge(proposalId);
      expect(challenge.challenger).to.equal(challenger.address);
      expect(challenge.counterPassValue).to.equal(counterPassValue);
      expect(challenge.counterFailValue).to.equal(counterFailValue);
      expect(challenge.bond).to.equal(constants.CHALLENGE_BOND);

      // Verify resolution stage changed
      let [stage] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(2); // OpenChallenge

      // Step 3: Owner accepts challenge and finalizes with challenger's values
      console.log("Step 3: Accepting challenge and finalizing...");
      const challengerBalanceBefore = await ethers.provider.getBalance(challenger.address);

      const finalizeTx = await oracleResolver
        .connect(owner)
        .finalizeResolution(proposalId);

      await expect(finalizeTx)
        .to.emit(oracleResolver, "ResolutionFinalized")
        .withArgs(proposalId, counterPassValue, counterFailValue);

      console.log("  ✓ Resolution finalized with challenger's values");

      // Step 4: Verify final state uses challenger's values
      const [finalStage, finalPassValue, finalFailValue, finalized] = 
        await oracleResolver.getResolution(proposalId);
      expect(finalStage).to.equal(4); // Finalized
      expect(finalPassValue).to.equal(counterPassValue);
      expect(finalFailValue).to.equal(counterFailValue);
      expect(finalized).to.equal(true);

      // Step 5: Verify challenger received both bonds
      const challengerBalanceAfter = await ethers.provider.getBalance(challenger.address);
      const totalBonds = constants.ORACLE_BOND + constants.CHALLENGE_BOND;
      expect(challengerBalanceAfter - challengerBalanceBefore).to.equal(totalBonds);
      console.log("  ✓ Challenger received both bonds");

      console.log("\n✅ Challenge workflow completed successfully");
    });

    it("Should reject challenge after challenge period expires", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { reporter, challenger } = accounts;

      const proposalId = 3;
      const passValue = 1000;
      const failValue = 500;

      // Submit initial report
      await oracleResolver
        .connect(reporter)
        .submitReport(
          proposalId,
          passValue,
          failValue,
          ethers.toUtf8Bytes("Evidence"),
          { value: constants.ORACLE_BOND }
        );

      // Wait past challenge period
      console.log("Advancing time past challenge period...");
      const challengePeriod = await oracleResolver.CHALLENGE_PERIOD();
      await time.increase(challengePeriod + 1n);

      // Attempt to challenge - should fail
      await expect(
        oracleResolver
          .connect(challenger)
          .challengeReport(
            proposalId,
            800,
            600,
            ethers.toUtf8Bytes("Late challenge"),
            { value: constants.CHALLENGE_BOND }
          )
      ).to.be.revertedWith("Challenge period ended");

      console.log("  ✓ Late challenge rejected correctly");
    });
  });

  describe("Dispute Escalation Workflow", function () {
    it("Should escalate to UMA dispute resolution", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { owner, reporter, challenger } = accounts;

      const proposalId = 4;
      const passValue = 1000;
      const failValue = 500;

      // Step 1: Submit initial report
      console.log("Step 1: Submitting report...");
      await oracleResolver
        .connect(reporter)
        .submitReport(
          proposalId,
          passValue,
          failValue,
          ethers.toUtf8Bytes("Evidence"),
          { value: constants.ORACLE_BOND }
        );

      // Step 2: Submit challenge
      console.log("Step 2: Submitting challenge...");
      await oracleResolver
        .connect(challenger)
        .challengeReport(
          proposalId,
          800,
          600,
          ethers.toUtf8Bytes("Counter evidence"),
          { value: constants.CHALLENGE_BOND }
        );

      // Verify stage is OpenChallenge
      let [stage] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(2); // OpenChallenge

      // Step 3: Owner escalates to UMA dispute
      console.log("Step 3: Escalating to UMA dispute...");
      const escalateTx = await oracleResolver
        .connect(owner)
        .escalateToUMA(proposalId);

      await expect(escalateTx)
        .to.emit(oracleResolver, "DisputeEscalated")
        .withArgs(proposalId);

      console.log("  ✓ Dispute escalated to UMA");

      // Verify stage changed to Dispute
      [stage] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(3); // Dispute

      // Step 4: After dispute resolution, owner can finalize
      console.log("Step 4: Finalizing after dispute resolution...");
      await oracleResolver
        .connect(owner)
        .finalizeResolution(proposalId);

      // Verify finalized
      let finalized;
      [stage, , , finalized] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(4); // Finalized
      expect(finalized).to.equal(true);

      console.log("\n✅ Dispute escalation workflow completed successfully");
    });

    it("Should reject escalation if not in challenge stage", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { owner } = accounts;

      const proposalId = 5;

      // Try to escalate without any report/challenge
      await expect(
        oracleResolver.connect(owner).escalateToUMA(proposalId)
      ).to.be.revertedWith("Not in challenge stage");

      console.log("  ✓ Invalid escalation rejected correctly");
    });
  });

  describe("Bond Management and Access Control", function () {
    it("Should require correct bond amounts", async function () {
      const { contracts, accounts } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { reporter, challenger } = accounts;

      const proposalId = 6;

      // Test insufficient reporter bond
      await expect(
        oracleResolver
          .connect(reporter)
          .submitReport(
            proposalId,
            1000,
            500,
            ethers.toUtf8Bytes("Evidence"),
            { value: ethers.parseEther("50") }
          )
      ).to.be.revertedWith("Incorrect bond amount");

      // Submit valid report
      await oracleResolver
        .connect(reporter)
        .submitReport(
          proposalId,
          1000,
          500,
          ethers.toUtf8Bytes("Evidence"),
          { value: ethers.parseEther("100") }
        );

      // Test insufficient challenger bond
      await expect(
        oracleResolver
          .connect(challenger)
          .challengeReport(
            proposalId,
            800,
            600,
            ethers.toUtf8Bytes("Counter"),
            { value: ethers.parseEther("50") }
          )
      ).to.be.revertedWith("Incorrect bond amount");

      console.log("  ✓ Bond amount validation working correctly");
    });

    it("Should enforce designated reporter access", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { challenger } = accounts;

      const proposalId = 7;

      // Non-designated reporter attempts to submit
      await expect(
        oracleResolver
          .connect(challenger)
          .submitReport(
            proposalId,
            1000,
            500,
            ethers.toUtf8Bytes("Evidence"),
            { value: constants.ORACLE_BOND }
          )
      ).to.be.revertedWith("Not designated reporter");

      console.log("  ✓ Designated reporter access control working");
    });

    it("Should enforce owner-only finalization", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { reporter } = accounts;

      const proposalId = 8;

      // Submit and wait for challenge period
      await oracleResolver
        .connect(reporter)
        .submitReport(
          proposalId,
          1000,
          500,
          ethers.toUtf8Bytes("Evidence"),
          { value: constants.ORACLE_BOND }
        );

      const challengePeriod = await oracleResolver.CHALLENGE_PERIOD();
      await time.increase(challengePeriod + 1n);

      // Non-owner attempts to finalize
      await expect(
        oracleResolver.connect(reporter).finalizeResolution(proposalId)
      ).to.be.revertedWithCustomError(oracleResolver, "OwnableUnauthorizedAccount");

      console.log("  ✓ Owner-only finalization enforced");
    });
  });

  describe("Multiple Resolutions in Parallel", function () {
    it("Should handle multiple proposals at different stages", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { owner, reporter, challenger } = accounts;

      console.log("Setting up multiple proposals at different stages...");

      // Proposal 10: Just reported
      await oracleResolver
        .connect(reporter)
        .submitReport(
          10,
          1000,
          500,
          ethers.toUtf8Bytes("Evidence 10"),
          { value: constants.ORACLE_BOND }
        );

      // Proposal 11: Challenged
      await oracleResolver
        .connect(reporter)
        .submitReport(
          11,
          1100,
          550,
          ethers.toUtf8Bytes("Evidence 11"),
          { value: constants.ORACLE_BOND }
        );

      await oracleResolver
        .connect(challenger)
        .challengeReport(
          11,
          900,
          450,
          ethers.toUtf8Bytes("Challenge 11"),
          { value: constants.CHALLENGE_BOND }
        );

      // Proposal 12: Escalated to dispute
      await oracleResolver
        .connect(reporter)
        .submitReport(
          12,
          1200,
          600,
          ethers.toUtf8Bytes("Evidence 12"),
          { value: constants.ORACLE_BOND }
        );

      await oracleResolver
        .connect(challenger)
        .challengeReport(
          12,
          1000,
          500,
          ethers.toUtf8Bytes("Challenge 12"),
          { value: constants.CHALLENGE_BOND }
        );

      await oracleResolver.connect(owner).escalateToUMA(12);

      // Verify all proposals are at correct stages
      let [stage10] = await oracleResolver.getResolution(10);
      let [stage11] = await oracleResolver.getResolution(11);
      let [stage12] = await oracleResolver.getResolution(12);

      expect(stage10).to.equal(1); // DesignatedReporting
      expect(stage11).to.equal(2); // OpenChallenge
      expect(stage12).to.equal(3); // Dispute

      console.log("  ✓ Multiple proposals at different stages managed correctly");

      // Finalize each proposal
      console.log("Finalizing proposals...");

      // Finalize challenged proposal (11)
      await oracleResolver.connect(owner).finalizeResolution(11);
      const [, , , finalized11] = await oracleResolver.getResolution(11);
      expect(finalized11).to.equal(true);

      // Finalize disputed proposal (12)
      await oracleResolver.connect(owner).finalizeResolution(12);
      const [, , , finalized12] = await oracleResolver.getResolution(12);
      expect(finalized12).to.equal(true);

      // Finalize unchallenged proposal (10) after challenge period
      const challengePeriod = await oracleResolver.CHALLENGE_PERIOD();
      await time.increase(challengePeriod + 1n);
      await oracleResolver.connect(owner).finalizeResolution(10);
      const [, , , finalized10] = await oracleResolver.getResolution(10);
      expect(finalized10).to.equal(true);

      console.log("  ✓ All proposals finalized successfully");
      console.log("\n✅ Parallel resolution workflow completed successfully");
    });
  });

  describe("Edge Cases and Error Conditions", function () {
    it("Should prevent double reporting", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { reporter } = accounts;

      const proposalId = 20;

      // First report
      await oracleResolver
        .connect(reporter)
        .submitReport(
          proposalId,
          1000,
          500,
          ethers.toUtf8Bytes("Evidence"),
          { value: constants.ORACLE_BOND }
        );

      // Second report - should fail
      await expect(
        oracleResolver
          .connect(reporter)
          .submitReport(
            proposalId,
            1100,
            550,
            ethers.toUtf8Bytes("New evidence"),
            { value: constants.ORACLE_BOND }
          )
      ).to.be.revertedWith("Already reported");

      console.log("  ✓ Double reporting prevented");
    });

    it("Should prevent double finalization", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { owner, reporter } = accounts;

      const proposalId = 21;

      // Submit and finalize
      await oracleResolver
        .connect(reporter)
        .submitReport(
          proposalId,
          1000,
          500,
          ethers.toUtf8Bytes("Evidence"),
          { value: constants.ORACLE_BOND }
        );

      const challengePeriod = await oracleResolver.CHALLENGE_PERIOD();
      await time.increase(challengePeriod + 1n);

      await oracleResolver.connect(owner).finalizeResolution(proposalId);

      // Try to finalize again
      await expect(
        oracleResolver.connect(owner).finalizeResolution(proposalId)
      ).to.be.revertedWith("Already finalized");

      console.log("  ✓ Double finalization prevented");
    });

    it("Should accept empty evidence (evidence validation is off-chain)", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { reporter } = accounts;

      const proposalId = 22;

      // Evidence is optional at the contract level (bytes parameter)
      // Real-world validation of evidence happens off-chain and in governance
      await expect(
        oracleResolver
          .connect(reporter)
          .submitReport(
            proposalId,
            1000,
            500,
            ethers.toUtf8Bytes(""),
            { value: constants.ORACLE_BOND }
          )
      ).to.emit(oracleResolver, "ReportSubmitted");

      console.log("  ✓ Empty evidence accepted (evidence validation is off-chain)");
    });
  });

  describe("Query Functions and State Verification", function () {
    it("Should return correct resolution details at each stage", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { owner, reporter, challenger } = accounts;

      const proposalId = 30;

      // Stage 0: Unreported
      let [stage, passValue, failValue, finalized] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(0);
      expect(passValue).to.equal(0);
      expect(failValue).to.equal(0);
      expect(finalized).to.equal(false);

      // Stage 1: DesignatedReporting
      await oracleResolver
        .connect(reporter)
        .submitReport(
          proposalId,
          1000,
          500,
          ethers.toUtf8Bytes("Evidence"),
          { value: constants.ORACLE_BOND }
        );

      [stage] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(1);

      // Stage 2: OpenChallenge
      await oracleResolver
        .connect(challenger)
        .challengeReport(
          proposalId,
          800,
          600,
          ethers.toUtf8Bytes("Counter"),
          { value: constants.CHALLENGE_BOND }
        );

      [stage] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(2);

      // Stage 3: Dispute
      await oracleResolver.connect(owner).escalateToUMA(proposalId);
      [stage] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(3);

      // Stage 4: Finalized (after Dispute)
      // In Dispute stage, the contract uses the reporter's values (UMA would decide in real scenario)
      await oracleResolver.connect(owner).finalizeResolution(proposalId);
      [stage, passValue, failValue, finalized] = await oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(4);
      expect(passValue).to.equal(1000); // Reporter's values (would be UMA decision in production)
      expect(failValue).to.equal(500);
      expect(finalized).to.equal(true);

      console.log("  ✓ Query functions return correct data at all stages");
    });

    it("Should return detailed report and challenge information", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { oracleResolver } = contracts;
      const { reporter, challenger } = accounts;

      const proposalId = 31;
      const passValue = 1000;
      const failValue = 500;
      const evidence = ethers.toUtf8Bytes("Original evidence");
      const counterPassValue = 800;
      const counterFailValue = 600;
      const counterEvidence = ethers.toUtf8Bytes("Counter evidence");

      // Submit report
      await oracleResolver
        .connect(reporter)
        .submitReport(proposalId, passValue, failValue, evidence, { value: constants.ORACLE_BOND });

      // Verify report details
      const report = await oracleResolver.getReport(proposalId);
      expect(report.reporter).to.equal(reporter.address);
      expect(report.passValue).to.equal(passValue);
      expect(report.failValue).to.equal(failValue);
      expect(ethers.toUtf8String(report.evidence)).to.equal("Original evidence");
      expect(report.bond).to.equal(constants.ORACLE_BOND);

      // Submit challenge
      await oracleResolver
        .connect(challenger)
        .challengeReport(
          proposalId,
          counterPassValue,
          counterFailValue,
          counterEvidence,
          { value: constants.CHALLENGE_BOND }
        );

      // Verify challenge details
      const challenge = await oracleResolver.getChallenge(proposalId);
      expect(challenge.challenger).to.equal(challenger.address);
      expect(challenge.counterPassValue).to.equal(counterPassValue);
      expect(challenge.counterFailValue).to.equal(counterFailValue);
      expect(ethers.toUtf8String(challenge.counterEvidence)).to.equal("Counter evidence");
      expect(challenge.bond).to.equal(constants.CHALLENGE_BOND);

      console.log("  ✓ Detailed report and challenge data accessible via queries");
    });
  });
});
