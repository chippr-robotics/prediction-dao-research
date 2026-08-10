# Implementation Plan: Hardhat 3 toolchain migration

**Branch**: `079-hardhat-3-migration` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/079-hardhat-3-migration/spec.md`

## Summary

Move the contract toolchain from Hardhat 2.29.0 to Hardhat 3.12.0, preserving every safety property
that currently protects 26 live upgradeable implementations across 7 chains, and deploying nothing.

The migration *was* governed by one fact: Hardhat 3 changes the compiled output of all 96
bytecode-producing contracts, because it renames source units (`project/contracts/…`,
`npm/@chainlink/contracts@1.3.0/…`) and those names hash into the appended CBOR metadata block.

**Spec 080 is now sequenced ahead of this work and removes that fact** (Phase 0B). It takes the
source fingerprint out of compiled output entirely, so the rename has nothing left to change and this
migration becomes byte-neutral. The verification machinery for the byte change — a metadata-stripping
harness across 96 contracts, a deliberate baseline re-record, the deterministic-address consequence —
is retained in `research.md` and in the requirements because it is exactly what applies if 080 is
deferred, but with 080 in place it is vacuous rather than merely satisfied.

What remains as the dominant cost is unchanged, and is not Hardhat's API surface.

The dominant cost is not Hardhat's API changes. It is that Hardhat 3 requires an ESM repository root,
which is atomic across the 274 files that reach Hardhat. The approach is to make that flip
*non-atomic* by staging through explicit `.cjs` while still on Hardhat 2 — a route measured to work
(R1a) — so the toolchain swap itself lands as a small, closely reviewable change instead of a
21k-line one.

## Technical Context

**Language/Version**: Solidity 0.8.24 / 0.8.23 (unchanged, exact-pinned); Node.js ESM

**Primary Dependencies**: `hardhat` 3.12.0; `@openzeppelin/hardhat-upgrades` 4.1.0 (peer `^3.6.0`);
`@nomicfoundation/hardhat-ethers` 4.0.15, `-verify` 3.0.22, `-ignition` 3.1.8, `-network-helpers`
3.0.11, `-chai-matchers` 3.0.0, `-keystore` 3.0.12, `-toolbox-mocha-ethers` 3.0.7

**Removed**: `solidity-coverage`, `hardhat-gas-reporter`, `typechain` + `@typechain/hardhat` +
`@typechain/ethers-v6`, npm `solc`

**Storage**: `deployments/*.json` (recorded addresses, unchanged format);
`specs/075-monorepo-workspaces/baseline-bytecode.json` (compiled-output record, re-recorded once)

**Testing**: 101 contract test files / 21,248 LOC, Mocha; forking tests excluded from
disposable-chain verification

**Target Platform**: Node.js on Linux + CI runners; 7 live chains read-only

**Project Type**: Monorepo (npm workspaces, spec 075) — this feature touches the root workspace only

**Performance Goals**: Not a performance feature. The only budget that matters is that the full
non-forking contract suite stays runnable in CI.

**Constraints**: Deploys nothing (SC-006). `contracts/` is one compilation unit and cannot be
partitioned. Frontend `vitest run` unfiltered OOMs this environment, so no target may be modelled as
one unfiltered frontend run — the frontend and services are unaffected regardless (own module
config).

**Scale/Scope**: 96 bytecode-producing contracts; 274 files reaching Hardhat (97 test + 177 scripts);
333 root-scope `.js` files; 26 live implementations on 7 chains

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Security-First Smart Contracts** (NON-NEGOTIABLE) | **PASS with an explicit obligation.** No shipped contract's source changes. The only additions are test-only subclasses under the existing test-contract scope (R4), which are never deployed. The security-relevant property is FR-001 — that executable code is unchanged for all 96 contracts — and it is verified per contract, not sampled (R2). Slither/Medusa surface is unchanged because the contracts are unchanged; a re-run is still required to confirm the toolchain change did not alter what the analysers see. |
| **II. Test-First and Comprehensive Coverage** (NON-NEGOTIABLE) | **PASS.** The suite must reach at least its pre-migration passing count with zero failures (FR-007), and must be *proven* to still detect regressions rather than assumed to (FR-008) — the migration's specific hazard is tests that pass vacuously. Rewritten config guardrails are mutation-tested individually (R7). |
| **III. Honest State, No Mocks in Shipped Paths** | **PASS, and strengthened.** FR-005 exists because a gate was found reporting success on stale build output. Test-only wrapper contracts live in the test scope. FR-009 forbids the partial-migration failure mode where an unconverted file is silently skipped rather than failing. |
| **IV. Fail Loudly in CI** | **PASS.** No `continue-on-error` is introduced. Gates that cannot establish what they examined must fail rather than pass (FR-005). An unreachable chain is reported as unreachable, never counted as "no incompatibility found". |
| **V. Accessible, Consistent Frontend** | **N/A.** The frontend is untouched; the module-system change is confined to the repository root scope. |
| **Tech stack** — "introducing a new core technology requires justification" | **Justification required and given below.** |
| **Key management** | **Attention required.** The config's `require()` closure that must become `.cjs` (R1a) includes the floppy-key admin-key loader. Renaming touches the admin key path, so it is changed deliberately and reviewed, not swept up in a codemod. No key material is read, logged, or moved. |
| **Deployments** — "deterministic deployment scripts and recorded `deployments/` artifacts are the source of truth" | **RESOLVED by sequencing, not waived.** The original tension was that CREATE2 addresses derive from creation bytecode, which this migration changes. Spec 080 lands first and removes the source fingerprint from compiled output, so the rename moves no address at all — the constitutional property is *strengthened* rather than weakened, because addresses stop depending on where source files live. The enumeration in `data-model.md` remains valuable regardless: it records which contracts are deterministic and by which mechanism. If 080 is deferred, the original tension returns in full and R6/FR-006 apply as written. |

### New core technology justification

Hardhat 3 is a **major version of the stack the constitution already names** ("Solidity + Hardhat for
contracts"), not a new technology. It is nonetheless justified here because the change is large
enough to deserve one:

- **It removes a class of defect rather than adding capability.** The npm `solc` package currently
  decides compiled bytecode on an environment-dependent path (`FORCE_SOLCJS`/Codespaces), and the
  byte gate provably does not cover it (#1084). Hardhat 3's `preferWasm` retires that path entirely.
- **It resolves a dependency deadlock, not a preference.** `chai` cannot move because a plugin peers
  on the old major (#1053); the plugin cannot move because the framework cannot. Every parked item
  traces to the framework version.
- **It deletes more than it adds**: coverage, gas reporting, and Solidity tests become built-in,
  removing three dependencies and their transitive trees.
- **The alternative was evaluated and rejected on evidence.** Foundry would supply the same testing
  benefit but would require rebuilding the upgrade-safety gate that protects 26 live implementations,
  rewriting 21,248 LOC of tests, and would not address the deploy/operations layer at all. Hardhat 3
  ships Foundry-compatible Solidity tests, so new tests written in that form remain portable — the
  option is preserved rather than foreclosed.

## Project Structure

### Documentation (this feature)

```text
specs/079-hardhat-3-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output — R1..R9, with R1a measured
├── data-model.md        # Phase 1 output — the records this migration must not corrupt
├── quickstart.md        # Phase 1 output — how to verify each phase
├── contracts/
│   └── migration-invariants.md   # The properties every phase must preserve
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
hardhat.config.js            → hardhat.config.ts|js (ESM, build profiles)   [Phase 4]
package.json                 "type": "module"                               [Phase 1]

contracts/                   UNCHANGED (one compilation unit, not partitioned)
└── test/                    + test-only subclasses for npm contracts (R4)   [Phase 3]

test/                        97 files reaching Hardhat                       [Phase 3]
├── config/                  CompilerTargets, CiGates — guardrails, rewritten [Phase 4]
└── helpers/                 + shared network-connection helper              [Phase 3]

scripts/
├── deploy/
│   ├── check-storage-layout.js   the P1 blocker — gate port                 [Phase 2]
│   └── lib/                      deterministic-address inventory (R6)       [Phase 2]
├── codegen/
│   └── bytecode-digest.js        freshness fix, #1090 (FR-005)              [Phase 2]
└── operations/floppy-key/        config require-closure → .cjs, careful     [Phase 1]

frontend/, services/, subgraph/, packages/, tools/   UNAFFECTED (own module config)
```

**Structure Decision**: Single root workspace, existing layout preserved. The migration deliberately
moves no contract, test, or script between directories — the only structural change is file
*extension* during staging. Keeping paths stable is what allows the compiled-output comparison (R2)
to attribute any change to the toolchain rather than to relocation.

## Implementation Phases

Ordered by **risk retired per change**, not by structure. Every phase must leave `main` with gates
that run and give an honest verdict (FR-019), and each is independently mergeable.

### Phase 0 — Prerequisites (not part of this feature)

**A. Removal of `@uma/core` (PR #1089).** It nests OpenZeppelin 4.9.6 against a root of 5.4.0;
Hardhat 3 resolves per package and the two `IERC20` declarations collide, failing the first compile
outright. Nothing in this plan can begin until it lands.

**B. Spec 080 — deterministic addresses — lands FIRST.** *(Re-sequenced 2026-08-09.)*

This is not a dependency of convenience; it removes most of this plan's risk and roughly half its
verification work. Hardhat 3 changes the compiled output of all 96 contracts *for exactly one
reason*: it renames source units, and those names are hashed into the appended metadata block. Spec
080 removes the source fingerprint from that block entirely — measured, the block collapses from 51
bytes to 10 and the remainder is the compiler version alone:

```
a1 64 "solc" 43 000818        // no ipfs hash, no source reference
```

Once compiled output no longer depends on source names, **the rename has nothing to change**.

What that deletes from this plan, if 080 lands first:

| Previously required | After 080 |
|---|---|
| Metadata-stripping harness across all 96 contracts (R2) | **Not needed** — bytecode is expected to be byte-identical, so the existing gate suffices unchanged |
| Deliberate re-record of the compiled-output baseline (FR-002) | **Not needed** — nothing to re-record |
| Capturing pre-migration artifacts to compare against | **Not needed** |
| FR-006 / R6 deterministic-address consequence | **Dissolved** — addresses stop depending on source names, which is the whole point of 080 |

**Do not begin Phase 4 before 080 has landed.** Doing so pays the same bytecode change twice: once
for the source-unit rename, then again when the metadata setting changes. Phases 1–3 carry no
bytecode change and may proceed in parallel with 080.

If 080 is abandoned or deferred, this plan reverts to its original form — R2, R6, and the baseline
re-record all return. They are retained in `research.md` rather than deleted for that reason.

### Phase 1 — Make the module flip non-atomic *(still on Hardhat 2)*

Declare the root ESM and rename the currently-CommonJS root-scope files to `.cjs`, including the
config and its `require()` closure, adding explicit extensions to every affected specifier (R1a).

**Verification**: the full existing suite passes unchanged, on Hardhat 2. Behaviour must not move —
this phase is mechanical by construction, and anything that is not mechanical is a finding.

**Risk**: the closure includes the admin-key loader. Reviewed by hand.

### Phase 2 — Make the gates trustworthy *(still on Hardhat 2)*

Two changes that are correct independently of the migration and must precede it:

- Fix the digest gate's freshness (FR-005 / #1090) so it cannot report on stale build output.
- Enumerate every deterministically-addressed contract and record the consequence (FR-006 / R6).

**Verification**: the freshness fix is mutation-tested — break the compile, confirm the gate now
fails where it previously reported OK.

### Phase 3 — Convert to ESM in reviewable batches *(still on Hardhat 2)*

`.cjs` → ESM, batch by batch, tests and scripts as **separate** changes (FR-018). Introduce the
shared network-connection helper here so the eventual Hardhat 3 API change has one place to land.
Add the test-only subclasses for npm contracts (R4). Apply the five mechanical classes the spike
found only by *running* the tests, not by compiling them.

**Verification**: each batch passes the suite when it lands. Scripts get disposable-chain execution
(FR-011) — compiling is not evidence.

### Phase 4 — Swap the toolchain

Dependencies, config rewritten to build profiles, storage-layout gate ported, `FORCE_SOLCJS` deleted,
default-network chain id pinned explicitly (R5), config guardrails rewritten and mutation-tested
(R7), redundant tooling removed (R8).

**Verification** — this is the phase that carries the migration's whole safety claim:

1. Metadata-stripped executable code identical for **all 96** contracts (FR-001 / SC-001).
2. Storage-layout gate reaches ≥26 implementations on ≥7 chains and passes (SC-002), **and** rejects
   a deliberately corrupted layout (SC-003).
3. Suite ≥ pre-migration passing count, zero failures (SC-004).
4. Compiled-output record re-recorded once, deliberately, with the consequence stated (FR-002).

### Phase 5 — Collect the unblocked work

`chai` 4→6 (#1053) and the `.reverted` → `.revert(ethers)` conversion (R9). Confirm items that remain
parked (#1086, #1051) and record why they were not unblocked by this.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| ~~Determinism of CREATE2 addresses is weakened~~ — **no longer a violation** | Cross-chain address parity was confirmed load-bearing (48 of 51 contracts are already inconsistent across chains), which is what promoted the parked option into spec 080. With 080 sequenced first, this migration moves no address. | The alternative — accepting the weakening and requiring sign-off per deploy — was the original plan and is retained in `research.md` as the fallback if 080 is deferred. It was rejected as the primary because it makes every future deploy carry a manual check that a build setting can remove permanently. |
| A mass file-extension rename (Phase 1) touching the admin-key loading path | Hardhat 3's ESM requirement is atomic across 274 files; staging through `.cjs` is the only measured way to make the flip reviewable and keep `main` green throughout (R1, R1a). | A single big-bang change was rejected as unreviewable (FR-018). A long-lived integration branch was rejected as primary because it defeats FR-019 for `main` and would conflict with every concurrent change to `scripts/` and `test/`; it is held as the fallback if Phase 3 destabilises. |
