# Phase 0 Research: Upgradeable WagerRegistry

The spec's three funds-impacting unknowns (cutover, upgrade authorization, state-corruption prevention) were
resolved in the spec's Clarifications. This phase resolves the remaining **technical** decisions the design
depends on, with the PR #724 constraint front-of-mind: **the primitives must be generic and reusable** by a
second value-bearing contract (`MembershipManager` → voucher feature), not WagerRegistry-specific.

## R1 — Proxy pattern: UUPS vs Transparent vs Beacon

**Decision**: **UUPS** (OpenZeppelin `UUPSUpgradeable` over an `ERC1967Proxy`). Upgrade authorization lives in
the implementation (`_authorizeUpgrade`), gated by a role.

**Rationale**:
- Smallest proxy (just ERC1967), lowest runtime/deploy gas, and OZ's current recommended default.
- Authorization-in-implementation fits a role-gated, floppy-keystore admin and lets us enforce
  non-brickability and least privilege in Solidity we control.
- **Reusability**: each value-bearing contract gets its own UUPS proxy + impl from the *same* base — the
  pattern scales to `MembershipManager` by inheritance, no shared singleton to coordinate.

**Alternatives considered**:
- *Transparent proxy* — upgrade logic in a separate `ProxyAdmin`; more gas, an extra admin contract to
  manage, and the admin/selector-clash model is heavier. Rejected (UUPS is lighter and the role model is
  cleaner for our floppy-keystore flow).
- *Beacon proxy* — one beacon upgrades many proxies that share **one** implementation. Our upgradeable
  contracts are **different** implementations (WagerRegistry ≠ MembershipManager), so a beacon adds
  indirection without benefit. Rejected.
- *Diamond (EIP-2535)* — modular facets; larger audit/tooling surface than the problem needs. Rejected for
  v1; UUPS can host growing surfaces via additive upgrades (this is exactly how feature 024 lands).

## R2 — Reusable upgrade base (PR #724 ask)

**Decision**: Add a small abstract `contracts/upgradeable/UUPSManaged.sol` that bundles the cross-cutting
primitives every upgradeable, role-controlled, value-bearing contract needs, and have `WagerRegistry` (now)
and `MembershipManager` (sibling spec) inherit it:

```
abstract contract UUPSManaged is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    constructor() { _disableInitializers(); }                       // impl cannot be initialized
    function __UUPSManaged_init(address admin) internal onlyInitializing {
        __UUPSUpgradeable_init(); __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }
    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}  // non-brickable gate
    uint256[50] private __gap;                                      // reserve base slots
}
```

**Rationale**: This is the smallest unit that satisfies "keep proxy/auth tooling reusable so #2 doesn't
reimplement it." It carries the three things that are identical across contracts — UUPS wiring,
`_disableInitializers`, and a least-privilege `UPGRADER_ROLE` gate — and nothing contract-specific. Each
adopter adds its own bases (`WagerRegistry` adds `ReentrancyGuardUpgradeable` + `PausableUpgradeable`) and
its own initializer that calls `__UUPSManaged_init(admin)` first.

**Alternatives**: A copy-pasted UUPS block in each contract (rejected — the exact drift the maintainer warned
against); a single mega-base with reentrancy/pause baked in (rejected — `MembershipManager` doesn't need
them, and forcing them bloats its surface).

## R3 — OZ v5 upgradeable conversion + storage model

**Decision**: Use `@openzeppelin/contracts-upgradeable@^5.4.0` (matching `contracts@5.4.0`). Swap each OZ base
to its `*Upgradeable` variant, replace the constructor with a one-time `initialize(...)` (OZ `initializer`
modifier), keep the registry's own state **sequential and append-only**, and add a trailing
`uint256[N] __gap`.

**Rationale**:
- OZ v5 `*Upgradeable` bases use **ERC-7201 namespaced storage**, so `AccessControl`/`Pausable`/
  `ReentrancyGuard`/`UUPS` base state never collides with the registry's own variables and never shifts on
  upgrade — only the registry's own append-only state and the `__gap` matter for layout safety.
- The registry has **no `immutable`/constructor-computed constants that hold config** (membership manager,
  adapters, sanctions guard, token allowlist are all mutable storage), so moving the constructor body into
  `initialize(admin, membershipManager_, polymarketAdapter_, initialTokens)` is mechanical and
  behavior-identical. `bytes32 public constant` role ids stay constants (no storage).
