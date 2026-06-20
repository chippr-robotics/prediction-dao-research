// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";

/// @title UUPSManagedHarnessBadLayout
/// @notice Test-only: a deliberately storage-INCOMPATIBLE "upgrade" of {UUPSManagedHarness}. V1 declares
///         `value` first (slot 0 of the child region); this declares `inserted` first, shoving `value` to a
///         later slot. The OZ storage-layout validator MUST reject upgrading a V1 proxy to this — proving the
///         append-only safety gate (spec 025 FR-010/SC-005) blocks state corruption before it can apply.
contract UUPSManagedHarnessBadLayout is UUPSManaged {
    uint256 public inserted; // INSERTED before the existing var — reorders the layout (unsafe)
    uint256 public value;

    function initialize(address admin, uint256 value_) external initializer {
        __UUPSManaged_init(admin);
        value = value_;
    }
}
