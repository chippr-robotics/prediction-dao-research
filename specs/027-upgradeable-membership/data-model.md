# Phase 1 Data Model: Upgradeable MembershipManager

This feature changes **where** logic and state live, not **what** the data is. The `Membership`/`TierConfig`
structs and all existing mappings are unchanged (FR-002/FR-006). The model below captures the proxy/
implementation split, the storage-layout baseline that upgrades must preserve, and the upgrade state machine.
It mirrors 025's WagerRegistry data model.

## Entities

| Entity | What it is | Lifecycle |
|--------|-----------|-----------|
| **Proxy (ERC1967)** | The stable on-chain address. Holds **all** `MembershipManager` state and **all** accrued USDC fees; delegatecalls the implementation for logic. | Deployed once per network; address never changes. |
| **Implementation** | The logic contract (`MembershipManager`). Holds **no** funds or state of its own; its initializers are disabled (via `UUPSManaged`). | Many versions over time; exactly one is active (pointed to by the proxy). |
| **UpgradeAuthorization** | The `UPGRADER_ROLE`-gated `_authorizeUpgrade` path (from `UUPSManaged`). The only way to change which implementation the proxy uses. | Granted to the floppy admin at `initialize`; survives every upgrade (non-brickable). |
| **Storage Layout** | The ordered persistent state of the implementation. OZ v5 bases are ERC-7201 namespaced; the authority's own state is sequential + append-only with a trailing `__gap`. | Established at first proxy deploy; append-only thereafter, enforced by the CI check. |
| **Legacy Authority** | The prior non-upgradeable `MembershipManager` deployment (Polygon `0x00c3…`, Amoy `0x101C…`). | After cutover: read/use-only for existing memberships until they expire; no new memberships. |

## Conversion: constructor → initializer (behavior-identical)

The existing `constructor(admin, paymentToken_, treasury_)` body moves verbatim into a one-time
`initialize(...)` with the same arguments and effects:

- `__UUPSManaged_init(admin)` first (UUPS + AccessControl init; grants `DEFAULT_ADMIN_ROLE` + `UPGRADER_ROLE`
  to `admin`).
- Keep the same zero-address checks for `admin`/`paymentToken_`/`treasury_`.
- Set `paymentToken`, `treasury`; `_grantRole(ROLE_MANAGER_ROLE, admin)` (the base already granted
  `DEFAULT_ADMIN_ROLE`).
- **No inline state initializer to move** (unlike WagerRegistry's `_nextWagerId = 1`): `MembershipManager`'s
  only declaration-site initializers are `constant`s (no storage). `accruedFees`/mappings correctly start zero.
- The implementation's `constructor()` (inherited from `UUPSManaged`) calls `_disableInitializers()` so the bare
  implementation can never be initialized (FR-015, SC-008).

## Storage-layout baseline (append-only across upgrades)

The authority's own state, in declaration order — this ordering is the contract that future upgrades MUST
preserve (append only; never reorder/remove/retype). OZ v5 `*Upgradeable` bases (`AccessControl`, `UUPS`) do
**not** appear here — they live in ERC-7201 namespaced slots and cannot collide. `constant`s
(`ROLLING_WINDOW`, `ROLE_MANAGER_ROLE`) occupy no storage and are omitted.

| # | Variable | Type | Notes |
|---|----------|------|-------|
| 1 | `_tiers` | `mapping(bytes32 => mapping(Tier => TierConfig))` | per-role, per-tier config |
| 2 | `_memberships` | `mapping(address => mapping(bytes32 => Membership))` | the core membership state |
| 3 | `authorizedCallers` | `mapping(address => bool)` | hook callers (e.g. WagerRegistry) |
| 4 | `paymentToken` | `IERC20` (address) | config (mutable) |
| 5 | `treasury` | `address` | config (mutable) |
| 6 | `accruedFees` | `uint128` | accrued USDC fees |
| 7 | `sanctionsGuard` | `ISanctionsGuard` (address) | config (mutable) |
| 8 | `memberTermsHash` | `mapping(address => mapping(bytes32 => bytes32))` | accepted T&C hashes |
| — | `__gap` | `uint256[N]` | **trailing reserve** for future appends |

**Invariants**
- Existing entries 1–8 are never reordered, removed, or retyped; new state is appended (consuming `__gap`).
- **Feature 026** appends `voucher` (address) after #8 (drawing from `__gap`) — the first in-place upgrade and
  the proof of the pattern for membership.
- OZ `validateUpgrade` (`npm run check:storage-layout`) fails CI on any violation **before** an upgrade applies.

## Upgrade state machine

```text
            deploy proxy (current logic)
   absent ───────────────────────────────▶ v1 active @ proxy ──upgrade (UPGRADER_ROLE, storage-compatible)──▶ v2 active @ proxy ──▶ …
                                                  │                                                   ▲
                          non-admin upgrade ──────┤  reverts (logic unchanged)                        │
                  storage-incompatible impl ──────┤  blocked by check BEFORE apply                    │
                       re-init attempt ───────────┘  reverts (initializer used)        feature 026 = first such upgrade
```

## Cutover (coexistence) data flow

- New `MembershipManager` **proxy** deployed; `deployments/<net>.json` records `membershipManager` (proxy) +
  `membershipManagerImpl`.
- `WagerRegistry.setMembershipManager(proxy)` repoints membership gating to the proxy (floppy keystore).
- Legacy authority: existing `_memberships` remain readable/usable there until expiry; accrued fees withdrawn
  via its normal admin path. **No** mapping migration; **no** double-counting (new fees accrue on the proxy).
- Frontend/subgraph point at the proxy as the stable membership address; legacy shown distinctly until drain.
