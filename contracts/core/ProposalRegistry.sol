// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../access/TieredRoleManager.sol";

/**
 * @title ProposalRegistry
 * @notice Permissionless submission interface for funding requests with role-based admin controls
 * @dev Manages proposals with standardized metadata and collateral bonding
 * Supports both native token (ETH/ETC) and ERC20 token funding
 * 
 * RBAC INTEGRATION:
 * - Proposal submission is permissionless (anyone can submit with bond)
 * - Admin functions require OPERATIONS_ADMIN_ROLE
 * - ClearPath users with CLEARPATH_USER_ROLE get benefits
 */
contract ProposalRegistry is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

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
        uint256 executionDeadline;  // Deadline for execution after approval
        uint256 startDate;           // Earliest date proposal can be executed
        address fundingToken;        // Address(0) for native token, otherwise ERC20 address
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

    // FutarchyGovernor address - allowed to return bonds
    address public governor;

    bool private _initialized;
    
    // Role-based access control
    TieredRoleManager public roleManager;

    event ProposalSubmitted(
        uint256 indexed proposalId,
        address indexed proposer,
        string title,
        uint256 fundingAmount,
        address fundingToken,
        uint256 executionDeadline
    );
    event ProposalCancelled(uint256 indexed proposalId);
    event ProposalActivated(uint256 indexed proposalId);
    event BondForfeited(uint256 indexed proposalId, address indexed proposer);
    event BondReturned(uint256 indexed proposalId, address indexed proposer);
    event GovernorSet(address indexed governor);
    event BondAmountUpdated(uint256 oldAmount, uint256 newAmount);

    modifier onlyOwnerOrGovernor() {
        require(msg.sender == owner() || msg.sender == governor, "Not authorized");
        _;
    }

    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Set the role manager contract
     * @param _roleManager Address of TieredRoleManager contract
     */
    function setRoleManager(address _roleManager) external onlyOwner {
        require(_roleManager != address(0), "Invalid role manager address");
        require(address(roleManager) == address(0), "Role manager already set");
        roleManager = TieredRoleManager(_roleManager);
    }

    /**
     * @notice Initialize the contract (used for clones)
     * @param initialOwner Address of the initial owner
     */
    function initialize(address initialOwner) external {
        require(!_initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        _initialized = true;
        _transferOwnership(initialOwner);
    }

    /**
     * @notice Submit a new funding proposal with constraints
     * @param title Proposal title
     * @param description Detailed description
     * @param fundingAmount Amount requested from treasury
     * @param recipient Address to receive funds
     * @param welfareMetricId Welfare metric for evaluation
     * @param fundingToken Token address (address(0) for native token)
     * @param startDate Earliest date proposal can be executed (0 for immediate)
     * @param executionDeadline Latest date proposal can be executed (must be set)
     */
    function submitProposal(
        string calldata title,
        string calldata description,
        uint256 fundingAmount,
        address payable recipient,
        uint256 welfareMetricId,
        address fundingToken,
        uint256 startDate,
        uint256 executionDeadline
    ) external payable nonReentrant returns (uint256) {
        require(msg.value == bondAmount, "Incorrect bond amount");
        require(fundingAmount > 0 && fundingAmount <= MAX_PROPOSAL_AMOUNT, "Invalid funding amount");
        require(recipient != address(0), "Invalid recipient");
        require(bytes(title).length > 0 && bytes(title).length <= 100, "Invalid title length");
        require(executionDeadline > block.timestamp, "Deadline must be in future");
        require(executionDeadline > startDate, "Deadline must be after start date");
        
        // If startDate is 0, set it to current time
        uint256 effectiveStartDate = startDate == 0 ? block.timestamp : startDate;
        require(effectiveStartDate >= block.timestamp, "Start date cannot be in past");

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
        newProposal.startDate = effectiveStartDate;
        newProposal.executionDeadline = executionDeadline;
        newProposal.fundingToken = fundingToken;
        newProposal.status = ProposalStatus.Reviewing;

        emit ProposalSubmitted(proposalId, msg.sender, title, fundingAmount, fundingToken, executionDeadline);
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
     * @notice Set the governor address that can return bonds
     * @param _governor Address of the FutarchyGovernor contract
     */
    function setGovernor(address _governor) external onlyOwner {
        require(_governor != address(0), "Invalid governor address");
        governor = _governor;
        emit GovernorSet(_governor);
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
    function returnBond(uint256 proposalId) external onlyOwnerOrGovernor nonReentrant {
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
        uint256 oldAmount = bondAmount;
        bondAmount = newBondAmount;
        emit BondAmountUpdated(oldAmount, newBondAmount);
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
        ProposalStatus status,
        address fundingToken,
        uint256 startDate,
        uint256 executionDeadline
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
            proposal.status,
            proposal.fundingToken,
            proposal.startDate,
            proposal.executionDeadline
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
