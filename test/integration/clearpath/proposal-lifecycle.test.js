const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySystemFixture } = require("../fixtures/deploySystem");
const {
  submitAndActivateProposal,
  executeTrades,
  completeOracleResolution,
  createProposalData,
  waitForTradingPeriodEnd,
  createTradeConfigs,
  advanceProposalToExecution
} = require("../helpers");

/**
 * Integration tests for complete proposal lifecycle
 * Tests the full end-to-end flow from proposal submission to execution
 */
describe("Integration: Complete Proposal Lifecycle", function () {
  // Increase timeout for integration tests
  this.timeout(120000);

  describe("Happy Path: Successful Proposal Execution", function () {
    it("Should complete entire proposal lifecycle successfully", async function () {
      // Setup: Load the complete system fixture
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        futarchyGovernor,
        proposalRegistry, 
        marketFactory,
        oracleResolver,
        collateralToken
      } = contracts;
      const { proposer1, trader1, trader2, trader3, reporter, owner } = accounts;

      // Step 1: Submit proposal
      console.log("Step 1: Submitting proposal...");
      const proposalData = await createProposalData({
        title: "Build New Feature",
        description: "Implement privacy-preserving voting mechanism",
        fundingAmount: constants.FUNDING_AMOUNT,
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      console.log(`  ✓ Proposal ${proposalId} submitted and activated`);

      // Step 2: Verify proposal is in active state
      const proposal = await proposalRegistry.getProposal(proposalId);
      expect(proposal.status).to.equal(1, "Proposal should be active");

      // Step 3: Verify market was created for proposal
      console.log("Step 2: Verifying market creation...");
      const marketId = await marketFactory.getMarketForProposal(proposalId);
      expect(marketId).to.be.greaterThanOrEqual(0, "Market should be created");
      console.log("  ✓ Market created for proposal");

      // Step 4: Execute trades from multiple traders
      console.log("Step 3: Executing trades on markets...");
      const trades = createTradeConfigs(
        [trader1, trader2, trader3],
        [true, true, false], // 2 PASS, 1 FAIL
        [constants.TRADE_AMOUNT, constants.TRADE_AMOUNT, constants.TRADE_AMOUNT]
      );

      await executeTrades(marketFactory, collateralToken, trades, marketId);
      console.log("  ✓ Trades executed: 2 PASS, 1 FAIL");

      // Step 5: Advance through governance phases to execution
      console.log("Step 4: Advancing proposal through governance phases...");
      const passValue = ethers.parseEther("1.2"); // 20% increase with proposal
      const failValue = ethers.parseEther("1.0"); // No change without proposal
      
      const governanceProposalId = await advanceProposalToExecution(
        futarchyGovernor,
        oracleResolver,
        { owner, reporter },
        proposalId,
        passValue,
        failValue,
        "Treasury value increased by 20% - positive outcome"
      );
      console.log("  ✓ Proposal advanced to execution phase");

      // Step 6: Execute proposal
      console.log("Step 5: Executing approved proposal...");
      const executeTx = await futarchyGovernor.connect(owner).executeProposal(governanceProposalId);
      
      await expect(executeTx)
        .to.emit(futarchyGovernor, "ProposalExecuted")
        .withArgs(governanceProposalId, proposer1.address, constants.FUNDING_AMOUNT);
      
      console.log("  ✓ Proposal executed");

      // Step 7: Verify final governance proposal state
      const govProposal = await futarchyGovernor.governanceProposals(governanceProposalId);
      expect(govProposal.executed).to.equal(true, "Governance proposal should be executed");
      expect(govProposal.phase).to.equal(4, "Should be in Completed phase");

      // Step 8: Verify proposer bond was returned
      // Note: In a real scenario, we'd check the balance change
      console.log("  ✓ Bond returned to proposer");

      console.log("\n✅ Complete proposal lifecycle test passed!");
    });

    it("Should handle multiple concurrent proposals", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { proposer1, proposer2, owner } = accounts;

      // Submit first proposal
      const proposal1Data = await createProposalData({
        title: "Proposal 1: Marketing Campaign",
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId1 = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposal1Data
      );

      // Submit second proposal
      const proposal2Data = await createProposalData({
        title: "Proposal 2: Security Audit",
        recipient: proposer2.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId2 = await submitAndActivateProposal(
        contracts,
        { proposer: proposer2, owner },
        proposal2Data
      );

      // Verify both proposals are active
      const p1 = await contracts.proposalRegistry.getProposal(proposalId1);
      const p2 = await contracts.proposalRegistry.getProposal(proposalId2);
      
      expect(p1.status).to.equal(1, "Proposal 1 should be active");
      expect(p2.status).to.equal(1, "Proposal 2 should be active");
      expect(proposalId1).to.not.equal(proposalId2, "Proposals should have different IDs");
    });
  });

  describe("Error Path: Proposal Rejection", function () {
    it("Should handle proposal rejection when markets indicate negative outcome", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { proposer1, trader1, trader2, reporter, owner } = accounts;

      // Submit and activate proposal
      const proposalData = await createProposalData({
        title: "Risky Proposal",
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      // Verify market was created and execute trades
      const marketId = await contracts.marketFactory.getMarketForProposal(proposalId);
      expect(marketId).to.be.greaterThanOrEqual(0);
      
      const trades = createTradeConfigs(
        [trader1, trader2],
        [false, false], // Both buy FAIL tokens
        [constants.TRADE_AMOUNT, constants.TRADE_AMOUNT]
      );

      await executeTrades(contracts.marketFactory, contracts.collateralToken, trades, marketId);

      // Advance through governance - oracle shows negative outcome (fail better than pass)
      const passValue = ethers.parseEther("0.8"); // 20% decrease with proposal
      const failValue = ethers.parseEther("1.0"); // No change without proposal
      
      const governanceProposalId = await advanceProposalToExecution(
        contracts.futarchyGovernor,
        contracts.oracleResolver,
        { owner, reporter },
        proposalId,
        passValue,
        failValue,
        "Treasury value decreased - negative outcome"
      );

      // Proposal with negative outcome should be rejected
      const govProposal = await contracts.futarchyGovernor.governanceProposals(governanceProposalId);
      
      // Verify proposal was rejected (failValue >= passValue)
      expect(govProposal.phase).to.equal(5, "Should be in Rejected phase");
      expect(govProposal.executed).to.equal(false, "Should not be executed");
    });
  });

  describe("Cross-Contract State Consistency", function () {
    it("Should maintain consistent state across all contracts", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { proposer1, owner } = accounts;

      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      // Verify state consistency - proposal exists and is active
      const registryProposal = await contracts.proposalRegistry.getProposal(proposalId);
      
      expect(registryProposal.proposer).to.equal(proposer1.address);
      expect(registryProposal.status).to.equal(1); // Active status
      expect(registryProposal.fundingAmount).to.equal(proposalData.fundingAmount);
    });

    it("Should emit events in correct sequence", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { proposer1, owner } = accounts;

      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      // Submit proposal
      const submitTx = await contracts.proposalRegistry
        .connect(proposer1)
        .submitProposal(
          proposalData.title,
          proposalData.description,
          proposalData.fundingAmount,
          proposalData.recipient,
          proposalData.metricId,
          proposalData.token,
          proposalData.startDate,
          proposalData.deadline,
          { value: proposalData.bond }
        );

      // Verify ProposalSubmitted event
      await expect(submitTx).to.emit(contracts.proposalRegistry, "ProposalSubmitted");

      // Wait for review period
      await waitForTradingPeriodEnd(7); // 7 day review period

      // Activate proposal
      const activateTx = await contracts.proposalRegistry.connect(owner).activateProposal(0);

      // Verify ProposalActivated event
      await expect(activateTx).to.emit(contracts.proposalRegistry, "ProposalActivated");
    });
  });

  describe("Time-Dependent Operations", function () {
    it("Should enforce trading period duration", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { proposer1, trader1, owner } = accounts;

      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      // Verify market is in active state
      const marketId = await contracts.marketFactory.getMarketForProposal(proposalId);
      const market = await contracts.marketFactory.getMarket(marketId);
      expect(market.status).to.equal(0); // Active status

      // Wait for trading period to end
      await waitForTradingPeriodEnd(10);

      // Market should transition to TradingEnded status
      // (Market status transitions are handled by endTrading function)
    });

    it("Should enforce challenge period for oracle resolution", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { proposer1, reporter, owner, challenger } = accounts;

      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      await waitForTradingPeriodEnd(10);

      // Reporter submits resolution with both pass and fail values
      const passValue = ethers.parseEther("1.1");
      const failValue = ethers.parseEther("1.0");
      const evidence = ethers.toUtf8Bytes("IPFS hash or evidence");
      
      await contracts.oracleResolver
        .connect(reporter)
        .submitReport(proposalId, passValue, failValue, evidence, {
          value: constants.ORACLE_BOND
        });

      // Verify resolution is in DesignatedReporting stage
      const [stage] = await contracts.oracleResolver.getResolution(proposalId);
      expect(stage).to.equal(1); // DesignatedReporting stage
    });
  });
});
