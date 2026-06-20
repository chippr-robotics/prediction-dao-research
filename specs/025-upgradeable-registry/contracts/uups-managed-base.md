# Contract: `UUPSManaged` — reusable upgrade base

`contracts/upgradeable/UUPSManaged.sol`. The shared, contract-agnostic upgrade primitives every value-bearing,
role-controlled contract reuses (PR #724 ask). `WagerRegistry` is the first adopter; `MembershipManager`
(sibling spec) is the second. **No contract-specific logic lives here.**

## Surface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/// @title UUPSManaged
/// @notice Reusable base: UUPS upgradeability + AccessControl, with a least-privilege, non-brickable
///         upgrade gate and impl-initialization lockout. Inherited by every upgradeable value-bearing contract.
abstract contract UUPSManaged is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    /// @notice Holders may replace the implementation. Separated from DEFAULT_ADMIN_ROLE (least privilege);
    ///         can later be moved to a timelock/multisig with no code change.
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @dev Locks initialization of a bare implementation (UUPS footgun defense).
    constructor() { _disableInitializers(); }

    /// @dev Adopters call this FIRST in their own initializer.
    function __UUPSManaged_init(address admin) internal onlyInitializing {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    /// @dev The only upgrade gate. Never removed by an upgrade ⇒ upgrades always remain possible (non-brickable).
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /// @dev Reserve base slots so adopters can add base-level state later without shifting child layout.
    uint256[50] private __gap;
}
```

## Guarantees (mapped to spec)

- **FR-009 (authorized only)**: `_authorizeUpgrade` is `onlyRole(UPGRADER_ROLE)`; a non-holder's
  `upgradeToAndCall` reverts.
- **FR-011 (one-time init / no re-init)**: `_disableInitializers()` in the constructor disables the
  implementation; adopters use OZ `initializer`/`onlyInitializing` so `initialize` runs exactly once.
- **FR-012 (non-brickable)**: `_authorizeUpgrade` and `UPGRADER_ROLE` are always present; no upgrade can
  remove the upgrade path.
- **Least privilege (Principle I)**: `UPGRADER_ROLE ≠ DEFAULT_ADMIN_ROLE`; "may replace code" is separable
  from "may change config" and can be reassigned to governance later.

## Adopter contract (how WagerRegistry / MembershipManager use it)

```solidity
contract WagerRegistry is
    IWagerRegistry, UUPSManaged, ReentrancyGuardUpgradeable, PausableUpgradeable { ...
    function initialize(address admin, address membershipManager_, address polymarketAdapter_, address[] memory initialTokens)
        external initializer
    {
        __UUPSManaged_init(admin);          // UUPS + AccessControl + roles
        __ReentrancyGuard_init();
        __Pausable_init();
        // ... existing constructor body (grants, config, token allowlist, _nextWagerId = 1) ...
    }
}
```

`MembershipManager` inherits `UUPSManaged` only (it needs no reentrancy/pause), and its `initialize` calls
`__UUPSManaged_init(admin)` then sets `paymentToken`/`treasury`/tier config.

## Tests (contract)

- `UPGRADER_ROLE` gate: only a holder can upgrade; revoking it blocks upgrades; granting it re-enables.
- `_disableInitializers`: calling `initialize` directly on a freshly-deployed implementation reverts.
- Non-brickable: after an upgrade, `_authorizeUpgrade`/`UPGRADER_ROLE` still exist and a further upgrade works.
- Storage `__gap` present; layout validates.
