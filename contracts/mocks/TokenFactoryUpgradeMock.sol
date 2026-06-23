// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TokenFactory} from "../tokens/TokenFactory.sol";

/// @title TokenFactoryUpgradeMock
/// @notice Test-only additive upgrade of {TokenFactory}: appends one state variable (after all existing state,
///         storage-compatible/append-only) plus a trivial view and setter. Used to prove an in-place,
///         state-preserving UUPS upgrade leaves the token registry intact while activating new logic. NOT for
///         production.
contract TokenFactoryUpgradeMock is TokenFactory {
    /// @dev Appended AFTER all existing TokenFactory state. Never reorder existing state.
    uint256 public upgradeMarker;

    function setUpgradeMarker(uint256 m) external {
        upgradeMarker = m;
    }

    function upgradeProbe() external pure returns (string memory) {
        return "v2";
    }
}
