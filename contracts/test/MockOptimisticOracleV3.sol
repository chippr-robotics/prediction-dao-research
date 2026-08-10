// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IOptimisticOracleV3.sol";

/// @notice Minimal OOv3 mock — implements the subset of the interface our adapter calls,
///         plus test setters to fire the resolved/disputed callbacks.
contract MockOptimisticOracleV3 is IOptimisticOracleV3 {
    using SafeERC20 for IERC20;

    bytes32 public constant DEFAULT_IDENTIFIER = bytes32("ASSERT_TRUTH");

    uint256 private _nonce;

    struct StoredAssertion {
        address asserter;
        address callbackRecipient;
        IERC20 currency;
        uint256 bond;
        bool exists;
        bool settled;
    }

    mapping(bytes32 => StoredAssertion) public storedAssertions;

    function assertTruth(
        bytes memory /* claim */,
        address asserter,
        address callbackRecipient,
        address /* escalationManager */,
        uint64 /* liveness */,
        IERC20 currency,
        uint256 bond,
        bytes32 /* identifier */,
        bytes32 /* domainId */
    ) external returns (bytes32 assertionId) {
        _nonce += 1;
        assertionId = keccak256(abi.encode(msg.sender, _nonce, block.timestamp));
        currency.safeTransferFrom(msg.sender, address(this), bond);
        storedAssertions[assertionId] = StoredAssertion(asserter, callbackRecipient, currency, bond, true, false);
    }

    // ---- test helpers ----

    /// @notice Refunds bond to the asserter and fires the resolved callback.
    function mockResolve(bytes32 assertionId, bool assertedTruthfully) external {
        StoredAssertion storage a = storedAssertions[assertionId];
        require(a.exists && !a.settled, "bad assertion");
        a.settled = true;
        a.currency.safeTransfer(a.asserter, a.bond);
        if (a.callbackRecipient != address(0)) {
            IOptimisticOracleV3CallbackRecipient(a.callbackRecipient)
                .assertionResolvedCallback(assertionId, assertedTruthfully);
        }
    }

    /// @notice Fires the disputed callback without settling.
    function mockDispute(bytes32 assertionId) external {
        StoredAssertion storage a = storedAssertions[assertionId];
        require(a.exists && !a.settled, "bad assertion");
        if (a.callbackRecipient != address(0)) {
            IOptimisticOracleV3CallbackRecipient(a.callbackRecipient)
                .assertionDisputedCallback(assertionId);
        }
    }

    // ---- IOptimisticOracleV3 conformance ----
    //
    // The stub list used to be much longer: the mock inherited UMA's FULL OOv3 interface, so it had
    // to implement eight functions the adapter never calls (getMinimumBond, disputeAssertion,
    // syncUmaParams, settleAssertion, settleAndGetAssertionResult, getAssertionResult,
    // assertTruthWithDefaults, getAssertion) purely to satisfy the compiler. Against the
    // call-surface-only IOptimisticOracleV3 they are dead weight, and a stub that returns a
    // hardcoded `true` for a result the adapter does not read is a trap for whoever wires up the
    // next call site. Deleted rather than carried.

    function defaultIdentifier() external pure returns (bytes32) { return DEFAULT_IDENTIFIER; }
}
