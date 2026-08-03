# Phase 1 Data Model: Workspace, Package, Target, Baseline

**Feature**: 075-monorepo-workspaces | **Date**: 2026-08-02

This feature's "data" is build metadata, not runtime records. The entities below are the things
that gain a declared identity, and the rules that must hold for each.

---

## Entity: Workspace

The repository as a single dependency graph.

| Field | Value | Source of truth |
|---|---|---|
| `members` | 9 paths (see [contracts/workspace-layout.md](./contracts/workspace-layout.md)) | root `package.json` → `workspaces` |
| `dependencyRecord` | exactly one `package-lock.json` at the root | filesystem |
| `runtime` | `node >= 22` | root `package.json` → `engines`, `.nvmrc` |
| `private` | `true` | root `package.json` — **currently absent** (research R11) |

**Validation rules**

- **W1**: Exactly one `package-lock.json` exists in the tree (excluding `node_modules/`). Four are
  deleted; none is added. *(FR-013, SC-008)*
- **W2**: Every directory containing a `package.json` outside `node_modules/` is either a declared
  member or is deliberately removed with its removal stated. *(FR-014)*
- **W3**: No member declares a dependency range that resolves to more than one installed major of
  the same package without an explicit, scoped override. *(FR-015)*
- **W4**: `npm ci --workspace <name> --include-workspace-root=false` succeeds for every member.
  *(FR-016)*

**Verified behaviour** (npm 11.6.0, measured in a scratch workspace):

- Nested globs are accepted — `app/sub/*` resolved both members. `frontend/miniapps/*` therefore
  becomes a member **with no directory moves**.
- Executables hoist to the **root** `node_modules/.bin`; a child workspace gets **no local
  `.bin` at all**. Any tooling that hardcodes a child bin path breaks immediately. *(FR-018)*
- Every member is symlinked into the root `node_modules` **under its package name**, making it
  resolvable by name from anywhere in the tree. This creates a *new* boundary-leak direction.
  *(FR-046)*

**State transition** — the workspace has exactly one migration, and it is gated:

```
[4 lockfiles + 2 unlocked units]
        │  prerequisite: drop 4 unused frontend deps (separate commit, research R5)
        │  prerequisite: Phase-1 bytecode snapshot recorded
        │  prerequisite: mini-app baseline recorded (FR-019)
        ▼
[1 lockfile, 9 members]  ── gate ──▶ bytecode identical
                         ── gate ──▶ mini-app bytes identical (before vs. after, same tree)
                         ── gate ──▶ graph codegen + build succeed under merged tree
```

---

## Entity: Package

A code unit with a declared identity, dependencies, and boundary. Three kinds, and the kind
determines which rules apply.

| Kind | Members | Distinguishing rule |
|---|---|---|
| **host** | `frontend` | May not import a `package` in either direction *(FR-044)* |
| **package** (untrusted, on-chain-committed) | `frontend/miniapps/token-mint`, `frontend/miniapps/clearpath` | Content hash is committed on-chain; bytes are a correctness property *(FR-019–FR-023)* |
| **shared** (internal) | `@fairwins/intent-types`, `@fairwins/abi`, `@fairwins/miniapp-build` | Must be resolvable by **both** Vite and plain Node *(research R6)* |
| **service / indexer** | `fairwins-relay-gateway`, `fairwins-pool-relayer`, `prediction-dao-research-subgraph` | Node-native; consume shared packages by name |

**Validation rules**

- **P1**: A `shared` package MUST use extensioned relative imports and declare an `exports` map, so
  plain Node can resolve it. `frontend/src` has 2,966 extensionless imports; the gateway has 0 —
  this asymmetry is the mechanical cause of the duplication being removed. *(research R6)*
- **P2**: A `package` MUST declare a `version`, and its manifest version MUST change whenever its
  built content hash changes. *(FR-023)*
- **P3**: Boundary enforcement is a **lint rule plus the existing Vitest guard** — never the
  manifest. Relative imports never consult `package.json`, and workspaces hoist bare specifiers.
  *(FR-047, research R7)*
- **P4**: `frontend/eslint.config.js` currently ignores `src/test/**`, where **3 of the 4** real
  boundary escapes live. The ignore MUST be narrowed or enforcement covers less than the guard it
  replaces. *(FR-045)*
- **P5**: A `shared` package MUST NOT import from `frontend/src`, `services/*/src`, or reach a Vite
  virtual module. `virtual:tenant` is the specific hazard — it is why frontend *config* is not
  extracted in this feature.

---

## Entity: Target

A named unit of work with declared inputs and outputs. Full definitions in
[contracts/target-graph.md](./contracts/target-graph.md).

| Field | Meaning |
|---|---|
| `id` | `<workspace>#<task>` or `//:<task>` for root tasks |
| `runs` | the existing npm script — targets wrap scripts, they do not replace them |
| `dependsOn` | upstream targets |
| `inputs` | every file **and environment value** that changes the result |
| `outputs` | files produced |
| `cacheable` | `false` for anything reading irreproducible state |

**Validation rules**

- **T1**: A target MUST re-run when any declared input changes and MUST NOT when none has.
  *(FR-037)*
- **T2**: Environment values affecting the result MUST be declared. `AMOY_RPC_URL` silently
  switches the default test chain from a clean 1337 to an Amoy fork. *(FR-038)*
- **T3**: **Undeclared inputs are silent.** Turborepo does not sandbox, so a missing input yields a
  *wrong cache hit*, not an error. This is the single most important rule in the model.
  *(research R8)*
