// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMembershipManager} from "./IMembershipManager.sol";

/// @title IMembershipVoucher
/// @notice The subset of the MembershipVoucher surface that MembershipManager calls during redemption
///         (spec 026). The voucher is a transferable ERC-721 bearer claim on a `(role, tier)` membership.
interface IMembershipVoucher {
    /// @notice Immutable per-token snapshot, written at mint, read at redemption.
    struct VoucherInfo {
        bytes32 role;
        IMembershipManager.Tier tier;
        uint32 durationDays;
    }

    function voucherInfo(uint256 tokenId) external view returns (VoucherInfo memory);

    /// @notice Burn a voucher. Callable by the configured MembershipManager (redemption) or the token owner.
    function burn(uint256 tokenId) external;

    function ownerOf(uint256 tokenId) external view returns (address);
}
