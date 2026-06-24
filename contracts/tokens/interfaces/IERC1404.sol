// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC1404 — Simple Restricted Token Standard
/// @notice Transfer-restriction detection with human-readable reasons (spec 028, FR-008/FR-009).
///         A caller can check whether a transfer is permitted — and why it is not — without moving any tokens.
/// @dev    Spec: specs/028-token-mint/contracts/erc1404-restricted.md. Code `0` MUST mean "no restriction".
interface IERC1404 {
    /// @notice Returns a restriction code for a hypothetical transfer of `value` from `from` to `to`.
    /// @return code `0` if the transfer is permitted; otherwise a token-defined non-zero reason code.
    function detectTransferRestriction(address from, address to, uint256 value) external view returns (uint8 code);

    /// @notice Returns the human-readable message for a restriction `code` from {detectTransferRestriction}.
    function messageForTransferRestriction(uint8 code) external view returns (string memory message);
}
