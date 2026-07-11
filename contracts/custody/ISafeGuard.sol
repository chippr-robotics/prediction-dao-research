// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISafeGuard
/// @notice Local replica of the Safe v1.4.1 transaction guard interface (`Guard` in the canonical
///         safe-contracts GuardManager.sol), kept dependency-free so the custody contract family
///         compiles without external imports (spec 049; SafeProposalHub precedent).
/// @dev `operation` is declared `uint8` where Safe uses `Enum.Operation` — enums are `uint8` in the
///      ABI, so every selector (and therefore `type(ISafeGuard).interfaceId`, which Safe's
///      `setGuard` checks via ERC-165 "GS300") is byte-identical to the canonical interface.
interface ISafeGuard {
    function checkTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes calldata signatures,
        address msgSender
    ) external;

    function checkAfterExecution(bytes32 txHash, bool success) external;
}

/// @notice Minimal ERC-165 surface (dependency-free).
interface IERC165Like {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
