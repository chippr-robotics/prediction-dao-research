# Implementation Plan: Upgradeable WagerRegistry (Separate State from Logic)

**Branch**: `025-upgradeable-registry` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/025-upgradeable-registry/spec.md`

## Summary

Make the active escrow (`WagerRegistry`) upgradeable so its **logic can be replaced without changing the
on-chain address or losing state** — ending the "every change strands wagers on a new address" problem. The
chosen mechanism is an **OpenZeppelin UUPS proxy**: persistent state lives at the proxy address; logic lives
in a swappable implementation; an admin-gated, non-brickable `_authorizeUpgrade` (signed via the floppy
keystore) authorizes upgrades; and a storage-layout compatibility check (OZ `hardhat-upgrades`) blocks any
state-corrupting upgrade.

Per the maintainer's note on PR #724, the upgradeability machinery is built **generically**, not
WagerRegistry-specific, so a second value-bearing contract (`MembershipManager`, a separate sibling spec that
then carries the voucher-redemption feature) reuses the *same* primitives without reimplementing them.
**025 stays WagerRegistry-first** — it is the first adopter and the proof of the pattern; membership is a
dependent follow-on, not a fusion.

Technical approach (smallest change that satisfies the spec):

- **Shared upgrade base (reusable)**: a small abstract `contracts/upgradeable/UUPSManaged.sol` that bundles
  `Initializable` + `UUPSUpgradeable` + `AccessControlUpgradeable`, exposes an `UPGRADER_ROLE`, implements
  `_authorizeUpgrade(newImpl) onlyRole(UPGRADER_ROLE)` (non-brickable — the entrypoint always survives), and
  `_disableInitializers()` in its constructor (so a bare implementation can never be initialized). Both
  `WagerRegistry` and the future `MembershipManager` inherit it.
- **`WagerRegistry` conversion (behavior-neutral)**: swap the OZ bases to their `*Upgradeable` variants
  (`AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `PausableUpgradeable`), inherit `UUPSManaged`,
  move the constructor body into a one-time `initialize(...)` (the same args/effects), and add a trailing
  storage `__gap`. No function, event, error, struct, or behavior change — the existing suite stays green.
- **Generic safety + tooling (reusable)**: add `@openzeppelin/hardhat-upgrades` and a
  `npm run check:storage-layout` step (wired into contract CI) that validates any upgradeable contract's
  implementation/upgrade for unsafe patterns and append-only storage; a contract-agnostic
  `scripts/deploy/lib/upgradeable.js` that deploys `ERC1967Proxy + impl`, records **both** addresses in
  `deployments/`, and performs `upgradeToAndCall` via the floppy-keystore signer; frontend/subgraph sync that
  treats the proxy as the stable address.
- **Cutover = coexistence**: deploy the proxy running **current** logic (Amoy → Polygon); the legacy
  non-upgradeable registry stays settle-only; the frontend records/show both until legacy wagers drain. No
  on-chain state migration.

## Technical Context

**Language/Version**: Solidity ^0.8.24 (Hardhat 2.28); JavaScript/ES2022 for deploy/CI tooling; React + Vite
frontend and The Graph subgraph consume the synced artifacts (no app-logic change here).

**Primary Dependencies**: `@openzeppelin/contracts@5.4.0` (already present) **plus two new deps**:
`@openzeppelin/contracts-upgradeable@^5.4.0` (the `*Upgradeable` bases — `Initializable`, `UUPSUpgradeable`,
`AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`, `PausableUpgradeable`, and later `EIP712Upgradeable`
for feature 024) and `@openzeppelin/hardhat-upgrades` (storage-layout validation + proxy helpers; peer
`@nomicfoundation/hardhat-ethers` is already provided by `hardhat-toolbox`). Both are justified below
(Constitution / new-core-technology). Note: a stray transitive `@openzeppelin/contracts-upgradeable@4.9.3`
exists in the tree — the plan pins **v5.4.0** to match `contracts`.

**Storage**: On-chain — the ERC1967 proxy holds all `WagerRegistry` state; OZ v5 `*Upgradeable` bases use
ERC-7201 **namespaced** storage (collision-free), while the registry's own state stays sequential and
**append-only** across upgrades, with a trailing `__gap`. Off-chain — `deployments/*.json` records the proxy
and current implementation addresses (source of truth).

**Testing**: Hardhat unit/integration in `test/` (full existing suite must pass against the proxied registry,
unchanged — FR-003/SC-003), a new upgrade-lifecycle suite (deploy → upgrade → state-preservation → auth →
re-init → storage-incompat), Slither (UUPS/proxy detectors) + Medusa in `security-testing.yml`, and OZ
`validateUpgrade` in CI (`test.yml`). Fork tests unaffected (behavior-neutral).

