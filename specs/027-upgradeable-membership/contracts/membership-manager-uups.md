# Contract: MembershipManager — UUPS conversion (behavior-neutral)

A behavior-neutral conversion of `MembershipManager` onto the upgradeable UUPS pattern. **Reuses** the 025
artifacts — see `specs/025-upgradeable-registry/contracts/uups-managed-base.md` (the `UUPSManaged` base) and
`specs/025-upgradeable-registry/contracts/deploy-upgrade-tooling.md` (proxy/upgrade deploy + storage check).
This doc only captures the `MembershipManager`-specific delta.

## Inheritance / bases

```text
// before
contract MembershipManager is IMembershipManager, AccessControl { ... }

// after
import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
contract MembershipManager is IMembershipManager, UUPSManaged { ... }
```

`UUPSManaged` supplies `Initializable` + `UUPSUpgradeable` + `AccessControlUpgradeable`, `UPGRADER_ROLE`,
`_authorizeUpgrade(onlyRole(UPGRADER_ROLE))`, and `_disableInitializers()` in its constructor. No
`ReentrancyGuard`/`Pausable` is added (the contract uses neither today — preserving behavior neutrality).

## constructor → initialize

| Before (constructor) | After (initializer) |
|---|---|
| `constructor(address admin, address paymentToken_, address treasury_)` | `function initialize(address admin, address paymentToken_, address treasury_) external initializer` |
| zero-address checks | unchanged, first |
| `paymentToken = …; treasury = …` | unchanged |
| `_grantRole(DEFAULT_ADMIN_ROLE, admin); _grantRole(ROLE_MANAGER_ROLE, admin);` | `__UUPSManaged_init(admin)` grants `DEFAULT_ADMIN_ROLE` + `UPGRADER_ROLE`; then `_grantRole(ROLE_MANAGER_ROLE, admin)` |

Call order in `initialize`: **`__UUPSManaged_init(admin)` first**, then config assignments, then the
`ROLE_MANAGER_ROLE` grant. No inline state initializer exists to relocate (only `constant`s).

## Storage

Append a trailing `uint256[50] private __gap;` after the last existing state variable (`memberTermsHash`).
Existing slot order is frozen (see data-model.md). Feature 026 later appends `voucher` from this gap.

## Unchanged (must not change — FR-006)

All external functions, their signatures, modifiers, events, errors, and the `Tier`/`TierConfig`/`Membership`
structs and the `IMembershipManager` surface (`hasActiveRole`/`getActiveTier`/`getMembership`/`getTierConfig`/
`checkCanCreate`/`recordCreate`/`recordClose`/`grantMembership`/`revokeMembership`/`purchaseTier*`/
`upgradeTier*`/`extendMembership`/admin setters/`withdrawFees`). Fee math, sanctions screening (`_screen`), and
Terms recording (`_recordTerms`) are byte-for-byte identical.

## Tooling registration (reused)

- `scripts/deploy/check-storage-layout.js`: add
  `{ name: "MembershipManager", deploymentsKey: "membershipManager" }` to `UPGRADEABLE_CONTRACTS`.
- `scripts/deploy/deploy.js`: deploy `MembershipManager` as proxy+impl via `lib/upgradeable.js` (records
  `membershipManager` + `membershipManagerImpl`); after deploy, call
  `WagerRegistry.setMembershipManager(membershipProxy)` (floppy keystore) to repoint membership gating.
- `scripts/deploy/verify.js`: verify the membership implementation (and proxy) on the explorers.

## Security notes (Constitution I)

- `_disableInitializers()` (from `UUPSManaged`) protects the bare implementation (FR-015).
- `initialize` is `initializer`-guarded — callable exactly once; re-init reverts (FR-013/SC-008).
- `_authorizeUpgrade` is `UPGRADER_ROLE`-gated and never removed by an upgrade (non-brickable — FR-014); least
  privilege, separable to a timelock/multisig later (FR-011).
- Append-only storage + `__gap`; `check:storage-layout` blocks incompatible upgrades before apply (FR-012/SC-005).
- Behavior-neutral: no new fund flow; existing CEI/fee math unchanged (FR-003). Slither/Medusa clean;
  security-agent review; EthTrust-SL ≥ L2.
