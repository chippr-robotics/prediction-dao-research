// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./WelfareMetricRegistry.sol";
import "./ProposalRegistry.sol";
import "./ConditionalMarketFactory.sol";
import "./PrivacyCoordinator.sol";
import "./OracleResolver.sol";
import "./RagequitModule.sol";

/**
 * @title FutarchyGovernor
 * @notice Main governance coordinator integrating all futarchy components
 * @dev Coordinates prediction markets, privacy mechanisms, and proposal execution
 */
contract FutarchyGovernor is Ownable, ReentrancyGuard {
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
    uint256 public constant MAX_DAILY_SPENDING = 100000 ether; // 100k ETC
    mapping(uint256 => uint256) public dailySpending; // day => amount

    // Timelock
    uint256 public constant MIN_TIMELOCK = 2 days;

    // Emergency pause
    bool public paused;
    mapping(address => bool) public guardians;

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

    constructor(
        address _welfareRegistry,
        address _proposalRegistry,
        address _marketFactory,
        address _privacyCoordinator,
        address _oracleResolver,
        address _ragequitModule,
        address _treasuryVault
    ) Ownable(msg.sender) {
        require(_welfareRegistry != address(0), "Invalid welfare registry");
        require(_proposalRegistry != address(0), "Invalid proposal registry");
        require(_marketFactory != address(0), "Invalid market factory");
        require(_privacyCoordinator != address(0), "Invalid privacy coordinator");
        require(_oracleResolver != address(0), "Invalid oracle resolver");
        require(_ragequitModule != address(0), "Invalid ragequit module");
        require(_treasuryVault != address(0), "Invalid treasury vault");

        welfareRegistry = WelfareMetricRegistry(_welfareRegistry);
        proposalRegistry = ProposalRegistry(_proposalRegistry);
        marketFactory = ConditionalMarketFactory(_marketFactory);
        privacyCoordinator = PrivacyCoordinator(_privacyCoordinator);
        oracleResolver = OracleResolver(_oracleResolver);
        ragequitModule = RagequitModule(_ragequitModule);
        treasuryVault = _treasuryVault;

        guardians[msg.sender] = true;
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
        // Deploy conditional market
        uint256 marketId = marketFactory.deployMarketPair(
            proposalId,
            address(0), // ETH as collateral
            liquidityAmount,
            liquidityParameter,
            tradingPeriod
        );

        governanceProposalId = governanceProposalCount++;

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

        // End market trading
        marketFactory.endTrading(govProposal.marketId);

        govProposal.phase = ProposalPhase.Resolution;
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
            OracleResolver.ResolutionStage stage,
            uint256 passValue,
            uint256 failValue,
            bool finalized
        ) = oracleResolver.getResolution(govProposal.proposalId);

        require(finalized, "Resolution not finalized");

        // Resolve market
        marketFactory.resolveMarket(govProposal.marketId, passValue, failValue);

        // Decide based on market prediction (simplified: pass if passValue > failValue)
        if (passValue > failValue) {
            govProposal.phase = ProposalPhase.Execution;
            govProposal.executionTime = block.timestamp + MIN_TIMELOCK;

            // Open ragequit window
            ragequitModule.openRagequitWindow(
                govProposal.proposalId,
                block.timestamp,
                govProposal.executionTime
            );
        } else {
            govProposal.phase = ProposalPhase.Rejected;
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
            
        ) = proposalRegistry.getProposal(govProposal.proposalId);

        // Check daily spending limit
        uint256 today = block.timestamp / 1 days;
        require(dailySpending[today] + fundingAmount <= MAX_DAILY_SPENDING, "Daily limit exceeded");

        govProposal.executed = true;
        govProposal.phase = ProposalPhase.Completed;
        dailySpending[today] += fundingAmount;

        // Execute fund transfer
        (bool success, ) = payable(recipient).call{value: fundingAmount}("");
        require(success, "Transfer failed");

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
