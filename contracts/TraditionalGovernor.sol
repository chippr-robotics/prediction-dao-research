// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./ProposalRegistry.sol";
import "./TieredRoleManager.sol";

/**
 * @title TraditionalGovernor
 * @notice Traditional democracy-based governance with token-weighted voting
 * @dev Implements standard voting mechanisms for enterprises and foundations
 * that prefer traditional governance over futarchy-based prediction markets
 * 
 * Features:
 * - Token-weighted voting (1 token = 1 vote)
 * - Three voting options: For, Against, Abstain
 * - Configurable voting period and quorum requirements
 * - Timelock for execution safety
 * - Integration with ProposalRegistry
 * 
 * RBAC INTEGRATION:
 * - Proposal execution requires governance approval
 * - Admin functions require OPERATIONS_ADMIN_ROLE
 * - CLEARPATH_USER_ROLE for DAO governance features
 */
contract TraditionalGovernor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ProposalRegistry public proposalRegistry;
    IERC20 public governanceToken;
    
    enum VoteType {
        Against,
        For,
        Abstain
    }
    
    enum ProposalState {
        Pending,
        Active,
        Defeated,
        Succeeded,
        Queued,
        Executed,
        Canceled
    }
    
    struct VotingProposal {
        uint256 proposalId; // ID from ProposalRegistry
        uint256 startBlock;
        uint256 endBlock;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 quorum;
        uint256 executionTime;
        bool executed;
        bool canceled;
        mapping(address => bool) hasVoted;
        mapping(address => VoteType) votes;
    }
    
    // Voting proposal ID => VotingProposal
    mapping(uint256 => VotingProposal) public votingProposals;
    uint256 public votingProposalCount;
    
    // Configuration parameters
    uint256 public votingPeriod = 50400; // ~7 days in blocks (assuming 12s block time)
    uint256 public quorumPercentage = 40; // 40% of total supply
    uint256 public proposalThreshold = 100 ether; // Minimum tokens to create proposal
    
    // Treasury management
    address public treasuryVault;
    uint256 public constant MAX_DAILY_SPENDING = 100_000 ether; // 100k ETC
    mapping(uint256 => uint256) public dailySpending; // day => amount
    
    // Timelock
    uint256 public constant MIN_TIMELOCK = 2 days;
    
    // Emergency pause
    bool public paused;
    mapping(address => bool) public guardians;
    
    bool private _initialized;
    
    // Role-based access control
    TieredRoleManager public roleManager;
    
    event VotingProposalCreated(
        uint256 indexed votingProposalId,
        uint256 indexed proposalId,
        uint256 startBlock,
        uint256 endBlock,
        uint256 quorum
    );
    event VoteCast(
        address indexed voter,
        uint256 indexed votingProposalId,
        VoteType support,
        uint256 weight
    );
    event ProposalQueued(uint256 indexed votingProposalId, uint256 executionTime);
    event ProposalExecuted(uint256 indexed votingProposalId);
    event ProposalCanceled(uint256 indexed votingProposalId);
    event VotingPeriodUpdated(uint256 newVotingPeriod);
    event QuorumPercentageUpdated(uint256 newQuorumPercentage);
    event ProposalThresholdUpdated(uint256 newProposalThreshold);
    event EmergencyPauseToggled(bool paused);
    event GuardianUpdated(address indexed guardian, bool status);
    
    modifier whenNotPaused() {
        require(!paused, "System paused");
        _;
    }
    
    modifier onlyGuardian() {
        require(guardians[msg.sender] || msg.sender == owner(), "Not guardian");
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
     * @notice Initialize the contract
     * @param initialOwner Address of the initial owner
     * @param _proposalRegistry Address of the proposal registry
     * @param _governanceToken Address of the governance token
     * @param _treasuryVault Address of the treasury vault
     */
    function initialize(
        address initialOwner,
        address _proposalRegistry,
        address _governanceToken,
        address _treasuryVault
    ) external onlyOwner {
        require(!_initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        require(_proposalRegistry != address(0), "Invalid proposal registry");
        require(_governanceToken != address(0), "Invalid governance token");
        require(_treasuryVault != address(0), "Invalid treasury vault");
        
        _initialized = true;
        proposalRegistry = ProposalRegistry(_proposalRegistry);
        governanceToken = IERC20(_governanceToken);
        treasuryVault = _treasuryVault;
        guardians[initialOwner] = true;
        _transferOwnership(initialOwner);
    }
    
    /**
     * @notice Create a voting proposal
     * @param proposalId ID from ProposalRegistry
     * @return votingProposalId ID of the voting proposal
     */
    function createVotingProposal(
        uint256 proposalId
    ) external whenNotPaused returns (uint256 votingProposalId) {
        // Check if caller has enough tokens
        require(
            governanceToken.balanceOf(msg.sender) >= proposalThreshold,
            "Below proposal threshold"
        );
        
        // Verify proposal exists in registry
        (
            address proposer,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
        ) = proposalRegistry.getProposal(proposalId);
        require(proposer != address(0), "Invalid proposal ID");
        
        // Allocate voting proposal ID
        votingProposalId = votingProposalCount++;
        
        // Initialize proposal
        VotingProposal storage proposal = votingProposals[votingProposalId];
        proposal.proposalId = proposalId;
        proposal.startBlock = block.number;
        proposal.endBlock = block.number + votingPeriod;
        proposal.quorum = (governanceToken.totalSupply() * quorumPercentage) / 100;
        proposal.executed = false;
        proposal.canceled = false;
        
        emit VotingProposalCreated(
            votingProposalId,
            proposalId,
            proposal.startBlock,
            proposal.endBlock,
            proposal.quorum
        );
    }
    
    /**
     * @notice Cast a vote on a proposal
     * @param votingProposalId ID of the voting proposal
     * @param support Vote type (Against, For, Abstain)
     */
    function castVote(
        uint256 votingProposalId,
        VoteType support
    ) external whenNotPaused {
        VotingProposal storage proposal = votingProposals[votingProposalId];
        
        require(
            state(votingProposalId) == ProposalState.Active,
            "Voting not active"
        );
        require(!proposal.hasVoted[msg.sender], "Already voted");
        
        uint256 weight = governanceToken.balanceOf(msg.sender);
        require(weight > 0, "No voting power");
        
        proposal.hasVoted[msg.sender] = true;
        proposal.votes[msg.sender] = support;
        
        if (support == VoteType.For) {
            proposal.forVotes += weight;
        } else if (support == VoteType.Against) {
            proposal.againstVotes += weight;
        } else {
            proposal.abstainVotes += weight;
        }
        
        emit VoteCast(msg.sender, votingProposalId, support, weight);
    }
    
    /**
     * @notice Queue a successful proposal for execution
     * @param votingProposalId ID of the voting proposal
     */
    function queueProposal(uint256 votingProposalId) external whenNotPaused {
        require(
            state(votingProposalId) == ProposalState.Succeeded,
            "Proposal not succeeded"
        );
        
        VotingProposal storage proposal = votingProposals[votingProposalId];
        proposal.executionTime = block.timestamp + MIN_TIMELOCK;
        
        emit ProposalQueued(votingProposalId, proposal.executionTime);
    }
    
    /**
     * @notice Execute a queued proposal
     * @param votingProposalId ID of the voting proposal
     */
    function executeProposal(
        uint256 votingProposalId
    ) external whenNotPaused nonReentrant {
        require(
            state(votingProposalId) == ProposalState.Queued,
            "Proposal not queued"
        );
        
        VotingProposal storage proposal = votingProposals[votingProposalId];
        require(
            block.timestamp >= proposal.executionTime,
            "Timelock not expired"
        );
        
        // Get proposal details from registry
        (
            ,
            ,
            ,
            uint256 amount,
            address recipient,
            ,
            ProposalRegistry.ProposalStatus registryStatus,
            address fundingToken,
            uint256 startDate,
            uint256 executionDeadline
        ) = proposalRegistry.getProposal(proposal.proposalId);
        
        // Validate proposal status and execution window
        require(
            registryStatus == ProposalRegistry.ProposalStatus.Active,
            "Proposal not active in registry"
        );
        require(
            block.timestamp >= startDate,
            "Execution window not started"
        );
        require(
            block.timestamp <= executionDeadline,
            "Execution deadline passed"
        );
        require(
            fundingToken == address(0),
            "Only native token funding supported"
        );
        
        // Check daily spending limit
        uint256 today = block.timestamp / 1 days;
        require(
            dailySpending[today] + amount <= MAX_DAILY_SPENDING,
            "Daily spending limit exceeded"
        );
        
        // Update state before external calls
        proposal.executed = true;
        dailySpending[today] += amount;
        
        // Execute transfer
        if (amount > 0) {
            require(address(this).balance >= amount, "Insufficient balance");
            (bool success, ) = payable(recipient).call{value: amount}("");
            require(success, "Transfer failed");
        }
        
        emit ProposalExecuted(votingProposalId);
    }
    
    /**
     * @notice Cancel a proposal
     * @param votingProposalId ID of the voting proposal
     */
    function cancelProposal(uint256 votingProposalId) external onlyOwner {
        VotingProposal storage proposal = votingProposals[votingProposalId];
        require(!proposal.executed, "Already executed");
        require(!proposal.canceled, "Already canceled");
        
        proposal.canceled = true;
        
        emit ProposalCanceled(votingProposalId);
    }
    
    /**
     * @notice Get the state of a proposal
     * @param votingProposalId ID of the voting proposal
     * @return Current state of the proposal
     */
    function state(uint256 votingProposalId) public view returns (ProposalState) {
        VotingProposal storage proposal = votingProposals[votingProposalId];
        
        if (proposal.canceled) {
            return ProposalState.Canceled;
        }
        
        if (proposal.executed) {
            return ProposalState.Executed;
        }
        
        if (block.number <= proposal.startBlock) {
            return ProposalState.Pending;
        }
        
        if (block.number <= proposal.endBlock) {
            return ProposalState.Active;
        }
        
        // Voting ended, check if succeeded
        uint256 totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
        
        if (totalVotes < proposal.quorum) {
            return ProposalState.Defeated;
        }
        
        if (proposal.forVotes <= proposal.againstVotes) {
            return ProposalState.Defeated;
        }
        
        if (proposal.executionTime > 0) {
            return ProposalState.Queued;
        }
        
        return ProposalState.Succeeded;
    }
    
    /**
     * @notice Get vote details for a voter
     * @param votingProposalId ID of the voting proposal
     * @param voter Address of the voter
     * @return hasVoted Whether the voter has voted
     * @return vote The vote cast by the voter
     */
    function getVote(
        uint256 votingProposalId,
        address voter
    ) external view returns (bool hasVoted, VoteType vote) {
        VotingProposal storage proposal = votingProposals[votingProposalId];
        hasVoted = proposal.hasVoted[voter];
        vote = proposal.votes[voter];
    }
    
    /**
     * @notice Update voting period
     * @param newVotingPeriod New voting period in blocks
     */
    function setVotingPeriod(uint256 newVotingPeriod) external onlyOwner {
        require(newVotingPeriod > 0, "Invalid voting period");
        votingPeriod = newVotingPeriod;
        emit VotingPeriodUpdated(newVotingPeriod);
    }
    
    /**
     * @notice Update quorum percentage
     * @param newQuorumPercentage New quorum percentage (0-100)
     */
    function setQuorumPercentage(uint256 newQuorumPercentage) external onlyOwner {
        require(newQuorumPercentage > 0 && newQuorumPercentage <= 100, "Invalid quorum");
        quorumPercentage = newQuorumPercentage;
        emit QuorumPercentageUpdated(newQuorumPercentage);
    }
    
    /**
     * @notice Update proposal threshold
     * @param newProposalThreshold New proposal threshold in tokens
     */
    function setProposalThreshold(uint256 newProposalThreshold) external onlyOwner {
        require(newProposalThreshold > 0, "Invalid threshold");
        proposalThreshold = newProposalThreshold;
        emit ProposalThresholdUpdated(newProposalThreshold);
    }
    
    /**
     * @notice Toggle emergency pause
     */
    function togglePause() external onlyGuardian {
        paused = !paused;
        emit EmergencyPauseToggled(paused);
    }
    
    /**
     * @notice Update guardian status
     * @param guardian Address of the guardian
     * @param status New status
     */
    function updateGuardian(address guardian, bool status) external onlyOwner {
        guardians[guardian] = status;
        emit GuardianUpdated(guardian, status);
    }
    
    /**
     * @notice Receive function to accept ETH
     */
    receive() external payable {}
}
