# Phase 0 Research: Upgradeable MembershipManager

This migration intentionally has **few open questions** — it reuses the pattern, decisions, and tooling already
settled and merged by feature 025. The items below confirm the reuse and pin the `MembershipManager`-specific
conversion. Format: **Decision / Rationale / Alternatives considered.**

## R1 — Reuse the 025 UUPS machinery (do not rebuild)

- **Decision**: Inherit `contracts/upgradeable/UUPSManaged.sol`, deploy via `scripts/deploy/lib/upgradeable.js`,
  and validate via `npm run check:storage-layout` — all merged via 025 / PR #724. No new base, tooling, or deps.
- **Rationale**: PR #724's explicit mandate was a *generic* upgrade layer reused by a second value-bearing
  contract; `MembershipManager` is that contract. The storage-check script already anticipates it ("MembershipManager
  joins here when it adopts UUPSManaged"). Reuse minimizes audit surface and guarantees pattern consistency.
- **Alternatives**: *Bespoke proxy/base for membership* (rejected — duplicates audited code, diverges from the
  established pattern, violates the #724 reuse mandate).

## R2 — Conversion specifics (`AccessControl` → `UUPSManaged`)

- **Decision**: `contract MembershipManager is IMembershipManager, UUPSManaged` (drop the plain `AccessControl`
  import; `UUPSManaged` supplies `AccessControlUpgradeable` + `UUPSUpgradeable` + `Initializable`). Keep
  `IERC20`/`SafeERC20` usage unchanged. Replace the constructor with:

  ```text
  function initialize(address admin, address paymentToken_, address treasury_) external initializer {
      if (admin == 0 || paymentToken_ == 0 || treasury_ == 0) revert ZeroAddress();
      __UUPSManaged_init(admin);            // FIRST: UUPS + AccessControl; grants DEFAULT_ADMIN_ROLE + UPGRADER_ROLE
      paymentToken = IERC20(paymentToken_);
      treasury = treasury_;
      _grantRole(ROLE_MANAGER_ROLE, admin); // preserve the existing grant (DEFAULT_ADMIN_ROLE already granted by base)
  }
  ```

  Mirrors the existing constructor's arguments and effects exactly.
- **Rationale**: Byte-for-byte behavior preservation (FR-003/FR-006); `__UUPSManaged_init` must be called first
  (base convention); the existing constructor already granted both `DEFAULT_ADMIN_ROLE` and `ROLE_MANAGER_ROLE`
  to `admin`, so only `ROLE_MANAGER_ROLE` needs an explicit grant (the base grants the other two).
- **Alternatives**: *Keep a constructor* (impossible behind a proxy — state would not persist). *Add
  `ReentrancyGuard`/`Pausable`* (rejected — the contract uses neither today; adding them is behavior change /
  scope creep).

## R3 — Inline state initializers

- **Decision**: None to move. `MembershipManager`'s only declaration-site initializers are `constant`s
  (`ROLLING_WINDOW`, `ROLE_MANAGER_ROLE`), which occupy no storage and are unaffected by the proxy. `accruedFees`
  and all mappings default to zero/empty, which is correct at first init.
- **Rationale**: Verified against the current source — unlike `WagerRegistry` (which had `_nextWagerId = 1`
  inline), `MembershipManager` has no mutable inline initializer, so there is no proxy-context footgun here.
- **Alternatives**: n/a.

## R4 — Storage baseline & append-only `__gap`

- **Decision**: Freeze the existing state order and append a trailing `uint256[50] private __gap;`. Order (slots,
  constants excluded): `_tiers`, `_memberships`, `authorizedCallers`, `paymentToken`, `treasury`, `accruedFees`,
  `sanctionsGuard`, `memberTermsHash`, then `__gap`. Feature 026 appends `voucher` after `memberTermsHash`
  (drawing from `__gap`).
- **Rationale**: Append-only is the contract the CI check enforces (FR-012/SC-005); the `__gap` leaves room for
  026 and beyond without shifting layout. OZ v5 bases are ERC-7201 namespaced and contribute no sequential slots.
- **Alternatives**: *No `__gap`* (rejected — would force a layout shift on the first real upgrade, defeating the
  purpose).

## R5 — Register with the storage-layout CI gate

- **Decision**: Add `{ name: "MembershipManager", deploymentsKey: "membershipManager" }` to
  `UPGRADEABLE_CONTRACTS` in `scripts/deploy/check-storage-layout.js`. After the first proxy deploy records
  `membershipManagerImpl`, the check diffs future implementations for append-only compatibility; before that it
  runs the unsafe-pattern checks.
- **Rationale**: Reuses the exact mechanism 025 built; the script is already contract-agnostic.
- **Alternatives**: n/a.

## R6 — Cutover = coexistence + `WagerRegistry` repoint

- **Decision**: Deploy the membership proxy as a **new** address running current logic (Amoy → Polygon). The
  legacy non-upgradeable `MembershipManager` (Polygon `0x00c3…`, Amoy `0x101C…`) stays read/use-only for
  existing memberships; new purchases/grants go to the proxy. **Repoint `WagerRegistry`** to the new membership
  proxy via its existing `setMembershipManager(address) onlyRole(DEFAULT_ADMIN_ROLE)` (signed via floppy
  keystore). Withdraw any accrued fees from the legacy authority through its normal admin path. No on-chain
  migration of the `_memberships` mapping.
- **Rationale**: Same decision and reasoning as 025; a deployed non-upgradeable contract cannot be retro-wrapped.
  `WagerRegistry` already exposes a clean admin setter, so the repoint is a single transaction, not an upgrade.
  Memberships are 30-day time-bound, so the legacy drain window is ~a month — much shorter than wagers.
- **Alternatives**: *Drain-first* (rejected — would block new memberships for a month). *On-chain state
  migration* (rejected — the `_memberships`/`_tiers` mappings aren't enumerable on-chain; replay would be
  error-prone and unnecessary given the short term).

## R7 — Membership consumers unaffected

- **Decision**: `WagerRegistry`'s reads (`hasActiveRole`/`checkCanCreate`/`recordCreate`/`recordClose`) and the
  `authorizedCallers` hook surface are unchanged; after repoint they resolve against the proxy. The frontend and
  subgraph treat the proxy as the stable membership address (config/sync only).
- **Rationale**: The external `IMembershipManager` surface is stable (FR-006/FR-009); only the address the
  consumers point at changes once, at cutover.
- **Alternatives**: n/a.

## R8 — Security tooling reuse (EthTrust)

- **Decision**: Reuse Slither + Medusa + `check:storage-layout`; add `MembershipManager` to their scope; target
  EthTrust-SL ≥ L2; security-agent review before merge — mirroring 025.
- **Rationale**: Fund-custody + access-control surface warrants the existing high-risk tooling with no new
  pipeline.
- **Alternatives**: none (constitution-mandated).
