// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../interfaces/IPolymarketOracle.sol";

/**
 * @title MockPolymarketCTF
 * @notice Mock implementation of Polymarket's CTF contract for testing
 * @dev Simulates the Gnosis CTF standard used by Polymarket
 */
contract MockPolymarketCTF is IPolymarketOracle {

    struct Condition {
        address oracle;
        bytes32 questionId;
        uint256 outcomeSlotCount;
        uint256[] payoutNumerators;
        uint256 payoutDenominator;
        bool resolved;
    }

    mapping(bytes32 => Condition) private conditions;

    event ConditionPreparation(
        bytes32 indexed conditionId,
        address indexed oracle,
        bytes32 indexed questionId,
        uint256 outcomeSlotCount
    );

    event ConditionResolution(
        bytes32 indexed conditionId,
        address indexed oracle,
        bytes32 indexed questionId,
        uint256 outcomeSlotCount,
        uint256[] payoutNumerators
    );

    /**
     * @notice Prepare a condition (simulates Polymarket market creation)
     * @param oracle Oracle address (usually Polymarket's UMA adapter)
     * @param questionId Unique question identifier
     * @param outcomeSlotCount Number of outcomes (2 for binary)
     */
    function prepareCondition(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) external returns (bytes32 conditionId) {
        require(outcomeSlotCount >= 2, "At least 2 outcomes required");
        require(outcomeSlotCount <= 256, "Too many outcomes");

        conditionId = getConditionId(oracle, questionId, outcomeSlotCount);
        require(conditions[conditionId].oracle == address(0), "Condition already prepared");

        conditions[conditionId] = Condition({
            oracle: oracle,
            questionId: questionId,
            outcomeSlotCount: outcomeSlotCount,
            payoutNumerators: new uint256[](outcomeSlotCount),
            payoutDenominator: 0,
            resolved: false
        });

        emit ConditionPreparation(conditionId, oracle, questionId, outcomeSlotCount);
    }

    /**
     * @notice Resolve a condition (for testing purposes)
     * @param conditionId The condition to resolve
     * @param payouts Array of payout numerators
     */
    function resolveCondition(
        bytes32 conditionId,
        uint256[] calldata payouts
    ) external {
        Condition storage condition = conditions[conditionId];
        require(condition.oracle != address(0), "Condition not prepared");
        require(!condition.resolved, "Already resolved");
        require(payouts.length == condition.outcomeSlotCount, "Invalid payout array");

        uint256 den = 0;
        for (uint256 i = 0; i < payouts.length; i++) {
            den += payouts[i];
        }
        require(den > 0, "Payout denominator must be positive");

        condition.payoutNumerators = payouts;
        condition.payoutDenominator = den;
        condition.resolved = true;

        emit ConditionResolution(
            conditionId,
            condition.oracle,
            condition.questionId,
            condition.outcomeSlotCount,
            payouts
        );
    }

    // ========== IPolymarketOracle Implementation ==========

    function getCondition(bytes32 conditionId) external view override returns (
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount,
        bool resolved
    ) {
        Condition storage condition = conditions[conditionId];
        return (
            condition.oracle,
            condition.questionId,
            condition.outcomeSlotCount,
            condition.resolved
        );
    }

    function isResolved(bytes32 conditionId) external view override returns (bool) {
        return conditions[conditionId].resolved;
    }

    function getPayoutNumerators(bytes32 conditionId) external view override returns (uint256[] memory) {
        require(conditions[conditionId].resolved, "Condition not resolved");
        return conditions[conditionId].payoutNumerators;
    }

    function getPayoutDenominator(bytes32 conditionId) external view override returns (uint256) {
        require(conditions[conditionId].resolved, "Condition not resolved");
        return conditions[conditionId].payoutDenominator;
    }

    function getConditionId(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) public pure override returns (bytes32) {
        return keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
    }
}
