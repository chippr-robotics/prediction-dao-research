# Phase 0 Research: Monorepo Workspaces, Packages, and a Declared Build-Target Graph

**Feature**: 074-monorepo-workspaces | **Date**: 2026-08-02

All findings below were produced by a 12-agent review of the working tree (six domain surveys,
three independent feasibility cases, one synthesis, two adversarial verification passes) and then
re-verified by hand where the finding is load-bearing for a decision. Claims marked **[measured]**
were re-run directly against this checkout; the command is given so they can be reproduced.

---

## R1. Build system: Bazel vs. npm workspaces + a JS-native task runner

**Decision**: Adopt **npm workspaces** (single root lockfile) plus **Turborepo 2.10.8** as a thin
task-graph runner over the npm scripts that already exist. **Do not adopt Bazel.**

**Rationale**:

The request named Bazel, so it was evaluated properly rather than dismissed. It scored 3/10 and
returned a `not-recommended` verdict on five verifiable grounds:

1. **No Solidity ruleset exists.** `aspect-build/rules_sol` — the only one from a reputable org —
   was archived to the `aspect-archives` organisation in April 2025 (last push February 2024,
   v0.1.0, 6 stars, absent from the Bazel Central Registry). It is raw-`solc` only: no Hardhat, no
   artifact emission, no upgrades plugin, no coverage. `contracts/` would become a hand-maintained
   `genrule` wrapping `hardhat compile`, owned by this project forever.
2. **Bazel cannot deliver the literal ask on the Solidity side anyway.** See R2 — `contracts/` is
   provably one compilation unit, so it gets exactly one target under Bazel, identical in
   granularity to `npm run compile` today. The custom ruleset would buy a cache key that
   `actions/cache` keyed on `hash(contracts/**)` already provides.
3. **`rules_js` requires pnpm, and pnpm's strict layout breaks shipped code here.** Verified
   breakages: `frontend/miniapps/token-mint` and `frontend/miniapps/clearpath` have **no
   `package.json` at all** and resolve ~7 bare specifiers each purely by walk-up hoisting;
   `frontend/src/lib/solana/send.js:23` imports an undeclared `@solana-program/system`;
   `scripts/deploy/check-storage-layout.js:43` requires an undeclared
   `@openzeppelin/upgrades-core`. Under a non-hoisted store all three stop resolving.
4. **Bazel's hermeticity guarantee is documented as not holding for most of this tree.**
   `aspect-build/rules_js` issue #362, "ESM imports escape the sandbox & runfiles", has been open
   since 2022-08-05 and is listed under *Known issues* in the current README. Four of six units
   are `"type": "module"`. Soundness is the only reason to pay Bazel's cost, and it is disclaimed
   where it would be needed.
5. **It makes the most important safety gate harder to run.** `check-storage-layout.js` needs
   `.openzeppelin/*.json` (produced only as a side effect of real on-chain transactions and
   unregenerable in any sandbox), `deployments/*.json`, and a warm, writable `cache/validations.json`
   that `@openzeppelin/upgrades-core` takes a lockfile on. Bazel actions get read-only inputs in a
   fresh sandbox. This gate has already silently passed while checking nothing once (documented in
   its own header); making it awkward to run is how that recurs.

Cost comparison: Bazel is 4–7 engineer-months to a green build, then an estimated 0.25–0.5 FTE
in perpetuity maintaining a hand-rolled Solidity integration, a hand-rolled Vite wrapper (the only
community `rules_vite` was last pushed November 2021), a hand-rolled `graph-cli` wrapper (no
AssemblyScript ruleset exists from anyone), and two sub-15-star third-party rulesets for Vitest and
Cypress. The recommended path reaches roughly 80% of the realizable benefit at about 3% of the cost.

The economics do not support Bazel either: **no unit here is published, and nothing outside the
repository resolves any unit by name.** Bazel's value proposition is coordinating many teams over
many independently-versioned artifacts. That condition does not hold.

**Alternatives considered**:

