// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MiniAppRegistry} from "../apps/MiniAppRegistry.sol";

/// @title MiniAppRegistryUpgradeMock
/// @notice Test-only additive upgrade of {MiniAppRegistry}: appends one state variable (drawn from
///         the reserved `__gap`, so storage stays append-only and compatible) plus a trivial view
///         and setter. Used to prove an in-place, state-preserving UUPS upgrade leaves the catalog
///         — most importantly each record's `approved` package tuple, the only bytes hosts may
///         serve — intact while activating new logic. NOT for production.
contract MiniAppRegistryUpgradeMock is MiniAppRegistry {
    /// @dev Appended AFTER all existing MiniAppRegistry state (consumes a `__gap` slot). Never reorder.
    uint256 public upgradeMarker;

    function setUpgradeMarker(uint256 m) external {
        upgradeMarker = m;
    }

    function upgradeProbe() external pure returns (string memory) {
        return "v2";
    }
}