**Target Platform**: Polygon mainnet (137) + Amoy testnet (80002) live deployments; local (1337) for dev.
Mordor/ETC legacy read-only out of scope.

**Project Type**: Web3 monorepo — Solidity contracts + JS deploy/CI tooling + React frontend + Graph subgraph.

**Performance Goals**: A UUPS delegatecall adds negligible per-call overhead vs. the current direct call; no
new loops or unbounded state. Upgrades are O(1) admin operations. Storage-layout validation runs in CI, not
on-chain.

**Constraints**: Highest-risk surface — this controls who may replace fund-custody code. Constitution
Principle I applies in full (checks-effects-interactions unchanged, reentrancy guard retained,
`_disableInitializers` on the impl, one-time `initializer`, non-brickable `_authorizeUpgrade`, append-only
storage with `__gap`, EthTrust-SL ≥ L2). Backward compatibility is mandatory (FR-006): the external ABI,
events, errors, and `Wager` data shape are unchanged by the migration. New core deps require justification
(below). Reusability is a first-class requirement (PR #724 comment): the base contract, storage-check, and
deploy tooling MUST NOT be WagerRegistry-coupled.

**Scale/Scope**: 2 live chains; 3 user stories; 16 functional requirements. Touches `WagerRegistry.sol` (base
swap + initializer + `__gap`), a new `contracts/upgradeable/UUPSManaged.sol`, the deploy library + scripts,
one CI step, `package.json`, and the frontend/subgraph address config (coexistence). Establishes the pattern
that `MembershipManager` (sibling spec) and the voucher feature reuse.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)**: This is the single highest-risk change in the repo —
  it governs replacement of the code that custodies user stakes. Design commitments:
  - **Uninitialized-implementation defense**: the shared base's `constructor()` calls `_disableInitializers()`
    so a bare implementation can never be initialized and hijacked (the classic UUPS footgun). (FR-011)
  - **One-time initializer**: the former constructor becomes `initialize(...)` guarded by OZ `initializer`;
    re-invocation reverts. Roles (`DEFAULT_ADMIN_ROLE`/`GUARDIAN_ROLE`/`ACCOUNT_MODERATOR_ROLE`/
    `UPGRADER_ROLE`) are granted exactly once, in `initialize`. (FR-011, SC-008)
  - **Non-brickable upgrade authorization**: `_authorizeUpgrade(address) onlyRole(UPGRADER_ROLE)` is the only
    gate; it is never removed by an upgrade, so future upgrades are always possible. (FR-012)
  - **Least privilege**: a dedicated `UPGRADER_ROLE` (granted to the floppy-keystore admin at init) separates
    "may upgrade code" from "may change config", and can later be moved to a timelock/multisig without code
    change. (FR-009)
  - **Storage-layout safety**: OZ v5 bases are ERC-7201 namespaced; the registry's own state is append-only
    with a trailing `__gap`; `@openzeppelin/hardhat-upgrades` `validateUpgrade` blocks reordered/removed/
    retyped storage and unsafe patterns **before** any upgrade is applied. (FR-010, SC-005)
  - **Behavior neutrality**: checks-effects-interactions, the reentrancy guard, pause semantics, and all fund
    math are byte-for-byte the existing logic; the migration adds no new fund flow. (FR-003, SC-003)
  - **Tooling**: Slither (UUPS/proxy detectors) + Medusa clean (no new high/critical); OZ upgrade validation
    in CI; smart-contract security-agent review before merge; EthTrust-SL ≥ L2 with documented reasoning.
    **PASS (commitments carried into research, data-model, and tasks).**
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)**: A new upgrade-lifecycle suite is written
  first (proxy deploy with current logic; a behavior-neutral and an additive upgrade; state preserved across
  upgrade; non-admin upgrade rejected; re-init rejected; storage-incompatible impl rejected by validation;
  pause/upgrade interaction). The **entire existing `WagerRegistry` suite must pass unchanged** against the
  proxied contract (FR-003/SC-003). Generic tooling gets its own tests. **PASS.**
- **III. Honest State, No Mocks/Placeholders**: The proxy reflects real on-chain state; the coexistence
  cutover is surfaced honestly — legacy wagers are shown as settle-only on the legacy address, never implied
  to have "moved" (FR-007). Addresses/ABIs come only from the synced artifacts (FR-015). Network-scoped as
  today. **PASS.**
- **IV. Fail Loudly in CI**: The new storage-layout validation and the upgrade-lifecycle tests fail the
  pipeline on error; no `continue-on-error` on test/Slither/validate/build. **PASS.**