- **T4**: Targets reading irreproducible state MUST be `cacheable: false` — specifically
  `check-storage-layout` (`.openzeppelin/`, `deployments/`, and a warm writable
  `cache/validations.json` that `@openzeppelin/upgrades-core` takes a lockfile on). *(FR-039)*
- **T5**: `cache/**` MUST be declared an **output** of `compile` so `validations.json` stops being
  treated as discardable.
- **T6**: `coverage` MUST be an independent root, not a dependent of `compile` — `.solcover.js`
  sets `configureYulOptimizer`, so it cannot share the artifact cache. *(FR-040)*
- **T7**: `frontend#test` MUST NOT be a single unfiltered `vitest run` — that is the invocation
  that OOMs locally. *(FR-037 + research R10)*
- **T8**: Toolchains outside the graph (Cypress, Slither, Medusa, Manticore, Matchstick, mkdocs,
  cloudbuild, gcloud) MUST be named in the docs, never implied to be covered. *(FR-042)*

---

## Entity: Shared definition

Data that must be identical across units. Four tables today, in six locations.

| Definition | Locations today | After |
|---|---|---|
| EIP-712 intent structs | contract typehashes; `frontend/src/lib/relay/intentTypes.js`; `services/relay-gateway/src/intent/intentTypes.js` | contract + `@fairwins/intent-types` |
| EIP-3009 `ReceiveWithAuthorization` | `frontend/src/lib/pools/gasless.js`; `services/.../intentTypes.js:192` | `@fairwins/intent-types` |
| Contract ABIs | 47 `.js` + 10 `.json` in `frontend/src/abis/`; 2 vendored in `subgraph/abis/` | generated `@fairwins/abi` |
| Fee service IDs + caps | 5 locations incl. two Solidity files | covered by an equivalent check *(FR-029)* |

**Validation rules**

- **S1**: Exactly one copy outside the contracts, read by every consumer. *(FR-024)*
- **S2**: Each definition verified against the contract's own committed value; mismatch fails.
  *(FR-026)*
- **S3**: **EIP-3009 is the exception and must be handled differently.** Its authoritative typehash
  lives in the *deployed USDC contract*, not this repo — the only in-repo Solidity copy is
  `contracts/mocks/MockUSDCPermit.sol:16`, a **mock**. It needs a recorded fixed-vector test, not
  a contract-parity test. *(FR-027)*
- **S4**: `InvalidateNonce` MUST be added to the gateway. Measured: frontend 29 actions / 27 tables
  vs gateway 28 / 26. The invariant is already 2-of-3. *(FR-028)*
- **S5**: The 26 shared structs are currently **field-for-field identical** — extraction must be
  proven byte-neutral, and shipped as a separate commit from the `InvalidateNonce` addition so a
  bisect can distinguish "moved" from "added".

---

## Entity: Baseline

A recorded measurement taken *before* a structural change, against which the change is proven
neutral. Baselines are the only reason any later phase can be trusted.

| Baseline | Captured | Consumed by | Note |
|---|---|---|---|
| Bytecode digests | Phase 1, pre-change | Phases 1, 3 | sha256 of `bytecode` + `deployedBytecode` for every artifact |
| Mini-app content hashes | Phase 3, pre-change | Phase 3 | Read from `MiniAppRegistry` on Polygon 137 **and** Mordor 63 |
| Pipeline job outcomes | Phase 2, post-repair | Phase 6 | The comparison set for the target graph with caching disabled |
| Per-job install size/time | Phase 3, pre-change | Phase 3 | Gateway installs ~299 packages today vs a ~2,100 superset |

**Validation rules**

- **B1**: A baseline records a **value or an explicit failure** — never a default. If a chain is
  unreachable, it records *unreachable* and the dependent gate is blocked, not assumed passing.
  *(FR-019, constitution III)*
- **B2**: The mini-app gate is **before-vs-after on the same tree**, never "matches what is on
  chain". No in-repo baseline exists, and the live packages were built from an unrecorded commit
  against unrecorded dependencies — so a mismatch could not distinguish "this change broke it"
  from "HEAD never reproduced it". *(research R5)*
- **B3**: The byte-reproducibility fixture MUST be extended to import `ethers` before it is trusted
  as a gate. The existing fixture deliberately excludes `ethers` — by its own header — and `ethers`
  is the ~190-binding shim that both real packages actually use. *(FR-021)*

---

## Entity: Gate

A check that blocks a merge. **A gate that cannot fail is worse than no gate, because it is
trusted.**

| Gate | State today | Required |
|---|---|---|
| e2e (Cypress) | `continue-on-error: true`, and greps `"failing"` against a reporter emitting `"failures"` | must fail on failure *(FR-008)* |
| Slither | ends in `\|\| true` | must fail on critical *(FR-007)* |
| storage-layout | passes when it compares nothing | must fail when `compared === 0` *(FR-004)* |
| compiler targets | does not exist | new test *(FR-002)* |
| typehash parity | does not exist | new test *(FR-026)* |
| ABI parity | does not exist | new `--check` gate *(FR-032)* |
| boundary | one Vitest file, relative-path only, in an eslint-ignored dir | + lint, both directions, incl. by-name *(FR-044–046)* |
| mini-app bytes | does not exist | new gate *(FR-020)* |

**Validation rules**

- **G1**: No gate may suppress its own exit status. *(FR-007)*
- **G2**: Every gate must be proven able to fail by introducing a deliberate violation.
  *(SC-004, SC-014, SC-017)*
- **G3**: Failures revealed by repairing a gate are fixed at the source, never by weakening the
  gate. *(FR-011)*
- **G4**: The target graph must not become the sole merge gate while deploy paths run outside it —
  `deploy-contracts.yml` has no test dependency today. *(FR-043)*