| Option | Verdict | Fit | Why not chosen |
|---|---|---|---|
| Bazel (bzlmod + `aspect_rules_js` + custom Solidity rules) | not-recommended | 3/10 | Five blockers above; cost/benefit inverted |
| Nx | rejected | — | Its edge over Turborepo (generators, graph inference, `@nx/enforce-module-boundaries`) is aimed at TypeScript monorepos. This repo's hard edges are Solidity, filesystem paths, and duplicated source — Nx infers none of them. Its one real advantage, module-boundary lint, is obtained directly from `eslint-plugin-boundaries` (see R7) |
| Minimal targeted fixes, no framework | scored highest (9/10) on its own terms | — | **Partially adopted**, not rejected: its six fixes *are* Phases 1–2 of this plan. It was not adopted wholesale because it explicitly declines to deliver workspaces/packages/targets, which is the request |
| npm workspaces + Turborepo | **chosen** | 7/10 | Delivers the request's three concepts against this stack without a new toolchain to own |

**Conditions that would reopen the Bazel decision** (recorded so it is revisited on evidence, not
by assumption — any two suffice):

- A unit becomes a published, semver'd artifact with external consumers. The nearest real case is
  `chippr-robotics/chippr-miniapp-template`, which today *vendors* a copy of `tools/miniapp-build`
  rather than depending on it.
- Engineering headcount reaches ~8–10 across two or more teams, so a remote cache is warmed by
  many machines rather than one.
- A maintained Solidity ruleset appears in the Bazel Central Registry with Hardhat or Foundry
  integration, artifact emission, and coverage — or this project migrates to Foundry, whose
  single static binary makes hermetic wrapping tractable.
- `aspect-build/rules_js` #362 closes, so the sandbox guarantee covers ESM.
- A second compiled language with a real Bazel ruleset (Rust, Go, a substantial Python service)
  enters the repo, so cross-language toolchain hashing starts paying rent.

---

## R2. Why `contracts/` cannot be partitioned (FR-048, FR-049)

**Decision**: `contracts/` remains exactly one compilation unit and one build target. Neither
Bazel nor Turborepo changes this.

**Rationale** — three independent constraints, each sufficient on its own:

1. `hardhat.config.js` sets `paths.sources: "./contracts"` — a single directory.
2. `.solcover.js` documents in-file that excluding `contracts/test/` (the Medusa/Echidna
   harnesses) or `contracts/account/lib/` from the instrumentation unit **corrupts
   solidity-coverage's source-map attribution, collapsing `WagerRegistry` coverage to ~5%**.
   Test-only and vendored Solidity must stay in the same unit as production code.
3. `scripts/deploy/check-storage-layout.js` defines `FACET_PAIRS`, which requires `WagerRegistry`
   and `WagerRegistryIntents` to be compiled together — they are two facets behind one proxy
   sharing one storage layout.

**[measured]** `git ls-files '*.sol' | grep '^contracts/' | wc -l` → **120**. Of these, **4** carry
`pragma solidity 0.8.23` (`account/CoinbaseSmartWallet.sol`, `account/FairWinsVerifyingPaymaster.sol`,
`mocks/MockAccount.sol`, `mocks/MockEntryPointStake.sol`); the remaining **116** compile on the
0.8.24 profile.

**Consequence for the request**: "packages and targets" is delivered for the JavaScript/TypeScript
side and for the shared-definition layer. For Solidity it is delivered as *one well-declared
target with explicit inputs and outputs*, which is the achievable form. This is stated plainly
rather than papered over.

---

## R3. The compiler target is currently decided outside this repository

**Decision**: Pin `evmVersion: "paris"` on the 0.8.24 compiler profile, and add a test asserting
every compiler entry and every override declares an explicit target.

**Rationale**: `hardhat.config.js:332` pins `evmVersion: "paris"` on the **0.8.23** profile only.
The 0.8.24 profile — 116 of 120 contracts — declares no `evmVersion`, so it inherits Hardhat's
internal default at `node_modules/hardhat/internal/core/config/config-resolution.js`
(`resolved.settings.evmVersion = compiler.settings?.evmVersion ?? "paris"` for solc ≥ 0.8.20),
while `hardhat` is depended on as `^2.28.2`. The EVM target of nearly all deployed bytecode is
therefore set by a floating third-party default.

