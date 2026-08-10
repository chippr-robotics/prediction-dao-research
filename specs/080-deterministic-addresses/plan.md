# Implementation Plan: Deterministic, cohort-wide contract addresses

**Branch**: `079-hardhat-3-migration` *(carries both specs — see Structure Decision)* | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/080-deterministic-addresses/spec.md`

## Summary

Make a contract's address a function of *what it is* rather than of where and when it was deployed,
so a cohort of chains cannot drift out of sync without anyone noticing.

Three changes, in dependency order:

1. **Remove the source fingerprint from compiled output** (`metadata: { bytecodeHash: "none" }`).
   Measured: the appended block collapses 51 → 10 bytes, leaving only the compiler version, with
   runtime code byte-identical. Addresses stop moving when the source tree is reorganised.
2. **Route upgradeable contracts through CREATE2**, which today they are not — `upgrades.deployProxy`
   uses plain CREATE, and that covers most of the estate.
3. **Deploy and initialize atomically**, because step 2 requires taking init data out of the proxy
   constructor to get parity, and that is what opens a window for someone else to initialize first.

The constraint that shapes the design is not any of those: it is that **bypassing the upgrades plugin
would silently gut the storage-layout gate** protecting 26 live implementations (R2). Every
deterministic deployment must therefore record its layout explicitly, and coverage must be proven not
to drop.

## Technical Context

**Language/Version**: Solidity 0.8.24 and 0.8.23 (both profiles, both exact-pinned); Node.js/CommonJS

**Primary Dependencies**: Safe Singleton Factory `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`
(already the repository's CREATE2 deployer, verified live on Polygon 137 and Mordor 63, 69 bytes);
`@openzeppelin/hardhat-upgrades` 3.9.1 — specifically `validateImplementation` (already used),
`deployImplementation`, `forceImport`

**Storage**: `deployments/*.json` (155 addresses / 9 networks — format unchanged, FR-019);
`.openzeppelin/<network>.json` (layout manifest the gate depends on);
`specs/075-monorepo-workspaces/baseline-bytecode.json` (re-recorded once)

**Testing**: Hardhat contract suite; disposable local chains for deployment proof (FR-020 forbids
live deploys). Two disposable chains with *different transaction histories* are required to prove
parity is real rather than coincidental (SC-004)

**Target Platform**: 8 live EVM networks, read-only for this work

**Project Type**: Monorepo root workspace; contracts + deploy tooling

**Performance Goals**: None. This is a determinism feature; the only budget is that the contract
suite stays runnable.

**Constraints**: Deploys nothing to a live chain (FR-020/SC-006). Contracts holding live state cannot
move under any scheme. Changes to how contracts are configured require a security review (FR-021).

**Scale/Scope**: 96 bytecode-producing contracts (90 change on the 0.8.24 profile alone); 51 distinct
contracts across 8 networks, **48 present on some chains but not all**; 26 live upgradeable
implementations whose gate coverage must not drop

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Security-First Smart Contracts** (NON-NEGOTIABLE) | **PASS, conditional on review.** Two genuinely new surfaces: a deploy-and-init factory, and the separation of deployment from initialization. The separation is what creates an uninitialized-proxy window; the factory is what removes it (R3, R4). FR-021 requires a security review before the configuration changes merge, and it must specifically examine the factory's authority — a factory that can deploy *and* initialize on behalf of others is a privileged position, and the design phase must decide whether it is permissioned or permissionless. No existing contract's logic changes; the metadata change alters no executable code (SC-001). |
| **II. Test-First and Comprehensive Coverage** (NON-NEGOTIABLE) | **PASS.** Parity is proven by deploying to two disposable chains with *different histories* — a single-chain test would pass even if addresses still depended on nonce, so it would prove nothing. The window's absence is proven by attempting to interpose, not by inspection. |
| **III. Honest State, No Mocks in Shipped Paths** | **PASS, and this feature is largely about it.** The consistency report must classify every contract as consistent, inconsistent, or a recorded exception, with none unclassified (SC-008), and must report an unreachable chain as unreachable rather than as a contract being absent (FR-018) — an absent contract and an unknown one call for opposite actions. |
| **IV. Fail Loudly in CI** | **PASS.** Identifier collisions fail the build, not the deploy (R8). A deployment landing at an unexpected address fails loudly (FR-008). An occupied address is an incident, not a skip (FR-009). The deployment facility being absent on a chain is detected before deploying and never silently downgraded to a non-deterministic deploy (FR-010). |
| **V. Accessible, Consistent Frontend** | **N/A.** No frontend surface. Contract addresses reach the frontend through the existing generated sync artifacts, which are unaffected in format. |
| **Tech stack** | **PASS — no new core technology.** The CREATE2 deployer is already in use by ten contracts; this extends it rather than introducing it. |
| **Key management** | **PASS.** No change to the floppy keystore flow. The deploy-and-init factory removes a step from the operator's hands rather than adding one. |
| **Deployments** — "deterministic deployment scripts and recorded `deployments/` artifacts are the source of truth" | **STRENGTHENED — this feature exists to make the constitutional property true.** Today only 5 of 51 contracts are deterministic by design; 20 addresses coincide across chains but 15 of those are nonce coincidences that will break. Records keep their format (FR-019) and gain the ability to be checked against predictions. |

**No violations to justify.** Complexity Tracking is therefore empty, with one consequence recorded
below because it is a real cost even though it is not a constitutional violation.

### Recorded consequence (not a violation)

Adopting the metadata change moves the *future* addresses of the five contracts that are deterministic
today, away from the siblings they currently match (R5). Parity for those five gets worse before a
redeployment makes it better. This is inherent to the change, not a design choice, and is recorded so
it is not mistaken for a regression.

## Project Structure

### Documentation (this feature)

```text
specs/080-deterministic-addresses/
├── plan.md              # This file
├── research.md          # Phase 0 — R1..R9
├── data-model.md        # Phase 1 — what determines an address, and the exception register
├── quickstart.md        # Phase 1 — how to prove each property
├── contracts/
│   └── address-scheme.md    # The scheme's guarantees and its boundaries
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
hardhat.config.js
└── compilers[0.8.24].settings.metadata  + bytecodeHash: "none"      [Phase 1]
    compilers[0.8.23].settings.metadata  + bytecodeHash: "none"      [Phase 1]

contracts/
└── deploy/                              deploy-and-init factory (NEW)   [Phase 3]

scripts/deploy/
├── lib/
│   ├── constants.js                     SALT_PREFIXES + collision check [Phase 2]
│   ├── helpers.js                       deployDeterministic (exists)    [Phase 2]
│   └── upgradeable.js                   deployProxy -> deterministic +
│                                        forceImport so the gate keeps
│                                        its coverage (R2)               [Phase 3]
├── check-storage-layout.js              coverage must not drop          [Phase 3]
└── predict-addresses.js                 compute without a chain (NEW)   [Phase 2]

scripts/ops/
└── estate-consistency.js                the report (NEW)                [Phase 4]

test/config/CompilerTargets.test.js      + assert metadata setting pinned [Phase 1]
```

**Structure Decision**: Existing layout preserved; the only new contract is the deploy-and-init
factory. Deliberately **no file is moved** during this feature — the whole point is that moving files
stops mattering, and demonstrating that is easier if nothing moves while it is being established.

*Branch note*: this plan is being developed on `079-hardhat-3-migration` because spec 080 and the
re-sequencing of 079 are one logical change — 080 exists because 079's cost analysis surfaced it, and
079's requirements change as a result. Implementation phases below get their own branches.

## Implementation Phases

Ordered so that each phase is independently valuable and the risky ones come after the cheap ones
have de-risked them.

### Phase 1 — Path-independent bytecode

Add the metadata setting to both compiler profiles. Pin it in `CompilerTargets.test.js` alongside the
EVM-target pin, so it cannot be silently dropped. Re-record the compiled-output baseline once, with
the count and the reason.

**Verification**: executable code identical for all 96 contracts (SC-001); moving a source file
changes zero predicted addresses (SC-002). **This phase alone delivers spec 079's saving**, which is
why it is first.

### Phase 2 — Predict before deploying

Address prediction for every contract without contacting a chain, plus the identifier-collision check
that fails the build (R8, FR-011).

**Verification**: predictions match the addresses the existing ten CREATE2 contracts already occupy —
a free correctness check against reality, since those are already deployed deterministically.

### Phase 3 — Deterministic upgradeable deployment, atomically initialized

The factory contract, the change to the proxy deployment path, and `forceImport` so the layout
manifest is still written (R2).

**Verification**: deploy the full set to two disposable chains with *different histories* and confirm
identical addresses (SC-004); confirm no observable uninitialized state (SC-005); and confirm the
storage-layout gate's coverage count **does not drop** — the failure this phase is most likely to
cause and least likely to notice.

**Gate**: security review (FR-021) before merge, specifically on the factory's authority.

### Phase 4 — Make the drift visible

The estate consistency report: every contract classified, exceptions shown as exceptions, unreachable
chains shown as unreachable.

**Verification**: all 51 contracts classified, none unclassified (SC-008).

### Not in this feature

Bringing live chains into line. This plan establishes and proves the scheme; deploying the estate
under it is separate work, deliberately sequenced afterwards, and is what actually makes a cohort
consistent.

## Complexity Tracking

> No constitutional violations. See "Recorded consequence" above for the one real cost that is not a
> violation.
