// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITokenAdminV2
/// @notice Shared role ids, events, and transfer-restriction codes for the spec-028 role-based v2 token
///         templates (US6–US9). Roles use OpenZeppelin AccessControl; the restriction codes mirror the ERC-1404
///         convention (0 == no restriction) and are returned by `detectTransferRestriction` on the restricted
///         class and used as revert reasons across the v2 family. Spec:
///         specs/028-token-mint/contracts/roles-controls-caps.md.
interface ITokenAdminV2 {
    // --- Restriction codes (uint8; 0 == SUCCESS) ---
    // 0 SUCCESS · 1 SENDER_NOT_ELIGIBLE · 2 RECIPIENT_NOT_ELIGIBLE · 3 SENDER_FROZEN · 4 SANCTIONED · 5 RECIPIENT_FROZEN

    event Frozen(address indexed account, bool frozen);
    event DefaultRestrictionMessageUpdated(string message);

    error TransferRestricted(uint8 code);
    error BatchTooLarge(uint256 provided, uint256 max);
    error LengthMismatch();
    error ZeroAddress();
    error SelfTransfer();
    error WrongInitializer();
}