If that default moves to `shanghai`, solc emits `PUSH0`; if to `cancun`, `MCOPY`. Either is
undeployable on ETC 61 and Mordor 63 — both live per `CLAUDE.md` — and both change deployed
bytecode, hence every CREATE2 address.

**[measured]** All 30 `artifacts/build-info/*.json` records currently report `evmVersion: "paris"`
(26 × 0.8.24/viaIR:false, 3 × 0.8.24/viaIR:true, 1 × 0.8.23/viaIR:true). **The pin is therefore
byte-neutral today**, which makes it both cheap and urgent — the window in which it is free is
exactly the window before the default moves.

**Alternatives considered**: pin `hardhat` to an exact version instead. Rejected: it freezes an
entire toolchain to fix one setting, and conflicts with the standing directive to track latest
upstream. Declaring the setting is narrower and states the intent.

---

## R4. Version skew and why a blunt `overrides` would break the install

**Decision**: Align declared **ranges** so a single lockfile dedupes them naturally. Do **not**
add a bare root `overrides: { "ethers": ... }`. If a hard pin is ever needed, scope it per-package,
exactly as the existing `overrides: { "@safe-global/safe-contracts": { "ethers": "$ethers" } }` does.

**Rationale**: **[measured]** the root lockfile contains `ethers` 5.8.0 **nine times** and 4.0.49
**twice**, alongside 6.13.4, 6.13.5 and 6.16.0. The v4/v5 copies belong to `@uma/core`,
`@chainlink/contracts`, `@across-protocol/contracts` and `@gnosis.pm/zodiac`. An unscoped root
override forces an API-incompatible major onto all of them and breaks the install.

The actual skew to fix is small: only **5** dependencies appear in more than one manifest, and only
`ethers` disagrees — root `^6.16.0`, frontend `^6.17.0`, relay-gateway `^6.16.0` (whose own
lockfile has already floated to 6.17.0), `services/relayer` `^6.16.0` with no lockfile at all.

**Corollary**: npm workspaces does **not** by itself enforce a single version.
**[measured]** with one workspace declaring `semver@^7` and another `^6`, `npm@11.6.0` exited 0 and
installed **both** (7.8.5 hoisted, 6.3.1 nested) with no warning. A single lockfile makes drift
*visible and singular*; it does not prevent it. Enforcement is a separate dependency-version check
in CI.

---

## R5. Workspace hoisting can invalidate an on-chain commitment

**Decision**: Treat the mini-app byte reproducibility gate as a **blocking** prerequisite of the
workspace change, and record a baseline before touching installation layout.

**Rationale** — the causal chain was traced link by link and every link verified:

1. `tools/miniapp-build/hostScopePlugin.js:235-237` calls `this.resolve()` and then
   `await import(resolvedFile)` to enumerate a dependency's **export names** at build time.
2. Those names are baked into the emitted host shim, which lands in `dist/entry.js`.
3. `entry.js`'s sha256 goes into `manifest.json`.
4. `keccak256(manifest bytes)` is the commitment stored on-chain in `MiniAppRegistry`.

Workspaces change hoisting → hoisting changes resolution → resolution changes the shim → the
committed hash changes. Nothing raises an error. Both real packages import `ethers` (10 import
sites across the two), and `ethers` contributes roughly 190 bindings to a shim.

Three aggravating facts:

- **No in-repo baseline exists.** `frontend/miniapps/*/dist/` is gitignored, neither package has a
  `package.json` (so no version), and `deployments/` contains no mini-app records. The published
  hashes exist **only** in `MiniAppRegistry` storage on Polygon 137 and Mordor 63.
- **A byte match against the chain is not even expected.** The live packages were built on a
  developer machine from an unrecorded commit against unrecorded dependency versions. A mismatch
  could not distinguish "this change broke it" from "HEAD never reproduced it".
