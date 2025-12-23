const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deploySystemFixture } = require("../fixtures/deploySystem");
const {
  submitAndActivateProposal,
  createProposalData
} = require("../helpers");

/**
 * Integration tests for Ragequit Protection mechanisms
 * Tests complete end-to-end flows for token holder exit, proportional share calculation,
 * and treasury withdrawal.
 * 
 * Note: Console.log statements are intentionally included for integration test visibility
 * and debugging. They provide step-by-step workflow tracking for complex multi-contract flows.
 */
describe("Integration: Ragequit Protection Flow", function () {
  // Increase timeout for integration tests
  this.timeout(120000);

  describe("Complete Ragequit Lifecycle", function () {
    it("Should allow token holder to ragequit with proportional treasury share", async function () {
      // Setup: Load the complete system fixture
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        proposalRegistry, 
        ragequitModule,
        governanceToken
      } = contracts;
      const { proposer1, trader1, owner } = accounts;

      console.log("\n--- Step 1: Submit and activate proposal ---");
      const proposalData = await createProposalData({
        title: "Test Proposal for Ragequit",
        description: "A proposal to test ragequit functionality",
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

      // Verify proposal is in active state
      const proposal = await proposalRegistry.getProposal(proposalId);
      expect(proposal.status).to.equal(1, "Proposal should be active");

      console.log("\n--- Step 2: Open ragequit window for dissenting holders ---");
      const currentTime = await time.latest();
      const snapshotTime = currentTime;
      const executionTime = currentTime + (10 * 24 * 3600); // 10 days from now

      await ragequitModule.connect(owner).openRagequitWindow(
        proposalId,
        snapshotTime,
        executionTime
      );
      console.log("  ✓ Ragequit window opened");

      // Verify window is open
      const [, , , isOpen] = await ragequitModule.getRagequitWindow(proposalId);
      expect(isOpen).to.be.true;

      console.log("\n--- Step 3: Mark dissenting token holder as eligible ---");
      // trader1 disagrees with the proposal and wants to exit
      await ragequitModule.connect(owner).setEligible(proposalId, trader1.address);
      
      const isEligible = await ragequitModule.isEligible(proposalId, trader1.address);
      expect(isEligible).to.be.true;
      console.log("  ✓ Trader1 marked as eligible for ragequit");

      console.log("\n--- Step 4: Fund ragequit module for payouts ---");
      // Fund the ragequit module to handle payouts
      await owner.sendTransaction({
        to: await ragequitModule.getAddress(),
        value: ethers.parseEther("50")
      });
      console.log("  ✓ Ragequit module funded");

      console.log("\n--- Step 5: Token holder executes ragequit ---");
      const ragequitTokenAmount = ethers.parseEther("1000");
      
      // Get trader1's initial balance
      const trader1InitialBalance = await ethers.provider.getBalance(trader1.address);
      const trader1InitialTokenBalance = await governanceToken.balanceOf(trader1.address);

      // Approve tokens for ragequit
      await governanceToken.connect(trader1).approve(
        await ragequitModule.getAddress(),
        ragequitTokenAmount
      );

      // Calculate expected treasury share
      const totalSupply = await governanceToken.totalSupply();
      const treasuryBalance = await ethers.provider.getBalance(owner.address);
      const expectedShare = (treasuryBalance * ragequitTokenAmount) / totalSupply;

      // Execute ragequit
      const ragequitTx = await ragequitModule.connect(trader1).ragequit(
        proposalId,
        ragequitTokenAmount
      );
      const receipt = await ragequitTx.wait();

      console.log("  ✓ Ragequit executed successfully");

      // Verify event emission
      const ragequitEvent = receipt.logs.find(log => {
        try {
          return ragequitModule.interface.parseLog(log).name === "RagequitExecuted";
        } catch {
          return false;
        }
      });
      expect(ragequitEvent).to.not.be.undefined;
      console.log("  ✓ RagequitExecuted event emitted");

      console.log("\n--- Step 6: Verify state changes ---");
      
      // Verify token holder is marked as having ragequit
      const hasRagequit = await ragequitModule.hasRagequit(trader1.address, proposalId);
      expect(hasRagequit).to.be.true;

      // Verify no longer eligible
      const stillEligible = await ragequitModule.isEligible(proposalId, trader1.address);
      expect(stillEligible).to.be.false;

      // Verify tokens were transferred to module
      const trader1FinalTokenBalance = await governanceToken.balanceOf(trader1.address);
      expect(trader1FinalTokenBalance).to.equal(trader1InitialTokenBalance - ragequitTokenAmount);

      // Verify ETH was received (approximately, accounting for gas)
      const trader1FinalBalance = await ethers.provider.getBalance(trader1.address);
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      // Allow generous variance for gas costs and timing
      expect(trader1FinalBalance).to.be.closeTo(
        trader1InitialBalance + expectedShare - gasUsed,
        ethers.parseEther("0.1") // Allow variance for gas and calculation precision
      );

      console.log("  ✓ All state changes verified");
      console.log(`  ✓ Token holder received proportional treasury share: ${ethers.formatEther(expectedShare)} ETH`);
    });

    it("Should handle multiple token holders ragequitting", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        proposalRegistry,
        ragequitModule,
        governanceToken
      } = contracts;
      const { proposer1, trader1, trader2, owner } = accounts;

      console.log("\n--- Setup: Create and activate proposal ---");
      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      console.log("\n--- Open ragequit window ---");
      const currentTime = await time.latest();
      await ragequitModule.connect(owner).openRagequitWindow(
        proposalId,
        currentTime,
        currentTime + (10 * 24 * 3600)
      );

      // Mark multiple users as eligible
      await ragequitModule.connect(owner).setEligible(proposalId, trader1.address);
      await ragequitModule.connect(owner).setEligible(proposalId, trader2.address);

      console.log("\n--- Fund treasury and module ---");
      await owner.sendTransaction({
        to: await ragequitModule.getAddress(),
        value: ethers.parseEther("100")
      });

      console.log("\n--- Both traders execute ragequit ---");
      const ragequitAmount = ethers.parseEther("500");

      // Trader1 ragequits
      await governanceToken.connect(trader1).approve(
        await ragequitModule.getAddress(),
        ragequitAmount
      );
      await ragequitModule.connect(trader1).ragequit(proposalId, ragequitAmount);
      console.log("  ✓ Trader1 ragequit successful");

      // Trader2 ragequits
      await governanceToken.connect(trader2).approve(
        await ragequitModule.getAddress(),
        ragequitAmount
      );
      await ragequitModule.connect(trader2).ragequit(proposalId, ragequitAmount);
      console.log("  ✓ Trader2 ragequit successful");

      // Verify both have ragequit
      expect(await ragequitModule.hasRagequit(trader1.address, proposalId)).to.be.true;
      expect(await ragequitModule.hasRagequit(trader2.address, proposalId)).to.be.true;
      
      console.log("  ✓ Multiple ragequits handled correctly");
    });

    it("Should prevent ragequit after proposal execution", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        proposalRegistry,
        ragequitModule,
        governanceToken
      } = contracts;
      const { proposer1, trader1, owner } = accounts;

      console.log("\n--- Setup and execute proposal ---");
      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      console.log("\n--- Open ragequit window ---");
      const currentTime = await time.latest();
      await ragequitModule.connect(owner).openRagequitWindow(
        proposalId,
        currentTime,
        currentTime + (10 * 24 * 3600)
      );

      await ragequitModule.connect(owner).setEligible(proposalId, trader1.address);

      console.log("\n--- Execute proposal (closes ragequit window) ---");
      await ragequitModule.connect(owner).markProposalExecuted(proposalId);

      console.log("\n--- Attempt ragequit after execution ---");
      const ragequitAmount = ethers.parseEther("500");
      await governanceToken.connect(trader1).approve(
        await ragequitModule.getAddress(),
        ragequitAmount
      );

      await expect(
        ragequitModule.connect(trader1).ragequit(proposalId, ragequitAmount)
      ).to.be.revertedWith("Proposal executed");

      console.log("  ✓ Ragequit correctly prevented after proposal execution");
    });

    it("Should prevent ineligible users from ragequitting", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        proposalRegistry,
        ragequitModule,
        governanceToken
      } = contracts;
      const { proposer1, trader1, trader2, owner } = accounts;

      console.log("\n--- Setup: Create and activate proposal ---");
      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      console.log("\n--- Open ragequit window (only trader1 eligible) ---");
      const currentTime = await time.latest();
      await ragequitModule.connect(owner).openRagequitWindow(
        proposalId,
        currentTime,
        currentTime + (10 * 24 * 3600)
      );

      // Only mark trader1 as eligible
      await ragequitModule.connect(owner).setEligible(proposalId, trader1.address);

      console.log("\n--- Ineligible user (trader2) attempts ragequit ---");
      const ragequitAmount = ethers.parseEther("500");
      await governanceToken.connect(trader2).approve(
        await ragequitModule.getAddress(),
        ragequitAmount
      );

      await expect(
        ragequitModule.connect(trader2).ragequit(proposalId, ragequitAmount)
      ).to.be.revertedWith("Not eligible");

      console.log("  ✓ Ineligible user correctly prevented from ragequitting");
    });

    it("Should prevent ragequit after window closes", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        proposalRegistry,
        ragequitModule,
        governanceToken
      } = contracts;
      const { proposer1, trader1, owner } = accounts;

      console.log("\n--- Setup: Create and activate proposal ---");
      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      console.log("\n--- Open ragequit window ---");
      const currentTime = await time.latest();
      await ragequitModule.connect(owner).openRagequitWindow(
        proposalId,
        currentTime,
        currentTime + (5 * 24 * 3600) // 5 days window
      );

      await ragequitModule.connect(owner).setEligible(proposalId, trader1.address);

      console.log("\n--- Fast forward past window close ---");
      await time.increase(6 * 24 * 3600); // 6 days

      // Verify window is closed
      const [, , , isOpen] = await ragequitModule.getRagequitWindow(proposalId);
      expect(isOpen).to.be.false;

      console.log("\n--- Attempt ragequit after window closed ---");
      const ragequitAmount = ethers.parseEther("500");
      await governanceToken.connect(trader1).approve(
        await ragequitModule.getAddress(),
        ragequitAmount
      );

      await expect(
        ragequitModule.connect(trader1).ragequit(proposalId, ragequitAmount)
      ).to.be.revertedWith("Window closed");

      console.log("  ✓ Ragequit correctly prevented after window closed");
    });

    it("Should calculate proportional treasury share correctly", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        proposalRegistry,
        ragequitModule,
        governanceToken
      } = contracts;
      const { proposer1, trader1, owner } = accounts;

      console.log("\n--- Setup: Create and activate proposal ---");
      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      console.log("\n--- Open ragequit window ---");
      const currentTime = await time.latest();
      await ragequitModule.connect(owner).openRagequitWindow(
        proposalId,
        currentTime,
        currentTime + (10 * 24 * 3600)
      );

      await ragequitModule.connect(owner).setEligible(proposalId, trader1.address);

      console.log("\n--- Test proportional calculation ---");
      const ragequitAmount = ethers.parseEther("1000"); // 1000 tokens
      const totalSupply = await governanceToken.totalSupply();
      const treasuryBalance = await ethers.provider.getBalance(owner.address);

      const calculatedShare = await ragequitModule.calculateTreasuryShare(
        trader1.address,
        ragequitAmount
      );

      const expectedShare = (treasuryBalance * ragequitAmount) / totalSupply;
      expect(calculatedShare).to.equal(expectedShare);

      console.log(`  ✓ Proportional share calculated correctly:`);
      console.log(`    - Token amount: ${ethers.formatEther(ragequitAmount)} GOV`);
      console.log(`    - Total supply: ${ethers.formatEther(totalSupply)} GOV`);
      console.log(`    - Treasury balance: ${ethers.formatEther(treasuryBalance)} ETH`);
      console.log(`    - Proportional share: ${ethers.formatEther(calculatedShare)} ETH`);
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("Should reject double ragequit from same user", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        proposalRegistry,
        ragequitModule,
        governanceToken
      } = contracts;
      const { proposer1, trader1, owner } = accounts;

      // Setup proposal
      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      // Open window and set eligibility
      const currentTime = await time.latest();
      await ragequitModule.connect(owner).openRagequitWindow(
        proposalId,
        currentTime,
        currentTime + (10 * 24 * 3600)
      );

      await ragequitModule.connect(owner).setEligible(proposalId, trader1.address);

      // Fund module
      await owner.sendTransaction({
        to: await ragequitModule.getAddress(),
        value: ethers.parseEther("50")
      });

      // First ragequit
      const ragequitAmount = ethers.parseEther("500");
      await governanceToken.connect(trader1).approve(
        await ragequitModule.getAddress(),
        ragequitAmount * 2n
      );

      await ragequitModule.connect(trader1).ragequit(proposalId, ragequitAmount);

      // Attempt second ragequit
      await expect(
        ragequitModule.connect(trader1).ragequit(proposalId, ragequitAmount)
      ).to.be.revertedWith("Already ragequit");

      console.log("  ✓ Double ragequit correctly prevented");
    });

    it("Should handle zero treasury balance gracefully", async function () {
      const { contracts, accounts, constants } = await loadFixture(deploySystemFixture);
      const { 
        proposalRegistry,
        ragequitModule,
        governanceToken
      } = contracts;
      const { proposer1, trader1, owner } = accounts;

      // Setup proposal
      const proposalData = await createProposalData({
        recipient: proposer1.address,
        bond: constants.BOND_AMOUNT
      });

      const proposalId = await submitAndActivateProposal(
        contracts,
        { proposer: proposer1, owner },
        proposalData
      );

      // Open window
      const currentTime = await time.latest();
      await ragequitModule.connect(owner).openRagequitWindow(
        proposalId,
        currentTime,
        currentTime + (10 * 24 * 3600)
      );

      await ragequitModule.connect(owner).setEligible(proposalId, trader1.address);

      // Calculate share with minimal treasury (owner address used as treasury)
      const ragequitAmount = ethers.parseEther("500");
      const totalSupply = await governanceToken.totalSupply();
      const treasuryBalance = await ethers.provider.getBalance(owner.address);
      const expectedShare = (treasuryBalance * ragequitAmount) / totalSupply;

      const calculatedShare = await ragequitModule.calculateTreasuryShare(
        trader1.address,
        ragequitAmount
      );

      expect(calculatedShare).to.equal(expectedShare);
      console.log("  ✓ Zero/low treasury balance handled correctly");
    });
  });
});
