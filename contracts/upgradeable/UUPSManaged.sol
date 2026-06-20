// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/// @title UUPSManaged
/// @notice Reusable upgrade base for value-bearing, role-controlled contracts: UUPS upgradeability +
///         AccessControl, with a least-privilege, non-brickable upgrade gate and implementation-
///         initialization lockout. Inherited by every upgradeable contract in the system (WagerRegistry is
///         the first adopter; MembershipManager is the second). Contains NO contract-specific logic.
/// @dev    Adopters:
///           1. inherit this base (plus any others they need, e.g. ReentrancyGuardUpgradeable),
///           2. call `__UUPSManaged_init(admin)` FIRST in their own `initializer`,
///           3. keep their own state append-only with a trailing `__gap`.
abstract contract UUPSManaged is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    /// @notice Holders may replace the implementation. Separated from DEFAULT_ADMIN_ROLE (least privilege);
    ///         can later be reassigned to a timelock/multisig with no code change.
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @dev Locks initialization of a bare implementation contract so it can never be initialized and
    ///      hijacked (the classic UUPS footgun). Only proxies, which delegatecall into this logic, can be
    ///      initialized — and only once.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the shared upgrade/access machinery. Adopters MUST call this first in their own
    ///         `initializer` before any other base init.
    /// @param admin Address granted DEFAULT_ADMIN_ROLE and UPGRADER_ROLE.
    function __UUPSManaged_init(address admin) internal onlyInitializing {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    /// @dev The only upgrade-authorization gate. It is never removed by an upgrade, so the ability to perform
    ///      future upgrades is always preserved (non-brickable). Restricted to UPGRADER_ROLE (least privilege).
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /// @dev Reserve base-level storage slots so adopters can add base state later without shifting child
    ///      layout. (The OZ *Upgradeable bases above use ERC-7201 namespaced storage and contribute none.)
    uint256[50] private __gap;
}
