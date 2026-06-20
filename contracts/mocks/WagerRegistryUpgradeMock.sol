// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WagerRegistry} from "../wagers/WagerRegistry.sol";

/// @title WagerRegistryUpgradeMock
/// @notice Test-only additive upgrade of {WagerRegistry}: appends one state variable (drawn from the
///         reserved `__gap`, so storage stays append-only and compatible) plus a trivial view and setter.
///         Used to prove an in-place, state-preserving UUPS upgrade leaves every pre-existing wager,
///         balance, and mapping intact while activating new logic. NOT for production.
contract WagerRegistryUpgradeMock is WagerRegistry {
    /// @dev Appended AFTER all existing WagerRegistry state (consumes a `__gap` slot). Never reorder.
    uint256 public upgradeMarker;

    function setUpgradeMarker(uint256 m) external {
        upgradeMarker = m;
    }

    function upgradeProbe() external pure returns (string memory) {
        return "v2";
    }
}
