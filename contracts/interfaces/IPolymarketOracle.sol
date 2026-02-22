// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IPolymarketOracle
 * @notice Interface for querying Polymarket CTF (Conditional Token Framework) resolution data
 * @dev This interface allows private markets to be resolved based on Polymarket market outcomes
 *
 * Polymarket uses the Gnosis CTF standard where:
 * - conditionId = keccak256(oracle, questionId, outcomeSlotCount)
 * - Resolution data includes payout numerators for each outcome
 * - Binary markets have outcomeSlotCount = 2
 */
interface IPolymarketOracle {
    /**
     * @notice Get the condition details for a Polymarket market
     * @param conditionId The unique identifier for the condition
     * @return oracle The oracle address that can resolve this condition
     * @return questionId The question identifier
     * @return outcomeSlotCount Number of possible outcomes
     * @return resolved Whether the condition has been resolved
     */
    function getCondition(bytes32 conditionId) external view returns (
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount,
        bool resolved
    );

    /**
     * @notice Check if a condition has been resolved
     * @param conditionId The condition identifier
     * @return True if resolved, false otherwise
     */
    function isResolved(bytes32 conditionId) external view returns (bool);

    /**
     * @notice Get payout numerators for a resolved condition
     * @param conditionId The condition identifier
     * @return Array of payout numerators for each outcome
     */
    function getPayoutNumerators(bytes32 conditionId) external view returns (uint256[] memory);

    /**
     * @notice Get payout denominator for a resolved condition
     * @param conditionId The condition identifier
     * @return The payout denominator
     */
    function getPayoutDenominator(bytes32 conditionId) external view returns (uint256);

    /**
     * @notice Compute condition ID from components
     * @param oracle The oracle address
     * @param questionId The question identifier
     * @param outcomeSlotCount Number of outcomes
     * @return The computed condition ID
     */
    function getConditionId(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) external pure returns (bytes32);
}
