# Implementation Plan: Token Mint & Compliant Token Administration

**Branch**: `claude/fairwins-dao-token-mint-15who8` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/028-token-mint/spec.md`

## Summary

Add a **token issuance and administration layer** to FairWins: an authorized issuer can create, mint, and
administer tokens spanning four classes — open **ERC-20**, open **ERC-721** (each with optional
burnable/pausable), **ERC-1404** restricted tokens, and **T-REX / ERC-3643** permissioned security tokens —
through a single role-gated factory and a per-token administration surface that exposes only the controls valid
for each token's standard.

Technical approach (smallest change that satisfies the spec, reusing platform primitives):

- **`TokenFactory` (UUPS-upgradeable authority/registry)** — the one platform-owned contract that holds state
  and authority. It inherits the existing `contracts/upgradeable/UUPSManaged.sol` base (UUPS + AccessControl +
  non-brickable upgrade gate + impl-init lockout), gates issuance behind a new `TOKEN_ISSUER_ROLE`, screens the
  issuer through the existing `SanctionsGuard`, deploys tokens, and records every created token in a
  network-scoped registry (the source of truth for discovery and the issuer's admin list). Deployed proxy+impl
  via the existing `scripts/deploy/lib/upgradeable.js`; registered in `npm run check:storage-layout`.
- **Issued tokens are immutable per-issuer deployments** (NOT platform-upgradeable), produced as
  minimal-proxy **clones** of pre-deployed implementation templates — the gas-efficient pattern from the
  archived `TokenMintFactory`, modernized:
  - **Open ERC-20 / ERC-721** templates (basic / burnable / pausable variants) — OZ-based, owner-controlled
    `mint`/`pause`, with a non-bypassable `SanctionsGuard` check in the transfer hook.
  - **ERC-1404 restricted** template — open ERC-20 plus `detectTransferRestriction(from,to,value)` /
    `messageForTransferRestriction(code)` backed by a per-token restriction policy (eligibility list + freeze +
    sanctions), enforced in the transfer hook so the on-chain check and the pre-transfer eligibility check
    always agree.
- **T-REX / ERC-3643 permissioned tokens** — delivered on the **canonical ERC-3643 reference implementation**
  (Tokeny T-REX suite + ONCHAINID identity), vendored as audited dependencies rather than re-rolled. Per token
  the suite provides the token, Identity Registry (+ storage), Modular Compliance, Claim Topics Registry, and
  Trusted Issuers Registry, plus owner/agent administration (freeze, forced transfer, recovery, mint/burn,
  pause). `SanctionsGuard` is wired in as a **compliance module** so the platform's screening is enforced
  alongside identity/claim checks. `TokenFactory` records these tokens in the same registry.
- **Frontend revival (real Web3, no mocks)** — rebuild the previously archived token UI as: a creation wizard
  (pick standard → configure → submit real tx), a network-scoped token list, and a per-token admin surface that
  renders only the controls the token's standard supports. Addresses/ABIs come only from
  `sync:frontend-contracts`. A subgraph datasource indexes `TokenCreated` for discovery.

The archived `contracts-archive/tokens/TokenMintFactory.sol` and `FairWinsToken.sol` are **reference only** and
are neither imported nor deployed; the active implementation is written against current platform standards
(UUPS authority, `SanctionsGuard`, role-gated issuance, synced artifacts).

## Technical Context

**Language/Version**: Solidity ^0.8.24 (Hardhat 2.28); JavaScript/ES2022 for deploy/CI tooling; React + Vite
frontend; The Graph subgraph. Matches the rest of the repo.

**Primary Dependencies**: `@openzeppelin/contracts@5.4.0`, `@openzeppelin/contracts-upgradeable@5.4.0`,
`@openzeppelin/hardhat-upgrades@^3.9.0` (all present). **New core dependencies (justified in Complexity
Tracking):** the ERC-3643 reference suite (`@tokenysolutions/t-rex`) and ONCHAINID identity
(`@onchain-id/solidity`) for the T-REX token class. No new dependency is needed for the open or ERC-1404
classes (OZ only).

**Storage**: On-chain — `TokenFactory` state lives behind an ERC1967 proxy; OZ v5 `*Upgradeable` bases use
ERC-7201 namespaced storage, the factory's own state is sequential, **append-only**, with a trailing `__gap`.
Issued tokens hold their own state (immutable clones / T-REX proxies). Off-chain — `deployments/*.json` records
`tokenFactory` (proxy) + `tokenFactoryImpl` + the implementation-template and T-REX-suite addresses (source of
truth).

**Testing**: Hardhat unit tests in `test/` per token class and for the factory; integration tests for the full
create → administer lifecycle of each standard; **fork tests** for the T-REX suite where the vendored suite and
identity infrastructure interact; an upgrade-lifecycle suite for the factory (deploy → upgrade →
state-preserved → auth → re-init → storage-incompat). Frontend logic via Vitest. Slither (clone/proxy/UUPS
detectors) + Medusa with no new high/critical; OZ `validateUpgrade` in CI (`check:storage-layout`).

**Target Platform**: Amoy testnet (80002) first, then Polygon mainnet (137); local (1337) for dev. Feature is
disabled on networks where the factory/suite is not deployed (FR-023).

**Project Type**: Web3 monorepo — Solidity contracts + JS deploy/CI tooling + React frontend + Graph subgraph.

**Performance Goals**: Clone deployment keeps issuance gas low (single `CREATE` + `initialize` per token). The
per-transfer `SanctionsGuard`/restriction check is a Checks-phase staticcall (negligible, CEI-preserving). No
unbounded loops; the registry is append-only with paginated reads. End-to-end open-token creation under 3
minutes (SC-001).

**Constraints**: High-risk surface — issuance authority, fund-bearing tokens, and the regulated-security path.
Constitution Principle I applies in full: CEI + reentrancy guards on the factory, `_disableInitializers` on
every implementation/clone template and on the factory impl, one-time `initialize`, non-brickable
`_authorizeUpgrade`, append-only factory storage with `__gap`, fail-closed sanctions screening, EthTrust-SL ≥
L2. The vendored T-REX/ONCHAINID code is used **as published** (audited), not forked, to avoid re-rolling
identity/compliance crypto.

**Scale/Scope**: 1–2 live chains; 5 user stories; 26 functional requirements; 4 token classes. Adds
`contracts/tokens/` (factory + interfaces + per-class templates + sanctions compliance module), vendored T-REX
wiring, one `check:storage-layout` entry, deploy-script + `deployments/` changes, a subgraph datasource, and a
rebuilt frontend token module. Provides the issuance machinery that a later governance-token / DAO-manager
feature (spec 029) can consume.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)**: Governs new fund-bearing tokens, issuance authority,
  and a regulated-security path. Design commitments carried into research/data-model/contracts/tasks:
  - **Impl-init lockout**: the `TokenFactory` implementation (via `UUPSManaged`'s `_disableInitializers`) and
    every clone **implementation template** (`_disableInitializers` in their constructors / `initializer`
    guards) can never be initialized and hijacked. (FR-006)
  - **One-time initialize**: factory constructor → `initialize(admin, sanctionsGuard_, …)` guarded by OZ
    `initializer`; `TOKEN_ISSUER_ROLE` admin wiring granted exactly once. Clones are initialized exactly once at
    creation. (FR-007)
  - **Non-brickable upgrade gate**: only the base's `_authorizeUpgrade onlyRole(UPGRADER_ROLE)` governs factory
    upgrades; issued tokens are immutable (open/1404) or upgraded only by their own owner via the T-REX design.
  - **CEI + reentrancy**: factory creation/admin paths follow checks-effects-interactions and use
    `ReentrancyGuardUpgradeable`; the archived factory's `nonReentrant` posture is preserved and modernized.
  - **Non-bypassable sanctions**: every token class screens sender/recipient via `SanctionsGuard` (open/1404 in
    the transfer hook; ERC-3643 as a compliance module), fail-closed; the issuer is screened at creation.
    (FR-021)
  - **Append-only storage**: factory state is append-only with a trailing `__gap`; `check:storage-layout`
    (OZ `validateUpgrade`) gates every factory upgrade. (FR-026)
  - **No re-rolled crypto**: the ERC-3643 identity/compliance/claim machinery is the **audited reference
    implementation**, used unforked. (Principle I, "secure patterns")
  - **Tooling**: Slither (clone/proxy/UUPS) + Medusa clean; OZ upgrade validation in CI; smart-contract
    security-agent review before merge; EthTrust-SL ≥ L2 with documented reasoning.
    **PASS (commitments are binding inputs to the design artifacts).**
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)**: Tests are written alongside each class:
  unit (each template + factory), integration (create → mint/pause → restricted-block-with-reason → permissioned
  identity/claim enforcement → freeze/forced-transfer/recovery → ownership transfer), fork (T-REX suite +
  identity), and a factory upgrade-lifecycle suite. Both authorized-success and unauthorized-rejection paths are
  tested for every admin action (SC-004). **PASS.**
- **III. Honest State, No Mocks/Placeholders**: Creation and admin are real on-chain transactions; the UI never
  shows a token as finalized before confirmation and leaves no phantom entries on revert/reject (FR-006/FR-024).
  The archived mock-only UI is **not** carried forward. Token data is network-scoped and never leaks across
  networks; unsupported networks disable the feature truthfully (FR-023). The archived "list on DEX" placeholder
  is explicitly **out of scope** (no stubbed feature ships). Addresses/ABIs come only from synced artifacts. **PASS.**
- **IV. Fail Loudly in CI**: New per-class test suites, the factory upgrade-lifecycle suite, `check:storage-layout`,
  Slither, and Medusa all fail the pipeline on error; no `continue-on-error` on test/lint/build/security. **PASS.**
- **V. Accessible, Consistent Frontend**: The rebuilt token module meets WCAG 2.1 AA (axe/Lighthouse in CI);
  ESLint errors block the build; the wizard/list/admin surfaces consume contract addresses and ABIs only from
  `sync:frontend-contracts`, never hand-copied. **PASS.**

**New core technology justification**: The ERC-3643/ONCHAINID suite is a new core dependency. Justified in
Complexity Tracking — re-rolling on-chain identity, claim verification, and modular compliance would create a
large, high-risk, unaudited security surface in direct tension with Principle I; the canonical audited reference
implementation is the responsible choice and is the de-facto standard the spec names ("T-REX").

**Result**: All gates pass with the explicit Principle I commitments above. The single justified deviation
(vendored T-REX/ONCHAINID dependency) is recorded in Complexity Tracking.

*Post-Phase 1 re-check*: The design keeps exactly one upgradeable, state-bearing platform contract
(`TokenFactory`) on the established UUPS base; issued tokens are immutable clones (open/1404) or standard T-REX
proxies; sanctions screening is non-bypassable across all classes; storage is append-only and CI-gated; no
re-rolled security primitives. The new dependency remains the only deviation, justified below. **Still PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/028-token-mint/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — token-class delivery decisions, T-REX vs build, auth/sanctions/upgrade model
├── data-model.md        # Phase 1 — Token registry entity, per-class config, identity/compliance entities, state
├── quickstart.md        # Phase 1 — deploy factory+templates+T-REX → create each class → administer → validate
├── contracts/           # Phase 1 — interface/behavior contracts
│   ├── token-factory.md            # TokenFactory: roles, create* entrypoints, registry views, events, upgrade
│   ├── open-tokens.md              # ERC-20/721 basic·burnable·pausable templates + sanctions transfer hook
│   ├── erc1404-restricted.md       # detectTransferRestriction/messageForTransferRestriction + policy admin
│   └── erc3643-trex.md             # T-REX/ONCHAINID wiring, agent/owner admin, SanctionsGuard compliance module
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── upgradeable/
│   └── UUPSManaged.sol                 # REUSE (no change): shared UUPS+AccessControl base from 025
├── access/
│   └── SanctionsGuard.sol              # REUSE (no change): consulted by tokens + factory; wrapped as 3643 module
└── tokens/                             # NEW package
    ├── TokenFactory.sol                # NEW: UUPS authority/registry; TOKEN_ISSUER_ROLE; create*; sanctions-screen issuer
    ├── interfaces/
    │   ├── ITokenFactory.sol           # NEW: factory create/registry surface + events
    │   └── IERC1404.sol                # NEW: Simple Restricted Token interface (detect/message)
    ├── templates/
    │   ├── OpenERC20.sol               # NEW: basic/burnable/pausable ERC-20 clone template + sanctions hook
    │   ├── OpenERC721.sol              # NEW: basic/burnable ERC-721 clone template + sanctions hook
    │   └── RestrictedERC20.sol         # NEW: ERC-1404 template (policy: eligibility + freeze + sanctions)
    └── compliance/
        └── SanctionsComplianceModule.sol  # NEW: ERC-3643 compliance module delegating to SanctionsGuard

# T-REX / ERC-3643: vendored audited suite (deployed, not re-implemented)
#   @tokenysolutions/t-rex + @onchain-id/solidity — wired via deploy scripts; per-token suite deployment.

test/
├── tokens/
│   ├── TokenFactory.test.js            # NEW: issuance auth, sanctions-screened creation, registry, network scope
│   ├── OpenERC20.test.js               # NEW: create/mint/pause/burn + sanctions block (both paths)
│   ├── OpenERC721.test.js              # NEW: create/mint/burn + sanctions block
│   ├── RestrictedERC20.test.js         # NEW: detect==transfer agreement, human-readable reason, policy admin
│   └── erc3643/                        # NEW: identity/claim enforcement, freeze, forced transfer, recovery, mint/burn, pause
├── integration/tokens/                 # NEW: full create→administer lifecycle per class (+ sanctioned-actor)
├── fork/                               # ADD: T-REX suite + ONCHAINID interaction on fork
└── upgradeable/
    └── TokenFactory.upgrade.test.js    # NEW: deploy → upgrade → state-preserved → auth → re-init → storage-incompat

scripts/deploy/
├── lib/upgradeable.js                  # REUSE (no change): factory proxy/upgrade tooling from 025
├── check-storage-layout.js             # EDIT: add { name: "TokenFactory", deploymentsKey: "tokenFactory" }
├── deploy.js                           # EDIT: deploy implementation templates + SanctionsComplianceModule;
│                                       #       deploy T-REX suite; deploy TokenFactory proxy+impl; wire SanctionsGuard
└── verify.js                           # EDIT: verify factory impl/proxy, templates, and suite contracts

deployments/*.json                      # EDIT: record tokenFactory (proxy) + tokenFactoryImpl + template + suite addresses
subgraph/                               # EDIT: index TokenFactory.TokenCreated for network-scoped discovery
frontend/src/                           # EDIT: rebuild token module (wizard + list + per-standard admin), real Web3 only
```

**Structure Decision**: Web3 monorepo. The feature introduces one new contract package (`contracts/tokens/`)
with a single upgradeable authority (`TokenFactory`, on the established `UUPSManaged` base) plus immutable clone
templates, and vendors the audited ERC-3643 suite for the permissioned class. It reuses `UUPSManaged`,
`SanctionsGuard`, `lib/upgradeable.js`, and `check:storage-layout` rather than re-rolling auth, screening, or
proxy machinery. All frontend ABIs/addresses arrive via `sync:frontend-contracts` (Principle V).

## Complexity Tracking

> Filled because the Constitution Check records one justified new-core-technology deviation.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| New core dependency: ERC-3643 reference suite (`@tokenysolutions/t-rex`) + ONCHAINID (`@onchain-id/solidity`) | The spec mandates T-REX/ERC-3643 permissioned security tokens (User Story 4, FR-005/FR-011–017): on-chain identity registry, verified claims from trusted issuers, modular compliance, and agent/owner administration. These are the canonical, audited implementations of exactly that standard. | Hand-rolling an identity registry, claim-verification, trusted-issuer, and modular-compliance framework would create a large, novel, unaudited security surface handling regulated-asset transfers — a direct conflict with Principle I ("secure patterns", "no new high/critical findings"). Vendoring the audited reference is the lower-risk, standard-conformant path. Scoping T-REX out entirely was rejected because it is an explicit, central requirement of this feature. |
