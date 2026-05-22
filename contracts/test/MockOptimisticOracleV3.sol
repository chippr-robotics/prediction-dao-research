// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3CallbackRecipientInterface.sol";

/// @notice Minimal OOv3 mock — implements the subset of the interface our adapter calls,
///         plus test setters to fire the resolved/disputed callbacks.
contract MockOptimisticOracleV3 is OptimisticOracleV3Interface {
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
            OptimisticOracleV3CallbackRecipientInterface(a.callbackRecipient)
                .assertionResolvedCallback(assertionId, assertedTruthfully);
        }
    }

    /// @notice Fires the disputed callback without settling.
    function mockDispute(bytes32 assertionId) external {
        StoredAssertion storage a = storedAssertions[assertionId];
        require(a.exists && !a.settled, "bad assertion");
        if (a.callbackRecipient != address(0)) {
            OptimisticOracleV3CallbackRecipientInterface(a.callbackRecipient)
                .assertionDisputedCallback(assertionId);
        }
    }

    // ---- OOv3 interface stubs (unused by our adapter but required for interface conformance) ----

    function defaultIdentifier() external pure returns (bytes32) { return DEFAULT_IDENTIFIER; }
    function getMinimumBond(address) external pure returns (uint256) { return 0; }
    function disputeAssertion(bytes32, address) external {}
    function syncUmaParams(bytes32, address) external {}
    function settleAssertion(bytes32) external {}
    function settleAndGetAssertionResult(bytes32) external returns (bool) { return true; }
    function getAssertionResult(bytes32) external pure returns (bool) { return true; }
    function assertTruthWithDefaults(bytes memory, address) external pure returns (bytes32) { return bytes32(0); }

    function getAssertion(bytes32 assertionId) external view returns (Assertion memory a) {
        StoredAssertion storage s = storedAssertions[assertionId];
        a.asserter = s.asserter;
        a.callbackRecipient = s.callbackRecipient;
        a.currency = s.currency;
        a.bond = s.bond;
        a.settled = s.settled;
    }
}