- **The existing fixture is blind to the risk.** `frontend/src/test/miniapps/fixtures/` asserts a
  regenerate produces an empty git diff, but its own header states that **`ethers` is
  intentionally not imported** ("it would add a ~190-binding shim to committed bytes that are
  meant to stay human-reviewable"). It covers the React shim and is structurally blind to the
  larger, more version-sensitive, and only actually-used one.

**Therefore** (FR-019 – FR-023): read the live `manifestHash`/`cid` for both apps from both chains
and commit them as a recorded baseline together with a stated answer to whether HEAD reproduces
them; add an `ethers`-importing second fixture; and make the merge gate **before-vs-after on the
same tree**, never "matches what is on chain".

**Mitigation adopted**: drop four unused frontend dependencies (`@uniswap/v3-sdk`, `jsbi`,
`@walletconnect/ethereum-provider`, `@walletconnect/modal` — **[measured]** zero import sites in
`frontend/src`) as a **separate prerequisite commit**. `@uniswap/v3-sdk` is what drags
`@openzeppelin/contracts@3.4.2-solc-0.7` into `frontend/node_modules`, and it is the one plausible
route by which a single hoisted tree could change which OpenZeppelin version a Solidity import
resolves to.

**Correction to an earlier finding**: `remappings.txt` is **not** the mechanism. **[measured]** it
has zero references anywhere outside `node_modules` — no Hardhat config, no CI, no `foundry.toml`.
Hardhat resolves `@openzeppelin/...` through ordinary Node resolution. The hazard is real but it is
hoisting, not remapping.

---

## R6. Why the shared EIP-712 definitions cannot simply be imported today

**Decision**: Extract a dependency-free `@fairwins/intent-types` package that both the frontend and
the relay gateway consume, and add a contract-side parity test.

**Rationale**: **[measured]** the two copies have **not** drifted structurally — all 26 shared
structs are field-for-field identical. But one action is missing: `frontend` declares **29**
actions / **27** type tables against the gateway's **28** / **26**. `InvalidateNonce` exists in
`contracts/upgradeable/SignerIntentBase.sol` and in the frontend, and is **absent from the
gateway** — so a relayed `invalidateNonce` is an unknown action at the gateway today.

The mechanical reason the duplication exists: **[measured]** `frontend/src` contains **2,966**
extensionless relative imports (Vite-resolved), against **0** in `services/relay-gateway/src`
(Node ESM, which requires extensions). The gateway physically cannot import frontend code. A
shared package authored Node-resolvable is what removes the reason for a second copy.

**Feasibility confirmed**: the gateway copy imports only `ethers` and a local errors module; the
frontend copy imports `NETWORKS` (for a `NETWORKS[chainId]?.stablecoin` lookup),
`RECEIVE_WITH_AUTHORIZATION_TYPES`, and a local error class. Critically,
`frontend/src/config/networks.js` does **not** reach `virtual:tenant`, so extraction is unblocked.

**Correction carried from verification**: `RECEIVE_WITH_AUTHORIZATION_TYPES` is a **fourth**
duplicated type table — `frontend/src/lib/pools/gasless.js` and
`services/relay-gateway/src/intent/intentTypes.js:192` — and it is the **money path** (EIP-3009
`joinWithAuthorization`). It must move into the shared package too. Extracting the primary file
alone would leave EIP-3009 duplicated *and* asymmetric (gateway reads a package, frontend reads a
local literal), which is worse than today.

**Special case**: EIP-3009's authoritative typehash lives in the **deployed USDC contract**, not
in this repository — the only in-repo Solidity copy is `contracts/mocks/MockUSDCPermit.sol:16`, a
mock. It therefore needs a **recorded fixed-vector test**, not a contract-parity test. FR-027
requires the two cases be distinguished.

---

## R7. Boundary enforcement is a lint rule, not a manifest

**Decision**: Enforce the spec-073 package/host boundary with `eslint-plugin-boundaries`, keep the
existing Vitest guard, and **narrow the lint ignore** so test code is covered.

**Rationale**: A tempting but **false** claim was caught in verification: that giving each mini-app
a `package.json` which does not declare `frontend` as a dependency makes the boundary structural.
It does not. **[measured]** `frontend/src/test/miniapps/packageBoundary.test.js` detects violations
by resolving **relative** paths — and Node and Vite resolve relative paths without ever consulting
a `package.json`. No manifest can make `import x from '../../src/lib/foo'` fail. Separately,
workspaces **hoist**, so an undeclared bare specifier still resolves from the root.

Two consequences the design must absorb:

- **[measured]** `frontend/eslint.config.js:13` sets `ignores: ['cypress/**', 'src/test/**']` —
  and **3 of the 4** real escapes out of `frontend/src` live in `src/test/miniapps/`. A boundary
  lint added without narrowing that ignore would cover *less* than the Vitest file it is meant to
  strengthen. The four escapes are `buildPreset.test.js:24`, `hostScope.test.js:45`,
  `fixtures/regenerate.mjs:50`, `fixtures/source/vite.config.js:21`.
- Adding `frontend/miniapps/*` as workspaces creates a **new** leak direction: npm symlinks each
  package into the root `node_modules` under its name, making `import '@fairwins/miniapp-token-mint'`
  resolvable from `frontend/src`. The existing guard only checks relative paths and a literal
  substring, so it would not catch it. FR-046 requires covering the by-name direction in the same
  change that adds the manifests.

---

## R8. Turborepo's caching model, and where it is unsound here

**Decision**: Adopt Turborepo, but ship it last, run it with caching disabled for an initial
observation period, and never enable a remote cache in this feature.

**Rationale**: Turborepo hashes *declared* inputs and trusts the declaration. It does not sandbox.
An undeclared input therefore yields a **wrong cache hit rather than an error** — the opposite
failure mode from Bazel, and the reason this phase ships after the pipeline is honest (User Story 2).

Specific unsoundness that must be designed around:

- **`.env` is invisible to the cache key.** `hardhat.config.js:3` runs `dotenv.config()` *inside*
  the task process, after Turborepo has computed the hash. `globalEnv` only covers variables
  already exported in the caller's shell. `AMOY_RPC_URL` silently switches the default test chain
  from a clean 1337 to an Amoy fork. This must be handled by a `dotEnv` declaration or by moving
  dotenv out of config evaluation — or stated plainly as a known limitation.
- **`hardhat.config.js` is not a pure function of the tree.** Beyond `.env` it scans `process.argv`
  for `--network` to choose the block-explorer config *shape*, and shells out to `mountpoint` via
  the floppy-key loader on **every** command including plain `compile`.
- **`cache/validations.json` (1.6 MB) is an input to the storage-layout gate**, not a discardable
  artifact. It must be declared an output of `compile`, and the gate itself marked non-cacheable.
- **Coverage cannot share the compile cache**: `.solcover.js` sets `configureYulOptimizer`, so a
  coverage run needs its own root.

**Alternatives considered**: enable remote caching for CI speed. Rejected for this feature —
Turborepo's remote cache is content-addressed over *your* declared inputs and inherits exactly the
unsoundness above, and `CLAUDE.md` carries an explicit no-backend / fixed-footprint rule.

---

## R9. Most of the measured CI waste is not a build-graph problem

**Decision**: Fix the pipeline's honesty and duplication (User Story 2) **before** introducing the
task graph, and do not credit Turborepo with the recovery.

**Rationale**: The dominant costs are structural YAML mistakes, not missing incrementality:

- `test.yml` and `security-testing.yml` each declare `pull_request:` **and** `push:` **and**
  `workflow_call:`, while `ci-manager.yml` *also* invokes them — so they run twice per event and
  ci-manager's "smart selection" only ever *adds* work.
- No PR-triggered workflow declares a `concurrency:` group, so superseded runs are never cancelled.
- The end-to-end gate cannot fail: `test.yml:362` sets `continue-on-error: true` and the
  enforcement step greps for the literal `"failing"` against `--reporter json` output that only
  ever emits `"failures"`.
- The Slither step ends in `|| true`, which violates the constitution's Principle IV directly.

Turborepo's genuine contribution is narrower and should be claimed honestly: collapsing the
repeated `hardhat compile` passes per commit into one cached `compile` consumed by test, coverage,
storage-layout and ABI generation.

**Note on evidence**: the review's headline figures (~30 jobs / ~3 runner-hours per commit; the
end-to-end gate green on 40 consecutive runs while 63 tests fail) come from run-log analysis and
could not be re-verified from the working tree. The *structural* defects above were each confirmed
by reading the YAML. Task generation must re-measure the counts from run history before they are
quoted as outcomes.

