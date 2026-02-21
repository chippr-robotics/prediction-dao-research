// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IUMAOptimisticOracle.sol";
import "./IOracleAdapter.sol";

/**
 * @title UMAOracleAdapter
 * @notice Oracle adapter for arbitrary truth assertions using UMA Optimistic Oracle
 * @dev Enables P2P wagers on any verifiable claim with dispute resolution
 *
 * KEY FEATURES:
 * - Create assertions about any verifiable real-world event
 * - Built-in dispute mechanism via UMA DVM
 * - Economic security through bonding
 * - Flexible liveness periods
 *
 * FLOW:
 * 1. Create condition with claim text
 * 2. Assert the outcome (requires bond)
 * 3. Wait for challenge period
 * 4. If disputed, UMA DVM resolves
 * 5. Settle to finalize result
 *
 * EXAMPLE USE CASES:
 * - "The Lakers will win the 2025 NBA Finals"
 * - "SpaceX will launch Starship to orbit in Q2 2025"
 * - "Bitcoin ETF will be approved by SEC in 2024"
 */
contract UMAOracleAdapter is IOracleAdapter, Ownable {
    using SafeERC20 for IERC20;

    // ========== Types ==========

    struct Condition {
        string description;
        uint256 deadline;           // When assertion can be made
        bytes32 assertionId;        // UMA assertion ID (0 if not asserted)
        bool registered;
        bool assertedOutcome;       // What outcome was asserted
    }

    struct Resolution {
        bool resolved;
        bool outcome;
        uint256 resolvedAt;
        uint256 confidence;         // 10000 = 100% (settled), less if disputed
    }

    // ========== Storage ==========

    // UMA Optimistic Oracle V3 address
    IUMAOptimisticOracle public umaOracle;

    // Bond token (usually WETH or USDC)
    IERC20 public bondToken;

    // Condition ID => Condition
    mapping(bytes32 => Condition) public conditions;

    // Condition ID => Resolution
    mapping(bytes32 => Resolution) public resolutions;

    // UMA assertion ID => Condition ID (for callbacks)
    mapping(bytes32 => bytes32) public assertionToCondition;

    // Configuration
    uint256 public defaultBond = 0.1 ether;       // Default bond amount
    uint64 public defaultLiveness = 2 hours;       // Default challenge period
    bytes32 public constant ASSERT_TRUTH_ID = bytes32("ASSERT_TRUTH");

    // ========== Events ==========

    event ConditionCreated(
        bytes32 indexed conditionId,
        string description,
        uint256 deadline
    );
    event AssertionMade(
        bytes32 indexed conditionId,
        bytes32 indexed assertionId,
        address indexed asserter,
        bool outcome
    );
    event AssertionDisputed(
        bytes32 indexed conditionId,
        bytes32 indexed assertionId
    );
    event ConditionSettled(
        bytes32 indexed conditionId,
        bool outcome,
        uint256 resolvedAt
    );
    event ConfigUpdated(uint256 newBond, uint64 newLiveness);

    // ========== Errors ==========

    error ConditionNotFound();
    error ConditionAlreadyExists();
    error ConditionAlreadyAsserted();
    error DeadlineNotReached();
    error DeadlineInPast();
    error AssertionNotSettled();
    error InvalidOracleAddress();
    error InsufficientBond();

    // ========== Constructor ==========

    constructor(
        address _owner,
        address _umaOracle,
        address _bondToken
    ) Ownable(_owner) {
        if (_umaOracle == address(0)) revert InvalidOracleAddress();
        umaOracle = IUMAOptimisticOracle(_umaOracle);
        bondToken = IERC20(_bondToken);
    }

    // ========== Admin Functions ==========

    /**
     * @notice Update default configuration
     * @param newBond New default bond amount
     * @param newLiveness New default liveness period
     */
    function setConfig(uint256 newBond, uint64 newLiveness) external onlyOwner {
        defaultBond = newBond;
        defaultLiveness = newLiveness;
        emit ConfigUpdated(newBond, newLiveness);
    }

    /**
     * @notice Update UMA Oracle address
     * @param newOracle New UMA Optimistic Oracle address
     */
    function setUMAOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert InvalidOracleAddress();
        umaOracle = IUMAOptimisticOracle(newOracle);
    }

    // ========== Condition Management ==========

    /**
     * @notice Create a new condition for a verifiable claim
     * @param description The claim being asserted (e.g., "Lakers win 2025 Finals")
     * @param deadline When the outcome should be known
     * @return conditionId The unique condition identifier
     */
    function createCondition(
        string calldata description,
        uint256 deadline
    ) external returns (bytes32 conditionId) {
        if (deadline <= block.timestamp) revert DeadlineInPast();

        conditionId = keccak256(abi.encodePacked(
            description,
            deadline,
            msg.sender,
            block.timestamp
        ));

        if (conditions[conditionId].registered) revert ConditionAlreadyExists();

        conditions[conditionId] = Condition({
            description: description,
            deadline: deadline,
            assertionId: bytes32(0),
            registered: true,
            assertedOutcome: false
        });

        emit ConditionCreated(conditionId, description, deadline);
        emit ConditionRegistered(conditionId, description, deadline);

        return conditionId;
    }

    /**
     * @notice Assert an outcome for a condition
     * @param conditionId The condition to assert
     * @param outcome True if the claim is true
     * @return assertionId The UMA assertion ID
     */
    function assertOutcome(
        bytes32 conditionId,
        bool outcome
    ) external returns (bytes32 assertionId) {
        Condition storage condition = conditions[conditionId];
        if (!condition.registered) revert ConditionNotFound();
        if (condition.assertionId != bytes32(0)) revert ConditionAlreadyAsserted();
        if (block.timestamp < condition.deadline) revert DeadlineNotReached();

        // Transfer bond from asserter
        bondToken.safeTransferFrom(msg.sender, address(this), defaultBond);
        bondToken.approve(address(umaOracle), defaultBond);

        // Create claim text
        bytes memory claim = abi.encodePacked(
            outcome ? "TRUE: " : "FALSE: ",
            condition.description
        );

        // Submit assertion to UMA
        assertionId = umaOracle.assertTruth(
            claim,
            msg.sender,
            address(this),      // This contract receives callbacks
            address(0),         // No custom security
            address(bondToken),
            defaultBond,
            defaultLiveness,
            ASSERT_TRUTH_ID
        );

        // Store assertion info
        condition.assertionId = assertionId;
        condition.assertedOutcome = outcome;
        assertionToCondition[assertionId] = conditionId;

        emit AssertionMade(conditionId, assertionId, msg.sender, outcome);
    }

    /**
     * @notice Settle a condition after UMA assertion is settled
     * @param conditionId The condition to settle
     */
    function settleCondition(bytes32 conditionId) external {
        Condition storage condition = conditions[conditionId];
        if (!condition.registered) revert ConditionNotFound();
        if (resolutions[conditionId].resolved) return; // Already settled

        bytes32 assertionId = condition.assertionId;
        if (assertionId == bytes32(0)) revert AssertionNotSettled();

        // Check if UMA assertion is settled
        if (!umaOracle.isAssertionSettled(assertionId)) {
            // Try to settle it
            umaOracle.settleAssertion(assertionId);
        }

        // Get result
        bool assertionValid = umaOracle.getAssertionResult(assertionId);

        // If assertion was valid, use asserted outcome; otherwise, use opposite
        bool finalOutcome = assertionValid ? condition.assertedOutcome : !condition.assertedOutcome;

        resolutions[conditionId] = Resolution({
            resolved: true,
            outcome: finalOutcome,
            resolvedAt: block.timestamp,
            confidence: 10000 // Full confidence after UMA settlement
        });

        emit ConditionSettled(conditionId, finalOutcome, block.timestamp);
        emit ConditionResolved(conditionId, finalOutcome, 10000, block.timestamp);
    }

    // ========== UMA Callbacks ==========

    /**
     * @notice Called by UMA when an assertion is disputed
     * @param assertionId The disputed assertion
     */
    function assertionDisputedCallback(bytes32 assertionId) external {
        require(msg.sender == address(umaOracle), "Only UMA");
        bytes32 conditionId = assertionToCondition[assertionId];
        if (conditionId != bytes32(0)) {
            emit AssertionDisputed(conditionId, assertionId);
        }
    }

    /**
     * @notice Called by UMA when an assertion is resolved
     * @param assertionId The resolved assertion
     * @param assertedTruthfully Whether the assertion was truthful
     */
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        require(msg.sender == address(umaOracle), "Only UMA");
        bytes32 conditionId = assertionToCondition[assertionId];
        if (conditionId != bytes32(0) && !resolutions[conditionId].resolved) {
            Condition storage condition = conditions[conditionId];
            bool finalOutcome = assertedTruthfully ? condition.assertedOutcome : !condition.assertedOutcome;

            resolutions[conditionId] = Resolution({
                resolved: true,
                outcome: finalOutcome,
                resolvedAt: block.timestamp,
                confidence: 10000
            });

            emit ConditionSettled(conditionId, finalOutcome, block.timestamp);
            emit ConditionResolved(conditionId, finalOutcome, 10000, block.timestamp);
        }
    }

    // ========== IOracleAdapter Implementation ==========

    /**
     * @notice Returns the oracle type
     */
    function oracleType() external pure override returns (string memory) {
        return "UMA";
    }

    /**
     * @notice Check if a condition is supported
     */
    function isConditionSupported(bytes32 conditionId) external view override returns (bool supported) {
        return conditions[conditionId].registered;
    }

    /**
     * @notice Check if a condition is resolved
     */
    function isConditionResolved(bytes32 conditionId) external view override returns (bool resolved) {
        return resolutions[conditionId].resolved;
    }

    /**
     * @notice Get the outcome of a resolved condition
     */
    function getOutcome(bytes32 conditionId) external view override returns (
        bool outcome,
        uint256 confidence,
        uint256 resolvedAt
    ) {
        Resolution storage res = resolutions[conditionId];
        if (!res.resolved) {
            return (false, 0, 0);
        }
        return (res.outcome, res.confidence, res.resolvedAt);
    }

    /**
     * @notice Get metadata about a condition
     */
    function getConditionMetadata(bytes32 conditionId) external view override returns (
        string memory description,
        uint256 expectedResolutionTime
    ) {
        Condition storage condition = conditions[conditionId];
        return (condition.description, condition.deadline);
    }

    // ========== View Functions ==========

    /**
     * @notice Get condition details
     */
    function getCondition(bytes32 conditionId) external view returns (
        string memory description,
        uint256 deadline,
        bytes32 assertionId,
        bool registered,
        bool assertedOutcome
    ) {
        Condition storage c = conditions[conditionId];
        return (c.description, c.deadline, c.assertionId, c.registered, c.assertedOutcome);
    }

    /**
     * @notice Get resolution details
     */
    function getResolution(bytes32 conditionId) external view returns (
        bool resolved,
        bool outcome,
        uint256 resolvedAt,
        uint256 confidence
    ) {
        Resolution storage r = resolutions[conditionId];
        return (r.resolved, r.outcome, r.resolvedAt, r.confidence);
    }

    /**
     * @notice Check if a condition can be asserted
     */
    function canAssert(bytes32 conditionId) external view returns (bool) {
        Condition storage condition = conditions[conditionId];
        if (!condition.registered) return false;
        if (condition.assertionId != bytes32(0)) return false;
        if (block.timestamp < condition.deadline) return false;
        return true;
    }

    /**
     * @notice Check if a condition can be settled
     */
    function canSettle(bytes32 conditionId) external view returns (bool) {
        Condition storage condition = conditions[conditionId];
        if (!condition.registered) return false;
        if (resolutions[conditionId].resolved) return false;
        if (condition.assertionId == bytes32(0)) return false;
        return umaOracle.isAssertionSettled(condition.assertionId);
    }
}