- A trailing `__gap` reserves slots so future appends (e.g., feature 024's two mappings) don't risk bumping
  into anything.

**Alternatives**: ERC-7201 namespaced storage for the registry's *own* state too — more robust but a larger
refactor of every state access; deferred (append-only + the CI check meets the spec). Keeping the constructor
(non-upgradeable) — rejected (defeats the feature).

## R4 — Storage-layout safety as a generic CI gate

**Decision**: Add `@openzeppelin/hardhat-upgrades` and an `npm run check:storage-layout` script that runs OZ's
`validateImplementation` / `validateUpgrade` for each upgradeable contract; wire it as a **gating** step in
the contract CI (`test.yml`). It flags reordered/removed/retyped storage and unsafe patterns (e.g., missing
`_disableInitializers`, `selfdestruct`, `delegatecall`) **before** any upgrade is applied.

**Rationale**: This is the spec's FR-010/SC-005 mechanism and is inherently **contract-agnostic** — the same
check protects `MembershipManager` later. Using the audited plugin beats a hand-rolled solc storage-layout
diff (which would reimplement what the plugin already does, and miss the unsafe-pattern detectors).

**Notes**:
- For the **first** proxy deploy there is no prior implementation to diff against; `validateImplementation`
  still runs the unsafe-pattern checks. Subsequent upgrades (feature 024, and every future change) run the
  full `validateUpgrade` against the currently-deployed implementation.
- The plugin composes with the existing `hardhat-toolbox`/`hardhat-ethers` and the repo's custom
  floppy-keystore loader in `hardhat.config`.

## R5 — Upgrade execution via the floppy keystore

**Decision**: Authorize/run `upgradeToAndCall` with the existing **floppy-keystore** signer (already wired in
`hardhat.config`). `_authorizeUpgrade` is gated by `UPGRADER_ROLE`, granted to the floppy admin at
`initialize`. A generic `scripts/deploy/lib/upgradeable.js` exposes `deployProxy(name, initArgs)` and
`upgradeProxy(name, proxyAddr)` that: run the storage-layout validation, deploy the implementation, perform
the proxy deploy or `upgradeToAndCall`, and record `{ proxy, implementation }` in `deployments/<net>.json`.

**Rationale**: Reuses the repo's air-gapped signing flow (no new key management), keeps the tooling
contract-agnostic (parametrized by contract name + proxy address) so membership reuses it, and keeps
`deployments/` the source of truth (FR-014) with both addresses recorded.

**Role choice**: a dedicated `UPGRADER_ROLE` (not raw `DEFAULT_ADMIN_ROLE`) so "may replace code" is separable
from "may change config" and can later be assigned to a timelock/multisig without a code change — least
privilege per Principle I. The spec's "admin role" is satisfied: the floppy admin holds `UPGRADER_ROLE` from
init.

## R6 — Cutover: coexistence (no on-chain migration)

**Decision**: Deploy the proxy running the **current** logic as a fresh deployment; do **not** migrate legacy
state. The legacy non-upgradeable registry becomes **settle-only** (existing wagers remain
claimable/resolvable/refundable there); all **new** wagers use the proxy. Record both the legacy address and
the proxy address in `deployments/` + frontend config; the frontend distinguishes legacy (settle-only) from
new wagers until legacy drains.

**Rationale**: The live non-upgradeable contract cannot be retro-wrapped by a proxy, and on-chain state
migration of escrowed funds is high-risk and unnecessary. Coexistence is the honest, low-risk path
(Principle III) and the one-time cost of adopting the pattern. Memberships (sibling spec) drain even faster
(30-day time-bound), making their coexistence window ~a month.

**Alternatives**: Drain-first (pause new creation, wait out all resolve deadlines) — long and operationally
painful; on-chain state migration — complex and risky for funds. Both rejected.

## R7 — Backward compatibility surface

**Decision**: The migration changes **no** external function signature, event, error, or the `Wager` data
shape (FR-006). The only externally visible additions are the UUPS-standard `upgradeToAndCall` and an
`Upgraded(implementation)` event (ERC1967), plus the `UPGRADER_ROLE` id. `getWager` and every existing call
return identically. The frontend/subgraph keep working against the proxy with only an address-config change
(to the proxy) and an ABI refresh through the normal sync.

**Rationale**: FR-006/SC-001 — integrators must not break; feature 024 then layers additive changes on top of
the proxied contract.

## Cross-cutting: EthTrust Security Level target

**Decision**: Target **EthTrust-SL L2** for the upgrade surface: comprehensive unit + upgrade-lifecycle +
fuzz tests, checks-effects-interactions retained, reentrancy guard retained, `_disableInitializers` +
one-time `initializer` + non-brickable `_authorizeUpgrade`, append-only storage validated in CI, audited OZ
libraries, and a smart-contract security-agent review. Document the UUPS-specific invariants (impl cannot be
initialized; upgrade entrypoint always present; storage append-only) as the things tests and review must
protect.
