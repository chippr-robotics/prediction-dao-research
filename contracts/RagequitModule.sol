// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RagequitModule
 * @notice Minority exit mechanism allowing dissenting token holders to exit
 * @dev Implements Moloch-style ragequit for treasury protection
 */
contract RagequitModule is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    struct RagequitEligibility {
        uint256 proposalId;
        uint256 snapshotTime;
        uint256 executionTime;
        bool executed;
    }

    // Proposal ID => user => eligible
    mapping(uint256 => mapping(address => bool)) public eligibleToRagequit;
    
    // Proposal ID => eligibility details
    mapping(uint256 => RagequitEligibility) public ragequitWindows;
    
    // User => has ragequit for proposal
    mapping(address => mapping(uint256 => bool)) public hasRagequit;

    address public governanceToken;
    address public treasuryVault;
    address public governor; // FutarchyGovernor address
    
    uint256 public constant RAGEQUIT_WINDOW = 7 days;

    bool private _initialized;

    event RagequitWindowOpened(uint256 indexed proposalId, uint256 snapshotTime, uint256 executionTime);
    event RagequitExecuted(
        address indexed user,
        uint256 indexed proposalId,
        uint256 tokenAmount,
        uint256 treasuryShare
    );
    event GovernorSet(address indexed governor);

    modifier onlyOwnerOrGovernor() {
        if (msg.sender != owner() && msg.sender != governor) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
        _;
    }

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Initialize the contract (used for clones)
     * @param initialOwner Address of the initial owner
     * @param _governanceToken Address of the governance token
     * @param _treasuryVault Address of the treasury vault
     */
    function initialize(
        address initialOwner,
        address _governanceToken,
        address _treasuryVault
    ) external {
        require(!_initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        require(_governanceToken != address(0), "Invalid token");
        require(_treasuryVault != address(0), "Invalid vault");
        _initialized = true;
        governanceToken = _governanceToken;
        treasuryVault = _treasuryVault;
        _transferOwnership(initialOwner);
    }

    /**
     * @notice Set the governor address that can manage ragequit windows
     * @param _governor Address of the FutarchyGovernor contract
     */
    function setGovernor(address _governor) external onlyOwner {
        require(_governor != address(0), "Invalid governor address");
        governor = _governor;
        emit GovernorSet(_governor);
    }

    /**
     * @notice Open ragequit window for a proposal
     * @param proposalId ID of the proposal
     * @param snapshotTime Time of token snapshot
     * @param executionTime Scheduled execution time
     */
    function openRagequitWindow(
        uint256 proposalId,
        uint256 snapshotTime,
        uint256 executionTime
    ) external onlyOwnerOrGovernor {
        require(executionTime > snapshotTime, "Invalid execution time");
        require(ragequitWindows[proposalId].snapshotTime == 0, "Window already opened");

        ragequitWindows[proposalId] = RagequitEligibility({
            proposalId: proposalId,
            snapshotTime: snapshotTime,
            executionTime: executionTime,
            executed: false
        });

        emit RagequitWindowOpened(proposalId, snapshotTime, executionTime);
    }

    /**
     * @notice Mark user as eligible for ragequit
     * @param proposalId ID of the proposal
     * @param user Address of the user
     */
    function setEligible(uint256 proposalId, address user) external onlyOwner {
        eligibleToRagequit[proposalId][user] = true;
    }

    /**
     * @notice Execute ragequit to exit with proportional treasury share
     * @param proposalId ID of the proposal
     * @param tokenAmount Amount of governance tokens to burn
     */
    function ragequit(uint256 proposalId, uint256 tokenAmount) external nonReentrant {
        require(eligibleToRagequit[proposalId][msg.sender], "Not eligible");
        require(!hasRagequit[msg.sender][proposalId], "Already ragequit");
        require(tokenAmount > 0, "Invalid token amount");

        RagequitEligibility storage window = ragequitWindows[proposalId];
        require(window.snapshotTime > 0, "Window not opened");
        require(!window.executed, "Proposal executed");
        require(block.timestamp < window.executionTime, "Window closed");

        // Calculate proportional treasury share
        uint256 treasuryShare = calculateTreasuryShare(tokenAmount);
        require(treasuryShare > 0, "No treasury share");

        hasRagequit[msg.sender][proposalId] = true;

        // Burn governance tokens - using safeTransferFrom for checked transfer
        IERC20(governanceToken).safeTransferFrom(msg.sender, address(this), tokenAmount);

        // Transfer proportional treasury share
        // In production, this would interact with the treasury vault
        // Simplified: transfer ETH
        (bool success, ) = payable(msg.sender).call{value: treasuryShare}("");
        require(success, "Treasury transfer failed");

        emit RagequitExecuted(msg.sender, proposalId, tokenAmount, treasuryShare);
    }

    /**
     * @notice Calculate proportional treasury share for ragequit
     * @param tokenAmount Amount of tokens to burn
     * @return uint256 Proportional treasury share
     */
    function calculateTreasuryShare(
        uint256 tokenAmount
    ) public view returns (uint256) {
        require(tokenAmount > 0, "Invalid token amount");

        // Get total supply of governance token
        uint256 totalSupply = IERC20(governanceToken).totalSupply();
        require(totalSupply > 0, "No total supply");

        // Get treasury balance (simplified - in production, aggregate all treasury assets)
        uint256 treasuryBalance = address(treasuryVault).balance;

        // Calculate proportional share
        return (treasuryBalance * tokenAmount) / totalSupply;
    }

    /**
     * @notice Mark proposal as executed, closing ragequit window
     * @param proposalId ID of the proposal
     */
    function markProposalExecuted(uint256 proposalId) external onlyOwnerOrGovernor {
        require(ragequitWindows[proposalId].snapshotTime > 0, "Window not opened");
        ragequitWindows[proposalId].executed = true;
    }

    /**
     * @notice Check if user is eligible for ragequit
     * @param proposalId ID of the proposal
     * @param user Address of the user
     * @return bool True if eligible
     */
    function isEligible(uint256 proposalId, address user) external view returns (bool) {
        return eligibleToRagequit[proposalId][user] && !hasRagequit[user][proposalId];
    }

    /**
     * @notice Get ragequit window details
     * @param proposalId ID of the proposal
     */
    function getRagequitWindow(uint256 proposalId) external view returns (
        uint256 snapshotTime,
        uint256 executionTime,
        bool executed,
        bool isOpen
    ) {
        RagequitEligibility storage window = ragequitWindows[proposalId];
        return (
            window.snapshotTime,
            window.executionTime,
            window.executed,
            window.snapshotTime > 0 && 
            !window.executed && 
            block.timestamp < window.executionTime
        );
    }

    /**
     * @notice Update treasury vault address
     * @param newVault Address of new vault
     */
    function updateTreasuryVault(address newVault) external onlyOwner {
        require(newVault != address(0), "Invalid vault");
        treasuryVault = newVault;
    }

    /**
     * @notice Emergency withdraw (owner only)
     */
    function emergencyWithdraw() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }

    receive() external payable {}
}
