// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IOracleAdapter
 * @notice Standard interface for oracle adapters in the FairWins P2P wager system
 * @dev All oracle adapters (Polymarket, Chainlink, UMA, etc.) must implement this interface
 */
interface IOracleAdapter {
    /**
     * @notice Returns the type of oracle (e.g., "Polymarket", "Chainlink", "UMA")
     * @return The oracle type as a string
     */
    function oracleType() external view returns (string memory);

    /**
     * @notice Check if a condition ID is supported by this adapter
     * @param conditionId The unique identifier for the condition
     * @return supported True if this adapter can handle the condition
     */
    function isConditionSupported(bytes32 conditionId) external view returns (bool supported);

    /**
     * @notice Check if a condition has been resolved
     * @param conditionId The unique identifier for the condition
     * @return resolved True if the condition has been resolved
     */
    function isConditionResolved(bytes32 conditionId) external view returns (bool resolved);

    /**
     * @notice Get the outcome of a resolved condition
     * @param conditionId The unique identifier for the condition
     * @return outcome True if the "YES" or "PASS" side won
     * @return confidence Confidence level (0-10000 basis points, 10000 = 100%)
     * @return resolvedAt Timestamp when the condition was resolved
     */
    function getOutcome(bytes32 conditionId) external view returns (
        bool outcome,
        uint256 confidence,
        uint256 resolvedAt
    );

    /**
     * @notice Get metadata about a condition
     * @param conditionId The unique identifier for the condition
     * @return description Human-readable description of the condition
     * @return expectedResolutionTime Expected timestamp for resolution
     */
    function getConditionMetadata(bytes32 conditionId) external view returns (
        string memory description,
        uint256 expectedResolutionTime
    );

    /**
     * @notice Emitted when a condition is registered with this adapter
     */
    event ConditionRegistered(
        bytes32 indexed conditionId,
        string description,
        uint256 expectedResolutionTime
    );

    /**
     * @notice Emitted when a condition is resolved
     */
    event ConditionResolved(
        bytes32 indexed conditionId,
        bool outcome,
        uint256 confidence,
        uint256 resolvedAt
    );
}