---

## R10. Frontend test target must not be one unfiltered run

**Decision**: Model the frontend test target as sharded/projected, not as a single `vitest run`.

**Rationale**: `CLAUDE.md` records that the full frontend suite OOMs in this environment and that
local runs must be scoped to files. Modelling `frontend#test` as one unfiltered `vitest run` would
make the canonical command (`turbo run test --filter=frontend`) precisely the invocation that
OOMs, while the scoped run a developer actually uses is invisible to the graph and never caches —
so it always pays full cost. This would make the daily loop measurably *worse*, which no part of
this feature is allowed to do.

The unexploited fix identified in survey is Vitest `projects`: a `node`-environment project for the
~150 pure-logic `lib/`/`util/` suites and a `jsdom` project for component suites, plus
`NODE_OPTIONS=--max-old-space-size=4096` and `TZ=UTC` (the latter for CI parity — some suites
hard-code UTC datetime strings).

---

## R11. Workspace member names

**Decision**: Use the packages' **real** names in every workspace command; rename nothing in this
feature.

**Rationale**: A scoped-name convention was assumed during synthesis and is wrong.
**[measured]** the actual `name` fields are:

| Path | Real package name |
|---|---|
| `frontend` | `frontend` |
| `services/relay-gateway` | `fairwins-relay-gateway` |
| `services/relayer` | `fairwins-pool-relayer` |
| `subgraph` | `prediction-dao-research-subgraph` |
| `tools/miniapp-build` | `@fairwins/miniapp-build` |
| *(root)* | `prediction-dao-research` |

