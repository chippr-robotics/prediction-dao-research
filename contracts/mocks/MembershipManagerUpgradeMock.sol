// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MembershipManager} from "../access/MembershipManager.sol";

/// @title MembershipManagerUpgradeMock
/// @notice Test-only additive upgrade of {MembershipManager}: appends one state variable (drawn from the
///         reserved `__gap`, so storage stays append-only and compatible) plus a trivial view and setter.
///         Used to prove an in-place, state-preserving UUPS upgrade leaves every pre-existing membership,
///         accrued fee, and config mapping intact while activating new logic. NOT for production.
contract MembershipManagerUpgradeMock is MembershipManager {
    /// @dev Appended AFTER all existing MembershipManager state (consumes a `__gap` slot). Never reorder.
    uint256 public upgradeMarker;

    function setUpgradeMarker(uint256 m) external {
        upgradeMarker = m;
    }

    function upgradeProbe() external pure returns (string memory) {
        return "v2";
    }
}
