// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {UserOperation} from "../account/lib/account-abstraction/interfaces/UserOperation.sol";

/**
 * @title MockAccount
 * @notice Test-only minimal ERC-4337 v0.6 account: `validateUserOp` always succeeds. Used by the
 *         paymaster fork test to exercise FairWinsVerifyingPaymaster against the REAL EntryPoint
 *         without needing a P-256/WebAuthn signature. NOT for deployment.
 */
contract MockAccount {
    event Executed();

    /// v0.6 IAccount.validateUserOp — return 0 (valid). Repay any missing prefund (0 when a
    /// paymaster sponsors) so the EntryPoint is satisfied either way.
    function validateUserOp(UserOperation calldata, bytes32, uint256 missingAccountFunds)
        external
        returns (uint256 validationData)
    {
        if (missingAccountFunds > 0) {
            (bool ok,) = msg.sender.call{value: missingAccountFunds}("");
            ok; // best-effort; the EntryPoint reverts on shortfall
        }
        return 0;
    }

    /// Target of userOp.callData — a no-op so the fork test measures paymaster gas, not app logic.
    function noop() external {
        emit Executed();
    }

    receive() external payable {}
}
