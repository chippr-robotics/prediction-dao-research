# Phase 1 Data Model: Upgradeable WagerRegistry

This feature changes **where** logic and state live, not **what** the data is. The `Wager` struct and all
existing mappings are unchanged (FR-002/FR-006). The model below captures the proxy/implementation split, the
storage-layout baseline that upgrades must preserve, and the upgrade state machine.

## Entities

| Entity | What it is | Lifecycle |
|--------|-----------|-----------|
| **Proxy (ERC1967)** | The stable on-chain address. Holds **all** `WagerRegistry` state and **all** escrowed funds; delegatecalls the implementation for logic. | Deployed once per network; address never changes. |
| **Implementation** | The logic contract (`WagerRegistry`). Holds **no** funds or state of its own; its own initializers are disabled. | Many versions over time; exactly one is active (pointed to by the proxy). |
| **UpgradeAuthorization** | The `UPGRADER_ROLE`-gated `_authorizeUpgrade` path. The only way to change which implementation the proxy uses. | Granted to the floppy admin at `initialize`; survives every upgrade (non-brickable). |
| **Storage Layout** | The ordered persistent state of the implementation. OZ v5 bases are ERC-7201 namespaced; the registry's own state is sequential + append-only with a trailing `__gap`. | Established at first proxy deploy; append-only thereafter, enforced by the CI check. |
| **Legacy Registry** | The prior non-upgradeable `WagerRegistry` deployment. | After cutover: settle-only (claim/resolve/refund existing wagers), no new wagers. |

## Conversion: constructor → initializer (behavior-identical)

The existing `constructor(admin, membershipManager_, polymarketAdapter_, initialTokens)` body moves verbatim
into a one-time `initialize(...)` with the same arguments and effects:

- `__UUPSManaged_init(admin)` first (UUPS + AccessControl init; grants `DEFAULT_ADMIN_ROLE` + `UPGRADER_ROLE`
  to `admin`), then `__ReentrancyGuard_init()`, `__Pausable_init()`.
- Existing grants preserved: `GUARDIAN_ROLE` and `ACCOUNT_MODERATOR_ROLE` to `admin`.
- Set `membershipManager`, `polymarketAdapter`; allowlist `initialTokens` (same loop + `TokenAllowed` events).
- **Inline state initializer must move into `initialize`**: `uint256 private _nextWagerId = 1;` becomes a
  plain declaration `uint256 private _nextWagerId;` with `_nextWagerId = 1;` set inside `initialize` (inline
  initializers run in constructor context and do **not** take effect behind a proxy — this is the one easy-to-
  miss conversion bug). `bytes32 public constant` role ids and the `_CONSENT_*` constants stay constants (no
  storage, unaffected).
- The implementation's `constructor()` (inherited from `UUPSManaged`) calls `_disableInitializers()` so the
  bare implementation can never be initialized (FR-011, SC-008).

## Storage-layout baseline (append-only across upgrades)

The registry's own state, in declaration order — this ordering is the contract that future upgrades MUST
preserve (append only; never reorder/remove/retype). OZ v5 `*Upgradeable` bases (`AccessControl`, `Pausable`,
`ReentrancyGuard`, `UUPS`) do **not** appear here — they live in ERC-7201 namespaced slots and cannot collide.

| # | Variable | Type | Notes |
|---|----------|------|-------|
| 1 | `membershipManager` | `IMembershipManager` (address) | config (mutable) |
| 2 | `polymarketAdapter` | `IOracleAdapter` (address) | config (mutable) |
| 3 | `sanctionsGuard` | `ISanctionsGuard` (address) | config (mutable) |
| 4 | `oracleAdapters` | `mapping(ResolutionType => IOracleAdapter)` | |
| 5 | `_allowedTokens` | `mapping(address => bool)` | |
| 6 | `_wagers` | `mapping(uint256 => Wager)` | the core wager state |
| 7 | `_frozen` | `mapping(address => bool)` | |
| 8 | `wagerTermsVersionHash` | `mapping(uint256 => bytes32)` | |
| 9 | `_nextWagerId` | `uint256` | initialized to 1 in `initialize` (see above) |
| 10 | `_drawConsent` | `mapping(uint256 => uint8)` | |
| 11 | `_userWagerIds` | `mapping(address => EnumerableSet.UintSet)` | |
| — | `__gap` | `uint256[N]` | **trailing reserve** for future appends (e.g., feature 024's `claimAuthority` / `openWagerIdByClaim`) |

**Invariants**
- Existing entries 1–11 are never reordered, removed, or retyped; new state is appended (consuming `__gap`).
- Feature 024 appends `claimAuthority` + `openWagerIdByClaim` after #11 (drawing from `__gap`) — the first
  in-place upgrade and the proof of the pattern.
- The OZ `validateUpgrade` check fails CI on any violation **before** an upgrade can be applied.

## Upgrade state machine

```
  deployProxy(impl_v1, initialize(...))         // ERC1967Proxy → impl_v1; state established; funds escrow here
        │
        ▼
   ┌──────────┐   validateUpgrade(impl_v2)  [CI gate]    ┌──────────┐
   │ impl_v1  │ ───────────────────────────────────────►│ impl_v2  │
   │ (active) │   upgradeToAndCall(impl_v2)  [UPGRADER]   │ (active) │
   └──────────┘   (proxy address unchanged;              └──────────┘
        │          all state + funds preserved)                │
        │                                                       │  (… impl_v3 …, same rule)
        ▼                                                       ▼
   re-init attempt → revert (initializer used)         every existing wager flow unchanged (FR-003)
   non-UPGRADER upgrade → revert (role gate)
   storage-incompatible impl_v2 → blocked in CI before deploy (FR-010)
```

- **Deploy (US1)**: `ERC1967Proxy` + `impl_v1` running the **current** logic; `initialize` runs once; the
  proxy is the address users/frontend/subgraph use. Behavior identical to the legacy contract.
- **Upgrade (US2)**: `validateUpgrade` (CI) → `upgradeToAndCall(impl_vN)` by an `UPGRADER_ROLE` holder via the
  floppy keystore; proxy address unchanged; all wagers/balances/mappings preserved; new logic active; in-flight
  wagers continue uninterrupted.
- **Safety (US3)**: re-init reverts; non-`UPGRADER_ROLE` upgrade reverts; storage-incompatible upgrade is
  blocked pre-deploy; pause/unpause unaffected and never locks out `UPGRADER_ROLE`.

## Reusability (PR #724) — the membership analog

The same model applies unchanged to `MembershipManager` in its sibling spec: it inherits `UUPSManaged`,
converts its `constructor(admin, paymentToken_, treasury_)` to `initialize`, keeps its own state
(`_tiers`, `_memberships`, `authorizedCallers`, `paymentToken`, `treasury`, `accruedFees`, `memberTermsHash`)
append-only with a `__gap`, deploys via the same `lib/upgradeable.js`, and validates via the same
`check:storage-layout`. The voucher feature then appends its state as that proxy's first in-place upgrade —
exactly mirroring WagerRegistry → feature 024.

## Off-chain: deployments record

`deployments/<network>-chain<id>-v2.json` records, for the upgradeable registry, **both** addresses:

| Field | Meaning |
|-------|---------|
| `wagerRegistry` (proxy) | The stable address the frontend/subgraph use (unchanged across upgrades). |
| `wagerRegistryImpl` | The current implementation address (changes on each upgrade; for verification). |
| `wagerRegistryLegacy` | The prior non-upgradeable address (settle-only) during the coexistence window. |
