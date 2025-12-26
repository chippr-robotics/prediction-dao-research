// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./WelfareMetricRegistry.sol";
import "./ProposalRegistry.sol";
import "./ConditionalMarketFactory.sol";
import "./PrivacyCoordinator.sol";
import "./OracleResolver.sol";
import "./RagequitModule.sol";
import "./TieredRoleManager.sol";

/**
 * @title FutarchyGovernor
 * @notice Main governance coordinator with comprehensive role-based access control
 * @dev Coordinates prediction markets, privacy mechanisms, and proposal execution
 * Supports both native token and ERC20 token funding
 * 
 * RBAC INTEGRATION:
 * - Proposal execution requires governance approval
 * - Admin functions require OPERATIONS_ADMIN_ROLE
 * - CLEARPATH_USER_ROLE for DAO governance features
 */
contract FutarchyGovernor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    WelfareMetricRegistry public welfareRegistry;
    ProposalRegistry public proposalRegistry;
    ConditionalMarketFactory public marketFactory;
    PrivacyCoordinator public privacyCoordinator;
    OracleResolver public oracleResolver;
    RagequitModule public ragequitModule;

    enum ProposalPhase {
        Submission,
        MarketTrading,
        Resolution,
        Execution,
        Completed,
        Rejected
    }

    struct GovernanceProposal {
        uint256 proposalId;
        uint256 marketId;
        ProposalPhase phase;
        uint256 createdAt;
        uint256 executionTime;
        bool executed;
    }

    // Governance proposal ID => GovernanceProposal
    mapping(uint256 => GovernanceProposal) public governanceProposals;
    uint256 public governanceProposalCount;

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

    event GovernanceProposalCreated(uint256 indexed governanceProposalId, uint256 indexed proposalId, uint256 indexed marketId);
    event ProposalPhaseChanged(uint256 indexed governanceProposalId, ProposalPhase newPhase);
    event ProposalExecuted(uint256 indexed governanceProposalId, address recipient, uint256 amount);
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
     * @notice Initialize the contract (used for clones)
     * @param initialOwner Address of the initial owner
     * @param _welfareRegistry Address of the welfare registry
     * @param _proposalRegistry Address of the proposal registry
     * @param _marketFactory Address of the market factory
     * @param _privacyCoordinator Address of the privacy coordinator
     * @param _oracleResolver Address of the oracle resolver
     * @param _ragequitModule Address of the ragequit module
     * @param _treasuryVault Address of the treasury vault
     */
    function initialize(
        address initialOwner,
        address _welfareRegistry,
        address _proposalRegistry,
        address _marketFactory,
        address _privacyCoordinator,
        address _oracleResolver,
        address payable _ragequitModule,
        address _treasuryVault
    ) external {
        require(!_initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        require(_welfareRegistry != address(0), "Invalid welfare registry");
        require(_proposalRegistry != address(0), "Invalid proposal registry");
        require(_marketFactory != address(0), "Invalid market factory");
        require(_privacyCoordinator != address(0), "Invalid privacy coordinator");
        require(_oracleResolver != address(0), "Invalid oracle resolver");
        require(_ragequitModule != address(0), "Invalid ragequit module");
        require(_treasuryVault != address(0), "Invalid treasury vault");

        _initialized = true;
        welfareRegistry = WelfareMetricRegistry(_welfareRegistry);
        proposalRegistry = ProposalRegistry(_proposalRegistry);
        marketFactory = ConditionalMarketFactory(_marketFactory);
        privacyCoordinator = PrivacyCoordinator(_privacyCoordinator);
        oracleResolver = OracleResolver(_oracleResolver);
        ragequitModule = RagequitModule(_ragequitModule);
        treasuryVault = _treasuryVault;
        guardians[initialOwner] = true;
        _transferOwnership(initialOwner);
    }

    /**
     * @notice Create a governance proposal with prediction market
     * @param proposalId ID from ProposalRegistry
     * @param liquidityAmount Initial market liquidity
     * @param liquidityParameter LMSR beta parameter
     * @param tradingPeriod Trading period in seconds
     * @return governanceProposalId ID of the governance proposal
     */
    function createGovernanceProposal(
        uint256 proposalId,
        uint256 liquidityAmount,
        uint256 liquidityParameter,
        uint256 tradingPeriod
    ) external onlyOwner whenNotPaused returns (uint256 governanceProposalId) {
        // Allocate governance proposal ID first
        governanceProposalId = governanceProposalCount++;

        // Deploy conditional market with PassFail bet type (appropriate for governance)
        uint256 marketId = marketFactory.deployMarketPair(
            proposalId,
            address(0), // ETH as collateral
            liquidityAmount,
            liquidityParameter,
            tradingPeriod,
            ConditionalMarketFactory.BetType.PassFail
        );

        // Store governance proposal after external call
        governanceProposals[governanceProposalId] = GovernanceProposal({
            proposalId: proposalId,
            marketId: marketId,
            phase: ProposalPhase.MarketTrading,
            createdAt: block.timestamp,
            executionTime: 0,
            executed: false
        });

        emit GovernanceProposalCreated(governanceProposalId, proposalId, marketId);
        emit ProposalPhaseChanged(governanceProposalId, ProposalPhase.MarketTrading);
    }

    /**
     * @notice Transition proposal to resolution phase
     * @param governanceProposalId ID of the governance proposal
     */
    function moveToResolution(uint256 governanceProposalId) external onlyOwner whenNotPaused {
        GovernanceProposal storage govProposal = governanceProposals[governanceProposalId];
        require(govProposal.phase == ProposalPhase.MarketTrading, "Invalid phase");

        // Update state BEFORE external call (CEI pattern)
        govProposal.phase = ProposalPhase.Resolution;
        
        // End market trading
        marketFactory.endTrading(govProposal.marketId);

        emit ProposalPhaseChanged(governanceProposalId, ProposalPhase.Resolution);
    }

    /**
     * @notice Finalize proposal after oracle resolution
     * @param governanceProposalId ID of the governance proposal
     */
    function finalizeProposal(uint256 governanceProposalId) external onlyOwner whenNotPaused {
        GovernanceProposal storage govProposal = governanceProposals[governanceProposalId];
        require(govProposal.phase == ProposalPhase.Resolution, "Invalid phase");

        // Get resolution from oracle
        (
            ,
            uint256 passValue,
            uint256 failValue,
            bool finalized
        ) = oracleResolver.getResolution(govProposal.proposalId);

        require(finalized, "Resolution not finalized");

        // Decide based on market prediction (simplified: pass if passValue > failValue)
        // Update state BEFORE external calls (CEI pattern)
        if (passValue > failValue) {
            govProposal.phase = ProposalPhase.Execution;
            govProposal.executionTime = block.timestamp + MIN_TIMELOCK;
        } else {
            govProposal.phase = ProposalPhase.Rejected;
        }
        
        // Resolve market AFTER state updates
        marketFactory.resolveMarket(govProposal.marketId, passValue, failValue);

        // Open ragequit window if proposal passed
        if (passValue > failValue) {
            ragequitModule.openRagequitWindow(
                govProposal.proposalId,
                block.timestamp,
                govProposal.executionTime
            );
        }

        emit ProposalPhaseChanged(governanceProposalId, govProposal.phase);
    }

    /**
     * @notice Execute approved proposal after timelock
     * @param governanceProposalId ID of the governance proposal
     */
    function executeProposal(uint256 governanceProposalId) external onlyOwner whenNotPaused nonReentrant {
        GovernanceProposal storage govProposal = governanceProposals[governanceProposalId];
        require(govProposal.phase == ProposalPhase.Execution, "Invalid phase");
        require(block.timestamp >= govProposal.executionTime, "Timelock not expired");
        require(!govProposal.executed, "Already executed");

        // Get proposal details
        (
            ,
            ,
            ,
            uint256 fundingAmount,
            address recipient,
            ,
            ProposalRegistry.ProposalStatus status,
            address fundingToken,
            uint256 startDate,
            uint256 executionDeadline
        ) = proposalRegistry.getProposal(govProposal.proposalId);
        
        // Verify proposal is still active (not cancelled or expired)
        require(status == ProposalRegistry.ProposalStatus.Active, "Proposal must be active");

        // Check execution constraints
        require(block.timestamp >= startDate, "Execution start date not reached");
        require(block.timestamp <= executionDeadline, "Execution deadline passed");

        // Check daily spending limit
        uint256 today = block.timestamp / 1 days;
        require(dailySpending[today] + fundingAmount <= MAX_DAILY_SPENDING, "Daily limit exceeded");

        govProposal.executed = true;
        govProposal.phase = ProposalPhase.Completed;
        dailySpending[today] += fundingAmount;

        // Execute fund transfer based on token type
        if (fundingToken == address(0)) {
            // Native token (ETH/ETC)
            (bool success, ) = payable(recipient).call{value: fundingAmount}("");
            require(success, "Transfer failed");
        } else {
            // ERC20 token - Transfer from this contract (not treasuryVault) 
            // Treasury should transfer approved funds to this contract before execution
            // This prevents arbitrary transferFrom vulnerability
            IERC20(fundingToken).safeTransfer(recipient, fundingAmount);
        }

        // Mark ragequit window as closed
        ragequitModule.markProposalExecuted(govProposal.proposalId);

        // Return proposal bond
        proposalRegistry.returnBond(govProposal.proposalId);

        emit ProposalExecuted(governanceProposalId, recipient, fundingAmount);
        emit ProposalPhaseChanged(governanceProposalId, ProposalPhase.Completed);
    }

    /**
     * @notice Emergency pause toggle
     */
    function togglePause() external onlyGuardian {
        paused = !paused;
        emit EmergencyPauseToggled(paused);
    }

    /**
     * @notice Add or remove guardian
     * @param guardian Address of guardian
     * @param status True to add, false to remove
     */
    function updateGuardian(address guardian, bool status) external onlyOwner {
        require(guardian != address(0), "Invalid guardian");
        guardians[guardian] = status;
        emit GuardianUpdated(guardian, status);
    }

    /**
     * @notice Get governance proposal details
     * @param governanceProposalId ID of the governance proposal
     */
    function getGovernanceProposal(uint256 governanceProposalId) external view returns (
        uint256 proposalId,
        uint256 marketId,
        ProposalPhase phase,
        uint256 createdAt,
        uint256 executionTime,
        bool executed
    ) {
        GovernanceProposal storage govProposal = governanceProposals[governanceProposalId];
        return (
            govProposal.proposalId,
            govProposal.marketId,
            govProposal.phase,
            govProposal.createdAt,
            govProposal.executionTime,
            govProposal.executed
        );
    }

    /**
     * @notice Fund the contract for treasury operations
     */
    receive() external payable {}

    /**
     * @notice Emergency withdraw (only owner)
     */
    function emergencyWithdraw() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }
}
