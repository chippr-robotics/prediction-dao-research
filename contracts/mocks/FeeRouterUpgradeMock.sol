// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FeeRouter} from "../fees/FeeRouter.sol";

/// @title FeeRouterUpgradeMock
/// @notice Test-only additive upgrade of {FeeRouter}: appends one state variable (drawn from the
///         reserved `__gap`, so storage stays append-only and compatible) plus a trivial view and
///         setter. Used to prove an in-place, state-preserving UUPS upgrade leaves the treasury,
///         service registry, and rates intact while activating new logic. NOT for production.
contract FeeRouterUpgradeMock is FeeRouter {
    /// @dev Appended AFTER all existing FeeRouter state (consumes a `__gap` slot). Never reorder.
    uint256 public upgradeMarker;

    function setUpgradeMarker(uint256 m) external {
        upgradeMarker = m;
    }

    function upgradeProbe() external pure returns (string memory) {
        return "v2";
    }
}
