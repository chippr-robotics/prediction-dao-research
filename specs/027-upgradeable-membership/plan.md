# Implementation Plan: Upgradeable MembershipManager (Separate State from Logic)

**Branch**: `claude/transferable-memberships-ch3hlw` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-upgradeable-membership/spec.md`

## Summary

Make the active membership authority (`MembershipManager`) upgradeable so its **logic can be replaced without
changing the on-chain address or losing state** — the same problem 025 solved for `WagerRegistry`. The chosen
mechanism is the **already-merged UUPS machinery from 025**: the membership authority inherits the shared
`contracts/upgradeable/UUPSManaged.sol` base, is deployed via the contract-agnostic
`scripts/deploy/lib/upgradeable.js` proxy/upgrade tooling, and is gated by the `npm run check:storage-layout`
append-only validation. **Nothing new is built** — this is the second adopter of the 025 pattern.

The migration is behavior-neutral: the upgradeable authority is stood up running the **current** logic, so
behavior is byte-for-byte unchanged at cutover. The only thing that changes is that *future* logic (the
immediate driver being **feature 026's `redeemVoucher`**) can be swapped in as an in-place, append-only upgrade
without abandoning state.

Technical approach (smallest change that satisfies the spec):

- **`MembershipManager` conversion (behavior-neutral)**: swap `AccessControl` → `AccessControlUpgradeable` (via
  `UUPSManaged`), move the constructor body into a one-time `initialize(admin, paymentToken_, treasury_)` that
  calls `__UUPSManaged_init(admin)` first and re-grants `ROLE_MANAGER_ROLE`, and add a trailing storage
  `__gap`. No function, event, error, struct, or behavior change — the existing suite stays green.
- **Reuse 025 primitives (no new code)**: inherit `UUPSManaged`; register `MembershipManager` in the existing
  `check:storage-layout` contract list; deploy proxy+impl via `lib/upgradeable.js`; record both addresses in
  `deployments/`.
- **Cutover = coexistence**: deploy the proxy running **current** logic (Amoy → Polygon); the legacy
  non-upgradeable authority stays read/use-only for existing memberships (which drain within ~30 days);
  **repoint `WagerRegistry` to the new membership proxy** via its existing
  `setMembershipManager(address)` admin function (floppy keystore). No on-chain state migration.

This is the **prerequisite for feature 026** (membership vouchers), which then ships as the **first in-place,
append-only upgrade** of this membership proxy — exactly as feature 024 is the first upgrade of the
WagerRegistry proxy.

## Technical Context

**Language/Version**: Solidity ^0.8.24 (Hardhat 2.28); JavaScript/ES2022 for deploy/CI tooling; React + Vite
frontend and The Graph subgraph consume synced artifacts (no app-logic change here).

**Primary Dependencies**: `@openzeppelin/contracts@5.4.0` (existing) + `@openzeppelin/contracts-upgradeable@5.4.0`
and `@openzeppelin/hardhat-upgrades@^3.9.0` — **all already present** (added and justified by 025). No new
dependency is introduced. The conversion needs only `AccessControlUpgradeable` (via `UUPSManaged`); the
contract uses no `ReentrancyGuard`/`Pausable` today, so none are added.

**Storage**: On-chain — the ERC1967 proxy holds all `MembershipManager` state; OZ v5 `*Upgradeable` bases use
ERC-7201 **namespaced** storage (collision-free), while the authority's own state stays sequential and
**append-only** with a trailing `__gap`. Off-chain — `deployments/*.json` records the proxy
(`membershipManager`) and current implementation (`membershipManagerImpl`) addresses (source of truth).

**Testing**: Hardhat unit/integration in `test/` (full existing membership suite must pass against the proxied
authority, unchanged — FR-003/SC-003), a new upgrade-lifecycle suite (deploy → upgrade → state-preservation →
auth → re-init → storage-incompat), the existing wager suite must pass with `WagerRegistry` pointed at the
membership proxy (FR-009), Slither (UUPS/proxy detectors) + Medusa, and OZ `validateUpgrade` in CI
(`check:storage-layout`).

**Target Platform**: Polygon mainnet (137) + Amoy testnet (80002) live deployments; local (1337) for dev.
Mordor/ETC legacy read-only out of scope.

**Project Type**: Web3 monorepo — Solidity contracts + JS deploy/CI tooling + React frontend + Graph subgraph.

**Performance Goals**: A UUPS delegatecall adds negligible per-call overhead vs. the current direct call; no
new loops or unbounded state. Upgrades are O(1) admin operations. Storage-layout validation runs in CI.

**Constraints**: Highest-risk surface — this controls who may replace code that holds accrued USDC fees and
gates wager participation. Constitution Principle I applies in full (CEI unchanged, `_disableInitializers` on
the impl via `UUPSManaged`, one-time `initializer`, non-brickable `_authorizeUpgrade`, append-only storage with
`__gap`, EthTrust-SL ≥ L2). Backward compatibility is mandatory (FR-006): the external ABI, events, errors, and
the `IMembershipManager` surface are unchanged by the migration.

**Scale/Scope**: 2 live chains; 3 user stories; 18 functional requirements. Touches `MembershipManager.sol`
(base swap + initializer + `__gap`), the `check:storage-layout` contract list (+1 entry), the deploy script
(deploy membership as proxy+impl; repoint `WagerRegistry`), `deployments/` schema, and frontend/subgraph
address config (coexistence). Establishes the membership proxy that feature 026 upgrades.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)**: This governs replacement of code that custodies
  accrued USDC fees and gates wager participation. Design commitments (all reused from the 025 pattern):
  - **Uninitialized-implementation defense**: `UUPSManaged`'s `constructor()` calls `_disableInitializers()` so
    a bare `MembershipManager` implementation can never be initialized and hijacked. (FR-015)
  - **One-time initializer**: the former constructor becomes `initialize(admin, paymentToken_, treasury_)`
    guarded by OZ `initializer`; re-invocation reverts. `DEFAULT_ADMIN_ROLE` + `UPGRADER_ROLE` (from the base)
    and `ROLE_MANAGER_ROLE` are granted exactly once, in `initialize`. (FR-013, SC-008)
  - **Non-brickable upgrade authorization**: the base's `_authorizeUpgrade(address) onlyRole(UPGRADER_ROLE)` is
    the only gate; never removed by an upgrade. (FR-014)
  - **Least privilege**: the dedicated `UPGRADER_ROLE` (granted to the floppy-keystore admin at init) separates
    "may upgrade code" from "may change config"; reassignable to a timelock/multisig with no code change. (FR-011)
  - **Storage-layout safety**: OZ v5 bases are ERC-7201 namespaced; the authority's own state is append-only
    with a trailing `__gap`; `check:storage-layout` (OZ `validateUpgrade`) blocks reordered/removed/retyped
    storage and unsafe patterns **before** any upgrade. (FR-012, SC-005)
  - **Behavior neutrality**: every check, the fee math, screening, and Terms recording are byte-for-byte the
    existing logic; the migration adds no new fund flow. (FR-003, SC-003)
  - **Tooling**: Slither + Medusa clean (no new high/critical); OZ upgrade validation in CI; smart-contract
    security-agent review before merge; EthTrust-SL ≥ L2 with documented reasoning.
    **PASS (commitments carried into research, data-model, contracts, and tasks).**
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)**: A new membership upgrade-lifecycle suite is
  written first (proxy deploy with current logic; behavior-neutral + additive upgrade; state preserved across
  upgrade; non-admin upgrade rejected; re-init rejected; storage-incompatible impl rejected by validation). The
  **entire existing membership suite must pass unchanged** against the proxied authority (FR-003/SC-003), and
  the **wager suite must pass** with `WagerRegistry` pointed at the membership proxy (FR-009). **PASS.**
- **III. Honest State, No Mocks/Placeholders**: The proxy reflects real on-chain state; the coexistence cutover
  is surfaced honestly — legacy memberships shown as legacy on the old address, never implied to have "moved"
  (FR-007). Addresses/ABIs come only from synced artifacts (FR-017). Network-scoped as today. **PASS.**
- **IV. Fail Loudly in CI**: The `check:storage-layout` validation and the upgrade-lifecycle tests fail the
  pipeline on error; no `continue-on-error` on test/Slither/validate/build. **PASS.**
- **V. Accessible, Consistent Frontend**: No new UI; the only frontend touch is config (the proxy is the stable
  membership address; legacy shown distinctly) sourced from `sync:frontend-contracts`, never hand-copied. **PASS.**

**New core technology justification**: None — the upgradeable + upgrade-validation deps were introduced and
justified by 025; this feature reuses them. No bespoke proxy or storage diff.

**Result**: All gates pass with the explicit Principle I commitments above. No deviations →
**Complexity Tracking not required.**

*Post-Phase 1 re-check*: The design swaps OZ bases to their audited upgradeable variants via the existing shared
base, moves the constructor into a one-time `initialize`, adds a `__gap`, and registers the contract with the
existing storage-check + deploy tooling — no new fund logic, no new roles beyond the reused least-privilege
`UPGRADER_ROLE`, no struct/ABI/event break. Feature 026 reuses this proxy as an append-only upgrade rather than
duplicating anything. **Still PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/027-upgradeable-membership/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — reuse-vs-rebuild, conversion specifics, coexistence + WagerRegistry repoint
├── data-model.md        # Phase 1 — proxy/impl entities, MembershipManager storage baseline + append-only rule
├── quickstart.md        # Phase 1 — deploy → repoint → upgrade → validate end-to-end validation guide
├── contracts/           # Phase 1
│   └── membership-manager-uups.md   # MembershipManager-specific conversion (bases, initialize, __gap); reuses 025 base/tooling docs
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── upgradeable/
│   └── UUPSManaged.sol               # REUSE (no change): shared base from 025
└── access/
    └── MembershipManager.sol         # EDIT: inherit UUPSManaged (AccessControl→AccessControlUpgradeable);
                                      #       constructor→initialize(admin,paymentToken_,treasury_);
                                      #       trailing __gap; NO behavior/ABI/struct change

test/
├── upgradeable/
│   └── MembershipManager.upgrade.test.js # NEW: deploy → upgrade → state-preserved → auth → re-init → storage-incompat
└── (existing MembershipManager.*.test.js + wager suite) # MUST pass unchanged; wager suite with proxy-pointed registry (FR-003/FR-009)

scripts/deploy/
├── lib/upgradeable.js                # REUSE (no change): generic proxy/upgrade tooling from 025
├── check-storage-layout.js           # EDIT: add { name: "MembershipManager", deploymentsKey: "membershipManager" }
├── deploy.js                         # EDIT: deploy MembershipManager as proxy+impl via lib/upgradeable.js;
│                                      #       repoint WagerRegistry via setMembershipManager(newProxy)
└── verify.js                         # EDIT: verify the membership implementation (and proxy) on explorers

deployments/*.json                    # EDIT: record membershipManager (proxy) + membershipManagerImpl
frontend/ + subgraph/                 # EDIT (cutover): point at the membership proxy as the stable address;
                                      #   mark legacy memberships distinctly (coexistence) — config/sync only
```

**Structure Decision**: Web3 monorepo. This feature is purely the **second adopter** of 025's reusable upgrade
layer: it edits one contract (`MembershipManager`), adds one entry to the storage-check list, and extends the
deploy script — reusing `UUPSManaged`, `lib/upgradeable.js`, and `check:storage-layout` unchanged. The contract
ABI reaches the frontend only through `sync:frontend-contracts` (Principle V); the proxy address is stable
across upgrades so no repoint is needed after the initial cutover.

## Complexity Tracking

> No constitution violations — section intentionally empty. (The OZ upgradeable + hardhat-upgrades deps were
> justified by 025; this feature introduces none. The behavior-neutral migration adds no new fund logic.)
