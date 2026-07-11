// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISafeGuard} from "../custody/ISafeGuard.sol";

/// @title MockSafe
/// @notice Test-only harness mimicking the Safe v1.4.1 guard calling convention (spec 049):
///         guard storage slot, `checkTransaction` → inner call → `checkAfterExecution` flow, and
///         a `setupDelegate` entry that reproduces `Safe.setup`'s delegatecall so
///         `PolicyGuardSetup` can be exercised under a real delegatecall context.
/// @dev NOT a Safe: no owners, no signatures, no threshold — unit tests drive the guard's rule
///      logic through it directly. Integration tests use the real Safe v1.4.1 (devDependency).
contract MockSafe {
    /// @dev keccak256("guard_manager.guard.address") — same slot as Safe v1.4.1.
    bytes32 private constant _GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    error DelegateSetupFailed();

    receive() external payable {}

    function setGuard(address guard) external {
        assembly ("memory-safe") {
            sstore(_GUARD_STORAGE_SLOT, guard)
        }
    }

    function getGuard() public view returns (address guard) {
        assembly ("memory-safe") {
            guard := sload(_GUARD_STORAGE_SLOT)
        }
    }

    /// @notice Reproduce `Safe.setup`'s optional delegatecall (used to test PolicyGuardSetup).
    function setupDelegate(address to, bytes calldata data) external {
        (bool ok, bytes memory ret) = to.delegatecall(data);
        if (!ok) {
            if (ret.length > 0) {
                assembly ("memory-safe") {
                    revert(add(ret, 32), mload(ret))
                }
            }
            revert DelegateSetupFailed();
        }
    }

    /// @notice Safe-shaped execution: consult the guard (if set), run the inner call, then the
    ///         post-hook — mirroring execTransaction's ordering. Reverts bubble from the guard.
    function execTransactionMock(address to, uint256 value, bytes calldata data, uint8 operation, uint256 gasPrice)
        external
        returns (bool success)
    {
        address guard = getGuard();
        if (guard != address(0)) {
            ISafeGuard(guard).checkTransaction(
                to, value, data, operation, 0, 0, gasPrice, address(0), payable(address(0)), "", msg.sender
            );
        }
        // Mock executes CALL only; the guard rejects delegatecall for policy vaults before this.
        (success,) = to.call{value: value}(data);
        if (guard != address(0)) {
            ISafeGuard(guard).checkAfterExecution(bytes32(0), success);
        }
    }
}
