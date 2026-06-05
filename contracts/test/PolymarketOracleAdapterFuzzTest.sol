// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../oracles/PolymarketOracleAdapter.sol";
import "./MockPolymarketCTF.sol";

/// @title PolymarketOracleAdapterFuzzTest
/// @notice Medusa fuzz harness for PolymarketOracleAdapter.getOutcome().
/// @dev    Regression coverage for the tie bug: a Polymarket market that
///         resolves with equal payout numerators (passNumerator == failNumerator,
///         e.g. a 50/50 / invalid resolution) must NEVER yield a decidable
///         winner. getOutcome must return the unresolved sentinel (resolvedAt==0)
///         so WagerRegistry refunds both stakes instead of paying a fixed side.
///         Decisive markets must resolve and pick the strictly-greater side.
contract PolymarketOracleAdapterFuzzTest {
    MockPolymarketCTF public ctf;
    PolymarketOracleAdapter public adapter;
    uint256 private _n;

    constructor() {
        ctf = new MockPolymarketCTF();
        adapter = new PolymarketOracleAdapter(address(this), address(ctf));
    }

    /// @dev Fuzzed over (a, b). Prepares + resolves a fresh binary condition with
    ///      payouts [a, b] and asserts the tie/decisive invariant on getOutcome.
    function property_tie_never_picks_a_winner(uint128 a, uint128 b) public returns (bool) {
        // The CTF requires a positive denominator; both-zero is not a resolvable
        // market, so there is nothing to assert.
        if (a == 0 && b == 0) return true;

        _n++;
        bytes32 questionId = keccak256(abi.encodePacked("fuzz", _n));
        bytes32 conditionId = ctf.getConditionId(address(this), questionId, 2);
        ctf.prepareCondition(address(this), questionId, 2);

        uint256[] memory payouts = new uint256[](2);
        payouts[0] = a;
        payouts[1] = b;
        ctf.resolveCondition(conditionId, payouts);

        (bool outcome, , uint256 resolvedAt) = adapter.getOutcome(conditionId);

        if (a == b) {
            // Tie MUST be reported as unresolved (refund path).
            return resolvedAt == 0;
        }
        // Decisive market MUST resolve and pick the strictly-greater side.
        return resolvedAt != 0 && outcome == (a > b);
    }
}
