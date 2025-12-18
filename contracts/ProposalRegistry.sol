// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ProposalRegistry
 * @notice Permissionless submission interface for funding requests
 * @dev Manages proposals with standardized metadata and collateral bonding
 */
contract ProposalRegistry is Ownable, ReentrancyGuard {
    struct Milestone {
        string description;
        uint256 percentage; // Basis points (10000 = 100%)
        string completionCriteria;
        uint256 timelockDays;
        bool completed;
    }

    struct Proposal {
        address proposer;
        string title;
        string description;
        uint256 fundingAmount;
        address payable recipient;
        uint256 welfareMetricId;
        uint256 bondAmount;
        uint256 submittedAt;
        uint256 reviewEndsAt;
        ProposalStatus status;
        Milestone[] milestones;
    }

    enum ProposalStatus {
        Reviewing,
        Active,
        Cancelled,
        Executed,
        Forfeited
    }

    // Proposal ID => Proposal
    mapping(uint256 => Proposal) public proposals;
    
    uint256 public proposalCount;
    uint256 public bondAmount = 50 ether; // 50 ETC initial bond
    uint256 public constant REVIEW_PERIOD = 7 days;
    uint256 public constant MAX_PROPOSAL_AMOUNT = 50000 ether; // 50k ETC max

    event ProposalSubmitted(
        uint256 indexed proposalId,
        address indexed proposer,
        string title,
        uint256 fundingAmount
    );
    event ProposalCancelled(uint256 indexed proposalId);
    event ProposalActivated(uint256 indexed proposalId);
    event BondForfeited(uint256 indexed proposalId, address indexed proposer);
    event BondReturned(uint256 indexed proposalId, address indexed proposer);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Submit a new funding proposal
     * @param title Proposal title
     * @param description Detailed description
     * @param fundingAmount Amount requested from treasury
     * @param recipient Address to receive funds
     * @param welfareMetricId Welfare metric for evaluation
     */
    function submitProposal(
        string calldata title,
        string calldata description,
        uint256 fundingAmount,
        address payable recipient,
        uint256 welfareMetricId
    ) external payable nonReentrant returns (uint256) {
        require(msg.value == bondAmount, "Incorrect bond amount");
        require(fundingAmount > 0 && fundingAmount <= MAX_PROPOSAL_AMOUNT, "Invalid funding amount");
        require(recipient != address(0), "Invalid recipient");
        require(bytes(title).length > 0 && bytes(title).length <= 100, "Invalid title length");

        uint256 proposalId = proposalCount++;

        Proposal storage newProposal = proposals[proposalId];
        newProposal.proposer = msg.sender;
        newProposal.title = title;
        newProposal.description = description;
        newProposal.fundingAmount = fundingAmount;
        newProposal.recipient = recipient;
        newProposal.welfareMetricId = welfareMetricId;
        newProposal.bondAmount = msg.value;
        newProposal.submittedAt = block.timestamp;
        newProposal.reviewEndsAt = block.timestamp + REVIEW_PERIOD;
        newProposal.status = ProposalStatus.Reviewing;

        emit ProposalSubmitted(proposalId, msg.sender, title, fundingAmount);
        return proposalId;
    }

    /**
     * @notice Add milestone to a proposal
     * @param proposalId ID of the proposal
     * @param description Milestone description
     * @param percentage Percentage of total funding (basis points)
     * @param completionCriteria Criteria for completion
     * @param timelockDays Days to wait after previous milestone
     */
    function addMilestone(
        uint256 proposalId,
        string calldata description,
        uint256 percentage,
        string calldata completionCriteria,
        uint256 timelockDays
    ) external {
        require(proposalId < proposalCount, "Invalid proposal ID");
        Proposal storage proposal = proposals[proposalId];
        require(msg.sender == proposal.proposer, "Not proposer");
        require(proposal.status == ProposalStatus.Reviewing, "Not in review");
        require(percentage > 0 && percentage <= 10000, "Invalid percentage");

        proposal.milestones.push(Milestone({
            description: description,
            percentage: percentage,
            completionCriteria: completionCriteria,
            timelockDays: timelockDays,
            completed: false
        }));
    }

    /**
     * @notice Cancel a proposal during review period
     * @param proposalId ID of the proposal
     */
    function cancelProposal(uint256 proposalId) external nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(msg.sender == proposal.proposer, "Not proposer");
        require(proposal.status == ProposalStatus.Reviewing, "Not in review");

        proposal.status = ProposalStatus.Cancelled;

        // Return bond
        (bool success, ) = payable(proposal.proposer).call{value: proposal.bondAmount}("");
        require(success, "Bond return failed");

        emit ProposalCancelled(proposalId);
        emit BondReturned(proposalId, proposal.proposer);
    }

    /**
     * @notice Activate proposal after review period
     * @param proposalId ID of the proposal
     */
    function activateProposal(uint256 proposalId) external onlyOwner {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Reviewing, "Not in review");
        require(block.timestamp >= proposal.reviewEndsAt, "Review period not ended");

        proposal.status = ProposalStatus.Active;
        emit ProposalActivated(proposalId);
    }

    /**
     * @notice Forfeit bond for spam or malicious proposals
     * @param proposalId ID of the proposal
     */
    function forfeitBond(uint256 proposalId) external onlyOwner nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Reviewing || proposal.status == ProposalStatus.Active, "Invalid status");

        proposal.status = ProposalStatus.Forfeited;

        emit BondForfeited(proposalId, proposal.proposer);
    }

    /**
     * @notice Return bond after successful resolution
     * @param proposalId ID of the proposal
     */
    function returnBond(uint256 proposalId) external onlyOwner nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.bondAmount > 0, "Bond already returned");

        uint256 amount = proposal.bondAmount;
        proposal.bondAmount = 0;

        (bool success, ) = payable(proposal.proposer).call{value: amount}("");
        require(success, "Bond return failed");

        emit BondReturned(proposalId, proposal.proposer);
    }

    /**
     * @notice Update bond amount
     * @param newBondAmount New bond amount in wei
     */
    function updateBondAmount(uint256 newBondAmount) external onlyOwner {
        bondAmount = newBondAmount;
    }

    /**
     * @notice Get proposal details
     * @param proposalId ID of the proposal
     */
    function getProposal(uint256 proposalId) external view returns (
        address proposer,
        string memory title,
        string memory description,
        uint256 fundingAmount,
        address recipient,
        uint256 welfareMetricId,
        ProposalStatus status
    ) {
        require(proposalId < proposalCount, "Invalid proposal ID");
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.proposer,
            proposal.title,
            proposal.description,
            proposal.fundingAmount,
            proposal.recipient,
            proposal.welfareMetricId,
            proposal.status
        );
    }

    /**
     * @notice Get proposal milestones
     * @param proposalId ID of the proposal
     */
    function getMilestones(uint256 proposalId) external view returns (Milestone[] memory) {
        require(proposalId < proposalCount, "Invalid proposal ID");
        return proposals[proposalId].milestones;
    }
}
