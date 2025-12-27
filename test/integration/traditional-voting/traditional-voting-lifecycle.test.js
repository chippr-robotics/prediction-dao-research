const { expect } = require("chai");
const { ethers } = require("hardhat");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("Integration: Traditional Voting Lifecycle", function () {
  let traditionalGovernor;
  let proposalRegistry;
  let governanceToken;
  let owner;
  let proposer;
  let voter1;
  let voter2;
  let voter3;
  let recipient;

  beforeEach(async function () {
    [owner, proposer, voter1, voter2, voter3, recipient] = await ethers.getSigners();
    
    // Ensure proposer has enough ETH for bond payments (50 ETH per proposal + gas)
    // This is needed when running as part of full test suite where accounts may be depleted
    const proposerBalance = await ethers.provider.getBalance(proposer.address);
    const requiredBalance = ethers.parseEther("300"); // 6 tests * 50 ETH each
    if (proposerBalance < requiredBalance) {
      const amountNeeded = requiredBalance - proposerBalance;
      const ownerBalance = await ethers.provider.getBalance(owner.address);
      // Only send if owner has enough (leave some for gas)
      if (ownerBalance > amountNeeded + ethers.parseEther("10")) {
        await owner.sendTransaction({
          to: proposer.address,
          value: amountNeeded
        });
      }
    }
    
    // Deploy mock governance token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    governanceToken = await MockERC20.deploy("Governance Token", "GOV", ethers.parseEther("1000000"));
    
    // Distribute tokens for voting
    await governanceToken.transfer(proposer.address, ethers.parseEther("200000")); // Above threshold
    await governanceToken.transfer(voter1.address, ethers.parseEther("250000")); // 25% of supply
    await governanceToken.transfer(voter2.address, ethers.parseEther("200000")); // 20% of supply
    await governanceToken.transfer(voter3.address, ethers.parseEther("150000")); // 15% of supply
    
    // Deploy ProposalRegistry
    const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
    proposalRegistry = await ProposalRegistry.deploy();
    await proposalRegistry.initialize(owner.address);
    
    // Deploy TraditionalGovernor
    const TraditionalGovernor = await ethers.getContractFactory("TraditionalGovernor");
    traditionalGovernor = await TraditionalGovernor.deploy();
    await traditionalGovernor.initialize(
      owner.address,
      await proposalRegistry.getAddress(),
      await governanceToken.getAddress(),
      owner.address // treasury vault
    );
    
    // Fund the governor for execution
    await owner.sendTransaction({
      to: await traditionalGovernor.getAddress(),
      value: ethers.parseEther("100")
    });
  });

  it("Should complete full traditional voting lifecycle", async function () {
    // Step 1: Submit proposal to registry
    const bondAmount = await proposalRegistry.bondAmount();
    const latestBlock = await ethers.provider.getBlock('latest');
    const executionDeadline = latestBlock.timestamp + 30 * 24 * 60 * 60;
    
    await proposalRegistry.connect(proposer).submitProposal(
      "Community Grant Proposal",
      "Funding for development of new features",
      ethers.parseEther("50"),
      recipient.address,
      0, // welfare metric
      ethers.ZeroAddress, // native token
      0, // start date (immediate)
      executionDeadline,
      { value: bondAmount }
    );
    
    const proposalId = 0;
    
    // Verify proposal was created
    const proposal = await proposalRegistry.getProposal(proposalId);
    expect(proposal[0]).to.equal(proposer.address); // proposer
    expect(proposal[3]).to.equal(ethers.parseEther("50")); // fundingAmount
    
    // Fast forward past review period and activate proposal
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await mine(1);
    await proposalRegistry.activateProposal(proposalId);
    
    // Step 2: Create voting proposal
    const tx = await traditionalGovernor.connect(proposer).createVotingProposal(proposalId);
    await tx.wait();
    
    const votingProposalId = 0;
    const votingProposal = await traditionalGovernor.votingProposals(votingProposalId);
    
    expect(votingProposal.proposalId).to.equal(proposalId);
    expect(votingProposal.executed).to.equal(false);
    
    // Verify state is Active (after mining a block)
    await mine(1);
    let state = await traditionalGovernor.state(votingProposalId);
    expect(state).to.equal(1); // Active
    
    // Step 3: Cast votes
    // voter1 votes For (25% of supply)
    await traditionalGovernor.connect(voter1).castVote(votingProposalId, 1);
    
    // voter2 votes For (20% of supply)
    await traditionalGovernor.connect(voter2).castVote(votingProposalId, 1);
    
    // voter3 votes Against (15% of supply)
    await traditionalGovernor.connect(voter3).castVote(votingProposalId, 0);
    
    // Verify votes were recorded
    const updatedProposal = await traditionalGovernor.votingProposals(votingProposalId);
    expect(updatedProposal.forVotes).to.equal(ethers.parseEther("450000")); // 25% + 20%
    expect(updatedProposal.againstVotes).to.equal(ethers.parseEther("150000")); // 15%
    
    // Step 4: Wait for voting period to end
    const votingPeriod = await traditionalGovernor.votingPeriod();
    await mine(Number(votingPeriod) + 1);
    
    // Verify state is Succeeded
    state = await traditionalGovernor.state(votingProposalId);
    expect(state).to.equal(3); // Succeeded
    
    // Step 5: Queue proposal for execution
    await traditionalGovernor.queueProposal(votingProposalId);
    
    // Verify state is Queued
    state = await traditionalGovernor.state(votingProposalId);
    expect(state).to.equal(4); // Queued
    
    const queuedProposal = await traditionalGovernor.votingProposals(votingProposalId);
    expect(queuedProposal.executionTime).to.be.gt(0);
    
    // Step 6: Wait for timelock to expire
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await mine(1);
    
    // Step 7: Execute proposal
    const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);
    
    await traditionalGovernor.executeProposal(votingProposalId);
    
    const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
    
    // Verify funds were transferred
    expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(ethers.parseEther("50"));
    
    // Verify state is Executed
    state = await traditionalGovernor.state(votingProposalId);
    expect(state).to.equal(5); // Executed
    
    const executedProposal = await traditionalGovernor.votingProposals(votingProposalId);
    expect(executedProposal.executed).to.equal(true);
  });

  it("Should reject proposal when quorum is not met", async function () {
    // Submit proposal
    const bondAmount = await proposalRegistry.bondAmount();
    const latestBlock = await ethers.provider.getBlock('latest');
    const executionDeadline = latestBlock.timestamp + 30 * 24 * 60 * 60;
    
    await proposalRegistry.connect(proposer).submitProposal(
      "Low Participation Proposal",
      "This proposal will not reach quorum",
      ethers.parseEther("25"),
      recipient.address,
      0,
      ethers.ZeroAddress,
      0,
      executionDeadline,
      { value: bondAmount }
    );
    
    // Create voting proposal
    await traditionalGovernor.connect(proposer).createVotingProposal(0);
    const votingProposalId = 0;
    
    // Only voter3 votes (15% of supply, below 40% quorum)
    await traditionalGovernor.connect(voter3).castVote(votingProposalId, 1);
    
    // Wait for voting period to end
    const votingPeriod = await traditionalGovernor.votingPeriod();
    await mine(Number(votingPeriod) + 1);
    
    // Verify state is Defeated (quorum not met)
    const state = await traditionalGovernor.state(votingProposalId);
    expect(state).to.equal(2); // Defeated
    
    // Cannot queue a defeated proposal
    await expect(
      traditionalGovernor.queueProposal(votingProposalId)
    ).to.be.revertedWith("Proposal not succeeded");
  });

  it("Should reject proposal when Against votes win", async function () {
    // Submit proposal
    const bondAmount = await proposalRegistry.bondAmount();
    const latestBlock = await ethers.provider.getBlock('latest');
    const executionDeadline = latestBlock.timestamp + 30 * 24 * 60 * 60;
    
    await proposalRegistry.connect(proposer).submitProposal(
      "Controversial Proposal",
      "This proposal will be voted down",
      ethers.parseEther("75"),
      recipient.address,
      0,
      ethers.ZeroAddress,
      0,
      executionDeadline,
      { value: bondAmount }
    );
    
    // Create voting proposal
    await traditionalGovernor.connect(proposer).createVotingProposal(0);
    const votingProposalId = 0;
    
    // Majority votes Against
    await traditionalGovernor.connect(voter1).castVote(votingProposalId, 0); // 25% Against
    await traditionalGovernor.connect(voter2).castVote(votingProposalId, 0); // 20% Against
    await traditionalGovernor.connect(voter3).castVote(votingProposalId, 1); // 15% For
    
    // Wait for voting period to end
    const votingPeriod = await traditionalGovernor.votingPeriod();
    await mine(Number(votingPeriod) + 1);
    
    // Verify state is Defeated (more Against than For)
    const state = await traditionalGovernor.state(votingProposalId);
    expect(state).to.equal(2); // Defeated
  });

  it("Should handle multiple concurrent proposals", async function () {
    const bondAmount = await proposalRegistry.bondAmount();
    const latestBlock = await ethers.provider.getBlock('latest');
    const executionDeadline = latestBlock.timestamp + 30 * 24 * 60 * 60;
    
    // Submit multiple proposals
    for (let i = 0; i < 3; i++) {
      await proposalRegistry.connect(proposer).submitProposal(
        `Proposal ${i}`,
        `Description ${i}`,
        ethers.parseEther("10"),
        recipient.address,
        0,
        ethers.ZeroAddress,
        0,
        executionDeadline,
        { value: bondAmount }
      );
      
      await traditionalGovernor.connect(proposer).createVotingProposal(i);
    }
    
    // Vote on all proposals differently
    // Proposal 0: Pass
    await traditionalGovernor.connect(voter1).castVote(0, 1);
    await traditionalGovernor.connect(voter2).castVote(0, 1);
    
    // Proposal 1: Fail
    await traditionalGovernor.connect(voter1).castVote(1, 0);
    await traditionalGovernor.connect(voter2).castVote(1, 0);
    
    // Proposal 2: No quorum
    await traditionalGovernor.connect(voter3).castVote(2, 1);
    
    // Wait for voting period to end
    const votingPeriod = await traditionalGovernor.votingPeriod();
    await mine(Number(votingPeriod) + 1);
    
    // Verify states
    expect(await traditionalGovernor.state(0)).to.equal(3); // Succeeded
    expect(await traditionalGovernor.state(1)).to.equal(2); // Defeated
    expect(await traditionalGovernor.state(2)).to.equal(2); // Defeated (no quorum)
  });

  it("Should handle abstain votes correctly", async function () {
    const bondAmount = await proposalRegistry.bondAmount();
    const latestBlock = await ethers.provider.getBlock('latest');
    const executionDeadline = latestBlock.timestamp + 30 * 24 * 60 * 60;
    
    await proposalRegistry.connect(proposer).submitProposal(
      "Proposal with Abstentions",
      "Testing abstain functionality",
      ethers.parseEther("20"),
      recipient.address,
      0,
      ethers.ZeroAddress,
      0,
      executionDeadline,
      { value: bondAmount }
    );
    
    await traditionalGovernor.connect(proposer).createVotingProposal(0);
    const votingProposalId = 0;
    
    // voter1 votes For (25%)
    await traditionalGovernor.connect(voter1).castVote(votingProposalId, 1);
    
    // voter2 abstains (20%)
    await traditionalGovernor.connect(voter2).castVote(votingProposalId, 2);
    
    // voter3 votes Against (15%)
    await traditionalGovernor.connect(voter3).castVote(votingProposalId, 0);
    
    // Verify votes
    const proposal = await traditionalGovernor.votingProposals(votingProposalId);
    expect(proposal.forVotes).to.equal(ethers.parseEther("250000"));
    expect(proposal.againstVotes).to.equal(ethers.parseEther("150000"));
    expect(proposal.abstainVotes).to.equal(ethers.parseEther("200000"));
    
    // Wait for voting to end
    const votingPeriod = await traditionalGovernor.votingPeriod();
    await mine(Number(votingPeriod) + 1);
    
    // Proposal should succeed (quorum met with 60%, For > Against)
    const state = await traditionalGovernor.state(votingProposalId);
    expect(state).to.equal(3); // Succeeded
  });

  it("Should defeat proposal when abstain helps reach quorum but Against > For", async function () {
    const bondAmount = await proposalRegistry.bondAmount();
    const latestBlock = await ethers.provider.getBlock('latest');
    const executionDeadline = latestBlock.timestamp + 30 * 24 * 60 * 60;
    
    await proposalRegistry.connect(proposer).submitProposal(
      "Proposal with Abstain but More Against",
      "Testing abstain with losing outcome",
      ethers.parseEther("18"),
      recipient.address,
      0,
      ethers.ZeroAddress,
      0,
      executionDeadline,
      { value: bondAmount }
    );
    
    await traditionalGovernor.connect(proposer).createVotingProposal(0);
    const votingProposalId = 0;
    
    // voter1 votes Against (25%)
    await traditionalGovernor.connect(voter1).castVote(votingProposalId, 0);
    
    // voter2 abstains (20%)
    await traditionalGovernor.connect(voter2).castVote(votingProposalId, 2);
    
    // voter3 votes For (15%)
    await traditionalGovernor.connect(voter3).castVote(votingProposalId, 1);
    
    // Verify votes
    const proposal = await traditionalGovernor.votingProposals(votingProposalId);
    expect(proposal.forVotes).to.equal(ethers.parseEther("150000"));
    expect(proposal.againstVotes).to.equal(ethers.parseEther("250000"));
    expect(proposal.abstainVotes).to.equal(ethers.parseEther("200000"));
    
    // Wait for voting to end
    const votingPeriod = await traditionalGovernor.votingPeriod();
    await mine(Number(votingPeriod) + 1);
    
    // Proposal should be defeated (quorum met with 60%, but Against > For)
    const state = await traditionalGovernor.state(votingProposalId);
    expect(state).to.equal(2); // Defeated
  });
});