- **V. Accessible, Consistent Frontend**: No new UI in 025; the only frontend touch is config (the proxy is
  the stable address; legacy shown as settle-only) sourced from `sync:frontend-contracts`, never hand-copied.
  **PASS.**

**New core technology justification** (Additional Constraints): `@openzeppelin/contracts-upgradeable` and
`@openzeppelin/hardhat-upgrades` are introduced because upgradeability *is* the feature; OZ is the audited,
industry-standard implementation already used elsewhere in the repo (contracts v5.4.0), and the
`hardhat-upgrades` plugin provides exactly the storage-layout safety the spec mandates (FR-010/SC-005).
Building a bespoke proxy or storage diff would be a larger, less-audited surface — rejected.

**Result**: All gates pass with the explicit Principle I commitments above. No deviations →
**Complexity Tracking not required.**

*Post-Phase 1 re-check*: The design swaps OZ bases to their audited upgradeable variants, adds one small
shared base contract, one CI validation step, and contract-agnostic deploy tooling — no new fund logic, no
new roles beyond a least-privilege `UPGRADER_ROLE`, no struct/ABI/event break. The generic primitives are
reused by the membership sibling spec rather than duplicated. **Still PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/025-upgradeable-registry/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — UUPS vs alternatives, OZ v5 conversion, storage safety, reusability
├── data-model.md        # Phase 1 — proxy/impl entities, storage layout + append-only rule, upgrade transitions
├── quickstart.md        # Phase 1 — deploy/upgrade/validate end-to-end validation guide
├── contracts/           # Phase 1
│   ├── uups-managed-base.md         # The reusable UUPSManaged base (shared by WagerRegistry + MembershipManager)
│   ├── wager-registry-uups.md       # WagerRegistry-specific conversion (bases, initialize, __gap, no behavior change)
│   └── deploy-upgrade-tooling.md    # Generic deploy/upgrade/validate tooling + deployments/ schema
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── upgradeable/
│   └── UUPSManaged.sol               # NEW: reusable Initializable+UUPSUpgradeable+AccessControlUpgradeable
│                                     #      base; UPGRADER_ROLE; _authorizeUpgrade; _disableInitializers
├── wagers/
│   └── WagerRegistry.sol             # EDIT: inherit UUPSManaged + *Upgradeable bases; constructor→initialize;
│                                     #       trailing __gap; NO behavior/ABI/struct change
└── interfaces/
    └── IWagerRegistry.sol            # (unchanged surface; only if an initializer signature is exposed)

test/
├── upgradeable/
│   ├── WagerRegistry.upgrade.test.js # NEW: deploy → upgrade → state-preserved → auth → re-init → pause
│   └── UUPSManaged.test.js           # NEW: base — UPGRADER_ROLE gate, _authorizeUpgrade non-brickable, _disableInitializers
└── (existing WagerRegistry.*.test.js) # MUST pass unchanged against the proxied contract (FR-003)

scripts/deploy/
├── lib/
│   └── upgradeable.js                # NEW: deployProxy(impl,initArgs), upgradeProxy(proxy,newImpl) via floppy
│                                     #      signer; records {proxy, implementation} in deployments/ (generic)
├── deploy.js                         # EDIT: deploy WagerRegistry as proxy+impl via lib/upgradeable.js
└── verify.js                         # EDIT: verify the implementation (and proxy) on the explorers

.github/workflows/
└── test.yml                          # EDIT: add `npm run check:storage-layout` (OZ validate) as a gating step

package.json                          # EDIT: add @openzeppelin/contracts-upgradeable@^5.4.0,
                                      #       @openzeppelin/hardhat-upgrades; add check:storage-layout script
hardhat.config.*                      # EDIT: require("@openzeppelin/hardhat-upgrades") (composes with floppy loader)

frontend/ + subgraph/                 # EDIT (cutover): point at the proxy as the stable address; mark the
                                      #   legacy registry settle-only (coexistence) — config/sync only, no logic
```

**Structure Decision**: Web3 monorepo. The upgrade machinery is deliberately split into a **reusable layer**
(`contracts/upgradeable/UUPSManaged.sol`, `scripts/deploy/lib/upgradeable.js`, the `check:storage-layout` CI
step) and a **first-adopter application** (`WagerRegistry` conversion + its deploy/cutover). This satisfies
the PR #724 ask: the membership sibling spec inherits `UUPSManaged`, calls the same deploy/validate tooling,
and adds the voucher feature as a pure append-only upgrade — without re-deriving any of the primitives. The
contract ABI reaches the frontend only through `sync:frontend-contracts` (Principle V), and the proxy address
is stable across upgrades so no repoint is needed.

## Complexity Tracking

> No constitution violations — section intentionally empty. (New OZ upgradeable + hardhat-upgrades deps are
> justified under the Constitution Check above, not deviations.)
