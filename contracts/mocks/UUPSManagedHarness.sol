// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";

/// @title UUPSManagedHarness
/// @notice Test-only minimal adopter of {UUPSManaged} used to exercise the reusable upgrade base in
///         isolation (role-gated upgrades, disabled implementation initializers, non-brickability,
///         append-only storage). NOT for production.
contract UUPSManagedHarness is UUPSManaged {
    uint256 public value;

    function initialize(address admin, uint256 value_) external initializer {
        __UUPSManaged_init(admin);
        value = value_;
    }

    function setValue(uint256 v) external {
        value = v;
    }

    function version() external pure virtual returns (string memory) {
        return "v1";
    }
}
