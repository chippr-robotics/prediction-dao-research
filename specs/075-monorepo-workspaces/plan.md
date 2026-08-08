# Implementation Plan: Monorepo Workspaces, Packages, and a Declared Build-Target Graph

**Branch**: `075-monorepo-workspaces` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/075-monorepo-workspaces/spec.md`

## Summary

The repository is a de-facto monorepo with no workspace definition: six code units, four
independent lockfiles, two units with no lockfile, and no declaration of how any of it relates.
The resulting defect is that build inputs are not fully declared, so outputs are not reproducible
— against deployed bytecode for upgradeable contracts holding escrowed funds on seven chains and
third-party packages whose bytes are committed on-chain.

The approach: **npm workspaces** (one root lockfile) for the dependency graph, **three real shared
packages** for the code that is currently hand-synced across boundaries, and **Turborepo 2.10.8**
as a thin task-graph runner over the npm scripts that already exist. Bazel was evaluated in depth
and rejected — see [research.md](./research.md) R1.

The work ships in **seven phases, ordered by risk rather than by structure**. The two
highest-priority phases contain no structural change at all: Phase 1 declares the build inputs
(the compiler target of 116 of 120 contracts is currently set by a floating third-party default),
and Phase 2 repairs a merge gate that is structurally incapable of failing. Both must land before
any restructuring, because every later phase is verified *by* the pipeline.

## Technical Context

**Language/Version**: JavaScript (ESM, Node ≥ 22 — measured toolchain: Node 24.9.0, npm 11.6.0);
Solidity 0.8.24 (116 contracts) and 0.8.23 (4 contracts); AssemblyScript (subgraph mappings)

**Primary Dependencies**: Hardhat ^2.28.2 (contracts), Vite 7 + React 19 (frontend), Vitest
(frontend + gateway tests), Express (services), `@graphprotocol/graph-cli` 0.80.0 (subgraph).
**New**: `turbo` 2.10.8, `eslint-plugin-boundaries`

**Storage**: N/A — no application datastore. Build-relevant persistent state: `deployments/*.json`
(source of truth for addresses), `.openzeppelin/*.json` (upgrade-safety manifests, irreproducible),
`cache/validations.json` (1.6 MB, an *input* to the storage-layout gate)

**Testing**: Hardhat/Mocha (contracts, 98 files), Vitest (frontend ~560 files, relay-gateway),
Cypress (e2e), Matchstick (subgraph, Docker-only on this host), Slither/Medusa (security)

**Target Platform**: CI runners (ubuntu-latest) + local Linux dev; deployed artifacts are EVM
bytecode (7 chains) and static SPA/container images

**Project Type**: Monorepo — contracts + web frontend + two Node services + subgraph + build tooling

**Performance Goals**: A documentation-only change triggers zero build/test jobs (SC-006); each
workflow runs once per event (SC-005); repeated `hardhat compile` passes per commit collapse to one

**Constraints**: `contracts/` is one compilation unit and cannot be split (research R2); npm
hoisting can change bytes committed on-chain (R5); Turborepo never sandboxes, so an undeclared
input is a wrong answer rather than an error (R8); the full frontend suite OOMs locally (R10);
no application backend may be introduced (`CLAUDE.md`)

**Scale/Scope**: 3,468 tracked files; 120 `.sol`, ~1,765 JS/JSX, 6 → 9 workspace members;
9 CI workflows; ~27 `npm ci` call sites

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Initial evaluation

| Principle | Status | Reasoning |
|---|---|---|
| **I. Security-First Smart Contracts** | ✅ Pass, with a gate | No contract *logic* changes. Phase 1 changes one compiler setting, which is byte-neutral today (all 30 build-info records already report `paris`) and is **gated on a byte-for-byte bytecode diff** (FR-005) that blocks the change on any difference. No Slither/Medusa surface changes. A security review is still required because `contracts/` files are touched. |
| **II. Test-First and Comprehensive Coverage** | ✅ Pass — strengthened | The feature *adds* gates: a compiler-target test (FR-002), an EIP-712 typehash parity test (FR-026), an ABI parity gate (FR-032), a byte-reproducibility gate (FR-020), boundary enforcement (FR-044). `.solcover.js`'s instrumentation unit is explicitly preserved (R2). |
| **III. Honest State, No Mocks or Placeholders** | ✅ Pass — strengthened | FR-019 requires the mini-app baseline to record *whether* HEAD reproduces the published hashes rather than assume it; R12 lists unknowns as unknowns. No shipped path gains a mock. |
| **IV. Fail Loudly in CI** | ✅ Pass — **repairs live violations** | The repo currently violates this: the e2e gate sets `continue-on-error: true` **and** greps for a token its reporter never emits, and the Slither step ends in `\|\| true`. FR-007/FR-008/FR-011 remove both. Phase 2 exists for this. |
| **V. Accessible, Consistent Frontend** | ✅ Pass — **repairs a live violation** | Principle V requires that "contract addresses, ABIs, and network config consumed by the frontend come from the generated sync artifacts — never hand-copied". 47 `.js` + 10 `.json` ABIs are hand-maintained with no generator, and one subgraph copy has already drifted (81 vs 88 entries). FR-030–FR-034 make them generated. No UI change, so no new a11y surface. |
| **Tech stack — new core technology** | ⚠️ **Requires justification** | Turborepo and `eslint-plugin-boundaries` are new. See Complexity Tracking. |
| **Key management** | ✅ Pass | No key handling changes. Consolidating the three duplicated keystore-decryption copies is explicitly **out of scope** — it is a real finding but must not ride a build change. |
| **Archived code** | ✅ Pass — mechanised | `contracts-archive/`, `test-archive/` stay reference-only and excluded; the constitution's prose rule gains a CI check. |
| **Deployments source of truth** | ✅ Pass, with care | `deployments/` stays authoritative. R8/FR-039 require the storage-layout gate to be non-cacheable precisely because it reads this irreproducible state. |
| **Simplicity (YAGNI)** | ⚠️ Tension, resolved | The simplest option (targeted fixes, no framework) scored highest in isolation but declines to deliver workspaces/packages/targets — the actual request. Resolution: its six fixes **are** Phases 1–2; the framework is added only after they land, and Bazel's far larger complexity is rejected outright. |

### Post-design re-evaluation

Re-checked after Phase 1 artifacts. **No new violations.** Two design decisions were changed by
the constitution check itself:

1. **Generated ABIs are committed** (research R12.2). Not committing them would mean a fresh clone
   could no longer build the frontend without a Solidity toolchain — a developer-experience
   regression the plan is not permitted to introduce. Committing them keeps Principle V satisfied
   (they are generated, and a parity gate proves currency) without breaking the loop.
2. **The frontend test target is sharded, not a single unfiltered run** (R10). Modelling it as one
   `vitest run` would make the canonical command the exact invocation that OOMs locally.

## Project Structure

### Documentation (this feature)

```text
specs/075-monorepo-workspaces/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — R1..R12, incl. the Bazel evaluation
├── data-model.md        # Phase 1 output — workspace/package/target entities
├── quickstart.md        # Phase 1 output — runnable validation scenarios
├── contracts/           # Phase 1 output — the target-graph and package contracts
│   ├── workspace-layout.md
│   ├── target-graph.md
│   └── shared-packages.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16 pass)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
# Workspace members (npm `workspaces`) — real names per research R11
package.json                     # root: + "private", + "workspaces", + "engines"; ONE lockfile
package-lock.json                # the single dependency record (4 others deleted)
turbo.json                       # NEW — the target graph

contracts/                       # ONE compilation unit, ONE target (research R2) — not split
test/                            # + test/intent/TypehashParity.test.js (NEW, FR-026)
                                 # + test/config/CompilerTargets.test.js (NEW, FR-002)

packages/                        # NEW — extracted shared code
├── intent-types/                # @fairwins/intent-types — EIP-712 tables + EIP-3009 (FR-024/025)
└── abi/                         # @fairwins/abi — GENERATED from artifacts/, committed (FR-030)

frontend/                        # workspace `frontend`
├── src/lib/relay/intentTypes.js #   -> re-export + stablecoin adapter only
├── src/lib/pools/gasless.js     #   -> re-export RECEIVE_WITH_AUTHORIZATION_TYPES
├── src/abis/                    #   -> REMOVED; consumers read @fairwins/abi
├── eslint.config.js             #   -> narrow `ignores`, add eslint-plugin-boundaries (R7)
├── vitest projects              #   -> node/jsdom split (R10)
└── miniapps/
    ├── token-mint/package.json  # NEW manifest (FR-023 version)
    └── clearpath/package.json   # NEW manifest

services/
├── relay-gateway/               # workspace `fairwins-relay-gateway`
│   └── src/intent/intentTypes.js#   -> re-export + signing helpers; + InvalidateNonce (FR-028)
└── relayer/                     # workspace `fairwins-pool-relayer` (lockfile or removal, FR-014)

subgraph/                        # workspace `prediction-dao-research-subgraph`
└── abis/                        #   -> REMOVED; subgraph.yaml reads @fairwins/abi (FR-034)

tools/miniapp-build/             # workspace `@fairwins/miniapp-build` — consumed BY NAME
scripts/codegen/emit-abis.js     # NEW — the ABI generator + `--check` gate

.github/workflows/               # duplicate triggers removed, concurrency added, gates un-muted
```

**Structure Decision**: A **flat workspace over the existing directories**, not a `packages/`-only
layout. Three reasons: (1) moving `frontend/`, `services/*` or `subgraph/` would touch every
Dockerfile, CI path filter, and deploy script for zero correctness gain; (2) npm 11 accepts nested
globs, so `frontend/miniapps/*` becomes a workspace member without relocating anything; (3) only
genuinely *new* shared code lands under `packages/`. `contracts/` is deliberately **not** a
workspace member — it is not an npm package, it is the root project's single compilation unit.

## Phased Delivery

Ordered by risk. Phases 1–2 contain **no structural change** and are independently valuable.

| Phase | Goal | Stories | Risk |
|---|---|---|---|
| **1. Declare the toolchain** | Pin the compiler target; declare undeclared deps; make the storage-layout gate fail when it checks nothing | US1 | **Low** — gated on a bytecode byte-diff that blocks on any change |
| **2. Make CI tell the truth** | Un-mute the e2e gate and Slither; delete duplicate triggers; add concurrency groups | US2 | **Low in substance, high in perception** — the pipeline goes red by design |
| **3. Workspaces + one lockfile** | Single dependency record; mini-app manifests; boundary lint; fix the hardcoded bin paths | US3, US7 | **Medium** — the only phase that can silently change on-chain-committed bytes (R5) |
| **4. `@fairwins/intent-types`** | Collapse the 3-way (really 4-table) EIP-712 duplication; add the typehash parity test; add `InvalidateNonce` | US4 | **Medium** — touches live signing paths on both rails |
| **5. `@fairwins/abi`** | Generate ABIs from compilation output; parity gate; retire the drifted subgraph copies | US5 | **Medium risk, high effort** — the risk is adjudication error, not mechanism |
| **6. `turbo.json`** | The declared target graph; collapse repeated compiles | US6 | **Medium** — an undeclared input is a wrong cache hit, not an error |
| **7. Archive consolidation** | Mechanise the archive rule; reduce surface | — | **Low** — deletions plus one CI grep |

**Phase 3 is blocking-gated** on three checks, all of which must pass before merge: (a) `artifacts/`
bytecode byte-identical to the Phase 1 snapshot; (b) the fixture regenerate produces an empty git
diff — **with a new `ethers`-importing fixture added first**, because the existing one deliberately
excludes `ethers` (R5); (c) both real mini-app packages rebuild to identical bytes **before vs.
after on the same tree** (not "matches on chain" — no in-repo baseline exists; R5).

## Complexity Tracking

> Filled because the Constitution Check flags a new core technology.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **New core technology: Turborepo 2.10.8** | The spec requires targets with declared inputs/outputs that re-run only when inputs change (FR-036–FR-041). Nothing in the current stack expresses a task graph; CI is a flat fan-out where every job runs on every change and the contracts are compiled repeatedly per commit with no sharing. | **Plain npm scripts + `needs:`**: expresses ordering but not *inputs*, so it cannot skip unchanged work — FR-037 unsatisfiable. **Nx**: heavier, and its differentiator (`@nx/enforce-module-boundaries`) is obtained directly from `eslint-plugin-boundaries`; its graph inference targets TypeScript and infers none of this repo's real edges (Solidity, filesystem paths, duplicated source). **Bazel**: evaluated at length (research R1) — no maintained Solidity ruleset, mandatory pnpm migration that breaks shipped code, ESM sandbox gap open since 2022, 4–7 engineer-months plus 0.25–0.5 FTE forever. Turborepo is a JSON pipeline over scripts that already exist; it adds one dev dependency and no new toolchain. |
| ~~**New dev dependency: `eslint-plugin-boundaries`**~~ — **NOT ADOPTED** | FR-044–FR-046 require the package/host boundary to be machine-enforced in both directions, including by package name and in test code. | **Reversed during implementation.** The justification rested on a misreading: `frontend/eslint.config.js:13`'s `ignores` only excludes those paths from the FIRST config block — a dedicated `src/test/**` block lints them (measured: 474 test files covered). And `packageBoundary.test.js` walks the filesystem and reads files as TEXT, so it does not depend on module resolution and a scoped run still catches everything. Extending it to the by-name direction satisfies FR-044–FR-046 outright, so the plugin would add a dependency and a second implementation for no additional enforcement. Constitution "Simplicity": added complexity must earn its place, and this did not. |
| **A `packages/` directory (new top-level)** | Shared code must live somewhere both a Vite app and a Node service can resolve. Today the gateway *cannot* import frontend code at all: `frontend/src` has 2,966 extensionless imports against the gateway's 0 (R6). That is the mechanical cause of the duplication. | **Keep duplicating and add a parity test**: a test detects drift but does not prevent it, and the drift has already occurred (`InvalidateNonce` missing from the gateway). **Publish to a registry**: adds release surface to a repo with no external consumers and zero published units. |

### Accepted, deliberately unfixed

Recorded so they are not mistaken for oversights, per constitution governance:

- **`contracts/` stays one target.** Three independent constraints (R2). The request's "packages
  and targets" is met for Solidity as one *well-declared* target, and this is stated plainly rather
  than papered over.
- **Turborepo caching is unsound with respect to `.env`.** `hardhat.config.js` loads dotenv inside
  the task process, after the cache key is computed (R8). Mitigated by shipping Phase 6 last, with
  caching disabled during an observation period, and by declaring the limitation in the docs
  (FR-042). No remote cache in this feature.
- **Release identity is out of scope.** Zero git tags across 2,374 commits, never-bumped versions,
  `:latest` in a production manifest. Closest to the literal phrase "adequate version control", but
  a policy change; folding it in makes this unshippable in phases.
- **Keystore-decryption duplication is out of scope.** Three independent copies for the key that
  admins every live contract. The most severe undeclared duplication found — and precisely why it
  must not ride along with a build-system change.
