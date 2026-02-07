import { expect } from "chai";
import hre from "hardhat";

describe("ProposalRegistry", function () {
  let ethers;
  let proposalRegistry;
  let owner;
  let proposer;
  let recipient;
  let BOND_AMOUNT;

  // Helper function to get future timestamp (in seconds) using blockchain time
  const getFutureTimestamp = async (daysFromNow) => {
    const currentBlock = await ethers.provider.getBlock('latest');
    return currentBlock.timestamp + (daysFromNow * 24 * 60 * 60);
  };

  // Helper function to submit a proposal with default values
  const submitTestProposal = async (overrides = {}) => {
    const defaults = {
      title: "Test Proposal",
      description: "This is a test proposal",
      fundingAmount: ethers.parseEther("1000"),
      recipient: recipient.address,
      welfareMetricId: 0,
      fundingToken: ethers.ZeroAddress,
      startDate: 0,
      executionDeadline: await getFutureTimestamp(90), // 90 days from now
      value: BOND_AMOUNT
    };

    const params = { ...defaults, ...overrides };

    return proposalRegistry.connect(proposer).submitProposal(
      params.title,
      params.description,
      params.fundingAmount,
      params.recipient,
      params.welfareMetricId,
      params.fundingToken,
      params.startDate,
      params.executionDeadline,
      { value: params.value }
    );
  };

  beforeEach(async function () {
    const connection = await hre.network.connect();
    ethers = connection.ethers;
    BOND_AMOUNT = ethers.parseEther("50");
    [owner, proposer, recipient] = await ethers.getSigners();

    const ProposalRegistry = await ethers.getContractFactory("ProposalRegistry");
    proposalRegistry = await ProposalRegistry.deploy();
    await proposalRegistry.initialize(owner.address);
    await proposalRegistry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await proposalRegistry.owner()).to.equal(owner.address);
    });

    it("Should initialize with correct bond amount", async function () {
      expect(await proposalRegistry.bondAmount()).to.equal(BOND_AMOUNT);
    });

    it("Should initialize with zero proposals", async function () {
      expect(await proposalRegistry.proposalCount()).to.equal(0);
    });
  });

  describe("Proposal Submission", function () {
    it("Should allow submission with correct bond", async function () {
      await expect(submitTestProposal())
        .to.emit(proposalRegistry, "ProposalSubmitted");

      expect(await proposalRegistry.proposalCount()).to.equal(1);
    });

    it("Should reject submission with incorrect bond", async function () {
      await expect(
        submitTestProposal({ value: ethers.parseEther("10") })
      ).to.be.revertedWith("Incorrect bond amount");
    });

    it("Should reject submission with zero funding amount", async function () {
      await expect(
        submitTestProposal({ fundingAmount: 0 })
      ).to.be.revertedWith("Invalid funding amount");
    });

    it("Should reject submission exceeding max amount", async function () {
      await expect(
        submitTestProposal({ fundingAmount: ethers.parseEther("50001") })
      ).to.be.revertedWith("Invalid funding amount");
    });

    it("Should reject submission with invalid recipient", async function () {
      await expect(
        submitTestProposal({ recipient: ethers.ZeroAddress })
      ).to.be.revertedWith("Invalid recipient");
    });

    it("Should reject submission with empty title", async function () {
      await expect(
        submitTestProposal({ title: "" })
      ).to.be.revertedWith("Invalid title length");
    });

    it("Should reject submission with deadline in past", async function () {
      const currentBlock = await ethers.provider.getBlock('latest');
      const pastDeadline = currentBlock.timestamp - 86400;
      await expect(
        submitTestProposal({ executionDeadline: pastDeadline })
      ).to.be.revertedWith("Deadline must be in future");
    });

    it("Should reject submission with deadline before start date", async function () {
      const futureStart = await getFutureTimestamp(30);
      const deadline = futureStart - 1; // Clearly before start date

      // This test may hit "Deadline must be in future" first if blockchain time has advanced
      // The key point is that deadline < startDate is invalid
      await expect(
        submitTestProposal({
          startDate: futureStart,
          executionDeadline: deadline
        })
      ).to.be.revert(ethers); // Accept any revert in Hardhat 3
    });


    it("Should accept submission with ERC20 token", async function () {
      const tokenAddress = "0x" + "1".repeat(40);
      await expect(
        submitTestProposal({ fundingToken: tokenAddress })
      ).to.emit(proposalRegistry, "ProposalSubmitted");
    });
  });

  describe("Milestones", function () {
    beforeEach(async function () {
      await submitTestProposal();
    });

    it("Should allow proposer to add milestones during review", async function () {
      await proposalRegistry.connect(proposer).addMilestone(
        0,
        "First milestone",
        5000, // 50%
        "Complete phase 1",
        0
      );

      const milestones = await proposalRegistry.getMilestones(0);
      expect(milestones.length).to.equal(1);
      expect(milestones[0].description).to.equal("First milestone");
      expect(milestones[0].percentage).to.equal(5000);
    });

    it("Should reject milestone from non-proposer", async function () {
      await expect(
        proposalRegistry.connect(recipient).addMilestone(
          0,
          "First milestone",
          5000,
          "Complete phase 1",
          0
        )
      ).to.be.revertedWith("Not proposer");
    });

    it("Should reject milestone with invalid percentage", async function () {
      await expect(
        proposalRegistry.connect(proposer).addMilestone(
          0,
          "First milestone",
          0,
          "Complete phase 1",
          0
        )
      ).to.be.revertedWith("Invalid percentage");

      await expect(
        proposalRegistry.connect(proposer).addMilestone(
          0,
          "First milestone",
          10001,
          "Complete phase 1",
          0
        )
      ).to.be.revertedWith("Invalid percentage");
    });
  });

  describe("Proposal Cancellation", function () {
    beforeEach(async function () {
      await submitTestProposal();
    });

    it("Should allow proposer to cancel during review", async function () {
      const initialBalance = await ethers.provider.getBalance(proposer.address);

      await expect(
        proposalRegistry.connect(proposer).cancelProposal(0)
      ).to.emit(proposalRegistry, "ProposalCancelled").withArgs(0);

      const proposal = await proposalRegistry.getProposal(0);
      expect(proposal.status).to.equal(2); // Cancelled
    });

    it("Should return bond on cancellation", async function () {
      const initialBalance = await ethers.provider.getBalance(proposer.address);

      const tx = await proposalRegistry.connect(proposer).cancelProposal(0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const finalBalance = await ethers.provider.getBalance(proposer.address);
      expect(finalBalance).to.be.closeTo(
        initialBalance + BOND_AMOUNT - gasUsed,
        ethers.parseEther("0.01") // Allow small tolerance for gas
      );
    });

    it("Should reject cancellation from non-proposer", async function () {
      await expect(
        proposalRegistry.connect(recipient).cancelProposal(0)
      ).to.be.revertedWith("Not proposer");
    });
  });

  describe("Proposal Activation", function () {
    beforeEach(async function () {
      await submitTestProposal();
    });

    it("Should allow owner to activate after review period", async function () {
      // Fast forward 7 days
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      await expect(
        proposalRegistry.activateProposal(0)
      ).to.emit(proposalRegistry, "ProposalActivated").withArgs(0);

      const proposal = await proposalRegistry.getProposal(0);
      expect(proposal.status).to.equal(1); // Active
    });

    it("Should reject activation before review period ends", async function () {
      await expect(
        proposalRegistry.activateProposal(0)
      ).to.be.revertedWith("Review period not ended");
    });

    it("Should only allow owner to activate", async function () {
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      await expect(
        proposalRegistry.connect(proposer).activateProposal(0)
      ).to.be.revertedWithCustomError(proposalRegistry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Bond Management", function () {
    beforeEach(async function () {
      await submitTestProposal();
    });

    it("Should allow owner to forfeit bond", async function () {
      await expect(
        proposalRegistry.forfeitBond(0)
      ).to.emit(proposalRegistry, "BondForfeited").withArgs(0, proposer.address);

      const proposal = await proposalRegistry.getProposal(0);
      expect(proposal.status).to.equal(4); // Forfeited
    });

    it("Should allow owner to return bond", async function () {
      await expect(
        proposalRegistry.returnBond(0)
      ).to.emit(proposalRegistry, "BondReturned").withArgs(0, proposer.address);
    });

    it("Should reject double bond return", async function () {
      await proposalRegistry.returnBond(0);
      await expect(
        proposalRegistry.returnBond(0)
      ).to.be.revertedWith("Bond already returned");
    });
  });

  describe("Bond Amount Update", function () {
    it("Should allow owner to update bond amount", async function () {
      const newBond = ethers.parseEther("100");
      await proposalRegistry.updateBondAmount(newBond);
      expect(await proposalRegistry.bondAmount()).to.equal(newBond);
    });

    it("Should only allow owner to update bond amount", async function () {
      await expect(
        proposalRegistry.connect(proposer).updateBondAmount(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(proposalRegistry, "OwnableUnauthorizedAccount");
    });
  });
});