Any `--workspace @fairwins/relay-gateway` command would fail with `No workspaces found`. Renaming
is not free — `fairwins-relay-gateway` is baked into its own lockfile and Docker build, and the
subgraph name appears in `graph deploy` arguments — so renames are deliberately out of scope.

**[measured]** the root `package.json` has **no `"private"` field**; only 5 of 6 manifests are
private. `"private": true` must be added to the root as part of the workspace change.

---

## R12. Known unknowns carried into implementation

These are stated rather than guessed, and are resolved during the phase that touches them:

1. **Does HEAD reproduce the published mini-app CIDs?** Unknown and unknowable until the baseline
   in FR-019 is taken. Both answers are acceptable; only silence is not.
2. **Are generated ABIs committed or built on demand?** FR-035 requires the plan to answer. If not
   committed, a fresh clone can no longer run the frontend without first installing a Solidity
   toolchain and compiling 120 contracts — today the frontend builds with no Solidity toolchain at
   all. **Provisional decision: commit them**, with the parity gate proving they are current; this
   preserves the existing developer loop and keeps the IDE able to resolve definitions.
3. **How many real end-to-end failures does repairing the gate expose?** The review reports ~63
   with a single recurring cause (`cy.click()` intercepted by `.entry-gate-overlay`). Must be
   re-measured on the branch, not assumed.
4. **Does `graph-cli` survive hoisting?** `subgraph/package-lock.json` is the only record of how
   `@graphprotocol/graph-cli@0.80.0` + `graph-ts@0.35.1` + `matchstick-as@0.6.0` resolve, and
   graph-cli bundles its own AssemblyScript/gluegun stack. Running `graph codegen && graph build`
   under the merged tree is a **hard gate** before that lockfile is discarded.
5. **Per-workspace install cost.** The gateway job installs ~299 packages today; a naive root
   `npm ci` installs the ~2,100-package superset. `npm ci --workspace <x>
   --include-workspace-root=false` must be validated against the real lockfile before CI timings
   are trusted.
