// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSManagedHarness} from "./UUPSManagedHarness.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title UUPSManagedHarnessV2
/// @notice Test-only additive upgrade of {UUPSManagedHarness}: appends new state (storage-compatible) and a
///         new function, and overrides version(). Proves an in-place, state-preserving, append-only upgrade.
contract UUPSManagedHarnessV2 is UUPSManagedHarness {
    uint256 public extra; // appended AFTER all V1 state (append-only)

    /// @dev Optional one-time initializer for the newly-added state when an upgrade wants to seed it.
    ///      `reinitializer(2)` runs at most once, after the V1 `initializer`. State that defaults to 0
    ///      (like `extra`) needs no seeding — this exists to demonstrate the correct add-state-on-upgrade
    ///      pattern adopters should follow.
    function initializeV2(uint256 e) external reinitializer(2) {
        extra = e;
    }

    function setExtra(uint256 e) external {
        extra = e;
    }

    function version() external pure override returns (string memory) {
        return "v2";
    }
}
