# ADR-004: Upgradeable contracts via UUPS proxies

**Status**: Accepted

**Date**: 2026-06-20

**Authors**: FairWins engineering

**Deciders**: realcodywburns

## Context

The active escrow contract `WagerRegistry` was **not upgradeable**: state and logic lived in one deployed
contract at a fixed address. Every logic change — even a purely additive feature — required deploying a
**new** contract at a **new** address. Because the new contract starts with empty storage, every wager,
balance, and mapping on the old address was left behind: existing wagers were **stranded** and had to be
settled out-of-band on each release. This made shipping features (e.g. open-challenge wagers, feature 024)
disproportionately costly and risky.

In parallel, the membership work (transferable/giftable memberships via voucher NFTs) hit the same wall and
realized upgradeability is an **app-wide** need, not a WagerRegistry-specific one (PR #724). So the
machinery must be reusable across value-bearing contracts.

Constraints: this is the highest-risk surface in the repo (it controls who may replace fund-custody code);
the existing external interface (functions, events, errors, `Wager` shape) must stay stable; admin keys are
the air-gapped floppy keystore; the live non-upgradeable registry on Polygon cannot be retro-wrapped.

## Decision

We will make value-bearing contracts **upgradeable via OpenZeppelin UUPS proxies** (`ERC1967Proxy` +
`UUPSUpgradeable`), with the upgrade machinery factored into a **reusable base** `UUPSManaged` that every
such contract inherits. `WagerRegistry` is the first adopter (spec 025); `MembershipManager` is the second
(sibling spec), after which the voucher feature ships as the membership proxy's first in-place upgrade.

The legacy non-upgradeable registry is handled by **coexistence**, not migration: it becomes settle-only
while new wagers use the proxy.

## Rationale

- **UUPS over Transparent/Beacon/Diamond**: smallest proxy, lowest gas, OZ's current default; authorization
  lives in the implementation so we enforce non-brickability and least privilege in code we control; each
  contract gets its own impl (Beacon's shared-impl model doesn't fit WagerRegistry ≠ MembershipManager).
- **Reusable `UUPSManaged` base** (PR #724): one audited place for the cross-cutting primitives —
  `_disableInitializers` (footgun defense), one-time `initializer`, a least-privilege non-brickable
  `_authorizeUpgrade` gate, and storage `__gap` — so the second adopter doesn't reimplement (or drift from)
  the security-critical wiring.
- **Storage-layout safety as a CI gate**: OpenZeppelin `hardhat-upgrades` `validateUpgrade` blocks a
  reordered/removed/retyped-storage (state-corrupting) upgrade before it can be applied.
- **Coexistence cutover**: the live contract can't be retro-wrapped and on-chain fund migration is high-risk;
  legacy wagers settling on the old address is the honest, low-risk one-time cost.

## Consequences

### Positive

- Future logic ships as an **in-place upgrade**: stable address, preserved state, no stranded wagers, no
  frontend/subgraph repoint (only the ABI grows).
- The pattern is reusable: `MembershipManager` + voucher redemption ride the same base + tooling.
- Behavior-neutral migration — the full existing test suite passes unchanged through the proxy.

### Negative

- A one-time coexistence window where the app surfaces both the legacy (settle-only) registry and the new
  proxy until legacy wagers drain.
- Two new dependencies (`@openzeppelin/contracts-upgradeable`, `@openzeppelin/hardhat-upgrades`), pinned to
  the audited OZ stack already in use.
- Upgradeability is a powerful capability over funds — mitigated by least-privilege `UPGRADER_ROLE` + the
  floppy keystore + the storage-layout CI gate + security review.

### Risks

- **Uninitialized implementation hijack** → mitigated by `_disableInitializers()` in the base constructor.
- **Re-initialization to seize roles** → mitigated by the one-time `initializer` (re-init reverts).
- **Bricked upgrade path** → mitigated by a non-brickable `_authorizeUpgrade` that no upgrade can remove.
- **State corruption via bad layout** → mitigated by append-only storage + `__gap` + the CI `validateUpgrade`
  gate.
- **Inline initializer bug** → the `_nextWagerId = 1` inline initializer was moved into `initialize` (inline
  initializers run in constructor context and are ignored behind a proxy).

## Alternatives Considered

### Alternative 1: Transparent proxy

Upgrade logic in a separate `ProxyAdmin`. **Cons:** more gas, an extra admin contract, heavier admin/selector
model. **Why not chosen:** UUPS is lighter and its role-gated authorization fits the floppy-keystore flow.

### Alternative 2: Beacon proxy

One beacon upgrades many proxies sharing one implementation. **Cons:** our upgradeable contracts are
different implementations. **Why not chosen:** adds indirection with no benefit here.

### Alternative 3: Diamond (EIP-2535)

Modular facets. **Cons:** larger audit/tooling surface than needed. **Why not chosen:** UUPS hosts growing
surfaces via additive upgrades (exactly how feature 024 lands).

### Alternative 4: Drain-first or on-chain state migration at cutover

**Cons:** drain-first means pausing creation and waiting out all resolve deadlines (long); state migration of
escrowed funds is complex and risky. **Why not chosen:** coexistence is lower-risk and honest.

## Implementation Notes

- `contracts/upgradeable/UUPSManaged.sol` — the reusable base. Adopters inherit it, call
  `__UUPSManaged_init(admin)` first in their `initializer`, and keep state append-only with a trailing
  `__gap`.
- Storage is **append-only**: never insert/reorder/remove existing variables; new state consumes `__gap`.
  Run `npm run check:storage-layout` (gating in CI `test.yml`).
- Deploy/upgrade via `scripts/deploy/lib/upgradeable.js` (`deployProxy`/`upgradeProxy`); both proxy and
  implementation addresses are recorded in `deployments/` (`wagerRegistry` = proxy, `wagerRegistryImpl` =
  implementation).
- Operational procedure: `docs/runbooks/contract-upgrades.md`. Reuse guide for new contracts:
  `docs/developer-guide/upgradeable-contracts.md`.

## References

- spec 025: `specs/025-upgradeable-registry/` (spec.md, plan.md, research.md, data-model.md, contracts/)
- PR #724 (this work); feature 024 (`specs/024-open-challenge-wagers/`) ships as the first in-place upgrade
- [ADR-001: Trail of Bits toolchain](001-trail-of-bits-toolchain.md)
- OpenZeppelin UUPS / Upgrades Plugins documentation

## Revision History

| Date | Changes | Author |
|------|---------|--------|
| 2026-06-20 | Initial version | FairWins engineering |
