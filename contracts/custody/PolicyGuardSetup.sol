// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISafeGuard, IERC165Like} from "./ISafeGuard.sol";

/// @title PolicyGuardSetup
/// @notice Stateless helper delegatecalled from `Safe.setup(to, data, ...)` so a new vault is
///         policy-governed from its very first transaction (spec 049, US1). Running in the new
///         proxy's context it (1) writes the guard address into the Safe's guard storage slot,
///         (2) emits Safe's `ChangedGuard` event signature for indexer/log parity with a
///         post-create `setGuard`, and (3) `call`s the guard's configuration calldata — at that
///         point `msg.sender` seen by the guard IS the new Safe, so the guard's
///         `msg.sender == safe` authority model covers creation with no special path.
/// @dev Deliberately stateless (a delegatecall target must not rely on its own storage), holds no
///      funds, has no payable/fallback surface, and contains no selfdestruct. Calling
///      `enablePolicy` directly (not via delegatecall from a Safe) merely writes the caller's own
///      storage slot — harmless to third parties, same posture as Safe-ecosystem module setup
///      helpers. Reverts bubble up and abort the entire vault creation, so a half-configured
///      vault can never deploy. The full initializer (including this call) is hashed into the
///      CREATE2 salt, so the predicted vault address commits to the initial policy.
contract PolicyGuardSetup {
    /// @dev keccak256("guard_manager.guard.address") — the Safe v1.4.1 guard storage slot.
    bytes32 private constant _GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    /// @dev Byte-identical to Safe v1.4.1 GuardManager's event so explorers see the same trail.
    event ChangedGuard(address indexed guard);

    error ZeroGuard();
    error NotAGuard();

    /// @notice Attach `guard` to the calling Safe and apply its initial policy configuration.
    /// @param guard             The SafePolicyGuard singleton for this chain.
    /// @param configureCalldata ABI-encoded `configureRules(...)` call; empty to attach with no
    ///                          initial rules.
    function enablePolicy(address guard, bytes calldata configureCalldata) external {
        if (guard == address(0)) revert ZeroGuard();
        // Mirror the ERC-165 acceptance check Safe.setGuard performs ("GS300"), since writing
        // the slot directly bypasses it.
        if (!IERC165Like(guard).supportsInterface(type(ISafeGuard).interfaceId)) revert NotAGuard();

        assembly ("memory-safe") {
            sstore(_GUARD_STORAGE_SLOT, guard)
        }
        emit ChangedGuard(guard);

        if (configureCalldata.length > 0) {
            (bool ok, bytes memory ret) = guard.call(configureCalldata);
            if (!ok) {
                // Bubble the guard's typed error up through Safe.setup.
                assembly ("memory-safe") {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}
