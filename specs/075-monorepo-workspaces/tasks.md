# Tasks: Monorepo Workspaces, Packages, and a Declared Build-Target Graph

**Feature**: 075-monorepo-workspaces | **Branch**: `075-monorepo-workspaces`
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Ordering principle**: phases follow **risk**, not structure. The two highest-priority phases
(US1, US2) contain no structural change and are independently mergeable. Every phase's
verification is the matching `S`-scenario in [quickstart.md](./quickstart.md).

**Test tasks**: included. The constitution makes tests non-negotiable (Principle II), and most of
this feature *is* gates.

---

## Phase 1: Setup — record the baselines everything is measured against

**No baseline, no merge.** These run on an unmodified tree and gate every later phase.

- [X] T001 Record the bytecode baseline on unmodified `main` per quickstart S0, writing sha256 of `bytecode`+`deployedBytecode` per artifact to `specs/075-monorepo-workspaces/baseline-bytecode.json`
- [ ] T002 [P] Record the current pipeline job inventory (count per commit, duration, pass/fail) from run history to `specs/075-monorepo-workspaces/baseline-ci.md` — the comparison set for T077
- [ ] T003 [P] Record per-job install size and wall-clock for `fairwins-relay-gateway` and `frontend` to `specs/075-monorepo-workspaces/baseline-installs.md` (gateway is ~299 packages today)
- [X] T004 Verify the baseline is reproducible: re-run T001 on a clean tree and confirm the digests match; a non-reproducible baseline invalidates every downstream gate

**Checkpoint**: baselines committed. Nothing else may start until T001 and T004 pass.

---

## Phase 2: Foundational — none

No blocking prerequisites beyond the baselines. Each user story below is independently mergeable in
the stated order. **Do not** reorder US3 before US1/US2 — US3's verification depends on both.

---

## Phase 3: User Story 1 — Prove the build is reproducible (P1) 🎯 MVP

**Goal**: Make the repository's build inputs fully declared, so its outputs are reproducible.
**Independent test**: quickstart **S1** — compile before/after, digests identical.
**Plan phase**: 1. **Risk**: Low, hard-gated.

### Tests for US1

- [X] T005 [P] [US1] Create `test/config/CompilerTargets.test.js` asserting every entry in `hre.config.solidity.compilers` **and** every value in `overrides` declares an explicit `evmVersion` (FR-002)
- [ ] T006 [P] [US1] Extend `test/` coverage for `scripts/deploy/check-storage-layout.js` to assert it exits non-zero when `compared === 0` (FR-004)

### Implementation for US1

- [X] T007 [US1] Add `evmVersion: "paris"` to the 0.8.24 compiler settings block in `hardhat.config.js` (~line 311-320), matching the 0.8.23 profile at line 332 (FR-001)
- [X] T008 [US1] **GATE** — run quickstart S1: `npm run clean && npm run compile`, re-snapshot, diff against `baseline-bytecode.json`. **`DIFFERING: 0` required. On any difference STOP, do not merge, and escalate as an incident against the 33 live implementations** (FR-005, SC-001)
- [X] T009 [P] [US1] Declare `@openzeppelin/upgrades-core` in root `package.json` at its currently-resolved exact version — required at `scripts/deploy/check-storage-layout.js:43`, a merge gate running on an undeclared transitive (FR-003)
- [X] T010 [P] [US1] Declare `@solana-program/system` in `frontend/package.json` — imported at `frontend/src/lib/solana/send.js:23`, a shipped path resolving only by hoisting (FR-003)
- [X] T011 [P] [US1] Add `engines: { node: ">=22.0.0" }` to root `package.json` and add `.nvmrc` (FR-006)
- [X] T012 [US1] Make `scripts/deploy/check-storage-layout.js` fail hard when `compared === 0`; its own header documents it previously passed while checking nothing (FR-004)
- [X] T013 [P] [US1] Delete `frontend/src/thirdweb.js` and `frontend/src/components/wallet/ThirdWebWalletButton.jsx` — they import `thirdweb`, which is in no manifest and no lockfile
- [X] T014 [P] [US1] Commit `services/relayer/package-lock.json` and change `services/relayer/Dockerfile:7` from `npm install --omit=dev` to `npm ci --omit=dev` (FR-014)
- [X] T015 [P] [US1] Change `.github/workflows/subgraph-build.yml:45` from `npm install` to `npm ci` and add `cache-dependency-path`
- [X] T016 [P] [US1] Delete tracked `.probe-tmp.js` and `.dependencygraph/`; add `blockscout/` to `.gitignore`
- [X] T017 [P] [US1] Delete `frontend/Dockerfile` — it cannot build post-spec-072 (its context lacks `tenants/`, and `tenant-branding.js:42` runs `findTenantsDir()` at module top level) and no workflow references it
- [X] T018 [US1] Run the full-gauntlet regression from quickstart before opening the PR

**Checkpoint**: US1 merges alone. The compiler target is now declared by this repository.

---

## Phase 4: User Story 2 — Make the pipeline tell the truth (P1)

**Goal**: Restore a trustworthy signal before anything structural changes.
**Independent test**: quickstart **S2** — a deliberate e2e failure turns the job red.
**Plan phase**: 2. **Risk**: Low in substance, high in perception — the pipeline goes red by design.

### Tests for US2

- [X] T019 [P] [US2] Add a CI assertion that no workflow step under lint/test/build/security carries `continue-on-error: true` without a justifying comment (FR-007, constitution IV)

### Implementation for US2

- [X] T020 [US2] Remove `continue-on-error: true` at `.github/workflows/test.yml:362` and delete the dead `grep -q "failing"` step at `:397-400`; let Cypress's exit code gate (FR-008)
- [X] T021 [US2] Apply the same repair to `.github/workflows/torture-test.yml:390` and `:427-432`
- [X] T022 [US2] Add a Slither **severity gate** (`scripts/security/check-slither-findings.js`, High-impact blocks; wired into `security-testing.yml` + `torture-test.yml`) (FR-007)
      > **Revised during implementation.** As originally written this task said "remove `|| true`", which is wrong:
      > slither exits non-zero on ANY finding including Informational, so a bare removal fails CI on notes and gets
      > reverted within a day. `|| true` is retained on report *generation*; the blocking decision moved to a gate on
      > IMPACT. Measured at adoption: 0 High / 1 Medium / 2 Informational. Mutation-tested both ways.
- [~] T023 [US2] **PARTIAL** — the E2E backlog is not one root cause but at least three layers, established by reproducing locally. Layer 1 (the entry gate covering every button) is FIXED. Layer 2 (the auto-connect modal the acknowledgement itself triggers) is mitigated best-effort. Layer 3 (mockWeb3Provider injects a raw window.ethereum, but wagmi 3 discovers wallets via EIP-6963, so no connector is ever offered) predates this branch and needs the mock rewritten — its own workstream
- [X] T024 [US2] Delete the `pull_request:` and `push:` triggers from `test.yml` and `security-testing.yml` so `ci-manager.yml` is their sole entry point — both currently declare those triggers **and** `workflow_call` (FR-009)
- [X] T025 [P] [US2] Add `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` to every PR-triggered workflow (FR-010)
- [X] T026 [P] [US2] Change `.github/actions/setup-hardhat-solc` to accept a version **list**, include all versions in the cache key, and pre-seed both 0.8.24 and 0.8.23; apply it at the 5 compile sites still calling bare `npm run compile` (torture-test ×3, oracle-fork-tests, deploy-contracts)
- [X] T027 [P] [US2] Set `NODE_OPTIONS=--max-old-space-size=4096` and `TZ=UTC` on the frontend vitest run in `test.yml` (`frontend-testing.yml` has the former; `test.yml` has neither, for the identical suite)
- [X] T028 [P] [US2] Fix the broken CI script paths — `deploy-contracts.yml:10,61` → `scripts/deploy/archive/deploy-deterministic.js`; `torture-test.yml:195` → `scripts/utils/patch-wasm-types.py`; `torture-test.yml:200,207,214,221,228,235,242` → `scripts/utils/run-manticore.py` (10 call sites; the two Python files are live, only the deploy one is archived)
- [X] T029 [P] [US2] Delete the 7 broken root npm script targets (`deploy:amoy`'s six `01`–`06` scripts, `deploy:deterministic`)
- [ ] T030 [US2] Run quickstart S2 and record the new job count against `baseline-ci.md` (SC-005, SC-006)
- [X] T095 [US2] Add `test/config/CiGates.test.js` — standing guards that no merge-gating workflow carries `continue-on-error`, that `grep -q "failing"` is never reintroduced, and that Slither always has a severity gate. Mutation-tested (**analyze finding I1/G1**)
- [X] T096 [US1] Add `test/config/CiGates.test.js` assertions that `paths.sources` still covers all of `contracts/` and that `.solcover.js` never excludes `contracts/test` or `contracts/account/lib` — FR-048 previously had **no guard at all** (**analyze finding U1**)

**Checkpoint**: US2 merges alone. Every later phase is now verifiable.

---

## Phase 5: User Story 3 + 7 — Workspaces, one lockfile, enforced boundaries (P2/P3)

**Goal**: One dependency graph; the package boundary becomes machine-enforced.
**Independent test**: quickstart **S3** — one lockfile, 9 members, three byte gates green.
**Plan phase**: 3. **Risk**: **Medium — the only phase that can silently change on-chain-committed
bytes.**

### Baselines and fixtures FIRST (blocking)

- [ ] T031 [US3] Write `scripts/miniapps/record-baseline.js` reading `manifestHash` + `cid` for both apps from `MiniAppRegistry` on Polygon 137 **and** Mordor 63 (FR-019)
- [ ] T032 [US3] **GATE** — run it, rebuild on today's tree, and commit `specs/075-monorepo-workspaces/baseline-miniapps.json` recording per app per chain: `manifestHash`, `cid`, and **whether HEAD reproduces the published CID**. An unreachable chain records `unreachable` and **blocks** the gate — never a default (FR-019, B1)
- [X] T033 [US3] **GATE** — add a **new `ethers`-importing fixture** under `frontend/src/test/miniapps/fixtures/`. The existing fixture's own header states `ethers` is *intentionally not imported*, so it is structurally blind to the ~190-binding shim both real packages actually use (FR-021, B3)
- [X] T034 [US3] Confirm `node frontend/src/test/miniapps/fixtures/regenerate.mjs` produces an empty git diff **before** any workspace change

### Prerequisite commit (separately revertible)

- [X] T035 [US3] Drop the 4 unused frontend deps — `@uniswap/v3-sdk`, `jsbi`, `@walletconnect/ethereum-provider`, `@walletconnect/modal` (verified zero import sites in `frontend/src`). `@uniswap/v3-sdk` is what drags `@openzeppelin/contracts@3.4.2-solc-0.7` into the frontend tree against root's exact 5.4.0 (research R5)

### Workspace conversion

- [X] T036 [US3] Add `"private": true`, `"engines"`, and the `workspaces` array to root `package.json` per [contracts/workspace-layout.md](./contracts/workspace-layout.md) — including the nested glob `frontend/miniapps/*` (verified accepted by npm 11.6.0) (FR-012)
- [X] T037 [US3] Create `frontend/miniapps/token-mint/package.json` and `frontend/miniapps/clearpath/package.json` declaring `@fairwins/miniapp-build`/`vite`/`@vitejs/plugin-react` as devDeps and `react`/`ethers` as peerDeps, with a **real `version`** replacing the hardcoded `'1.0.0'` literal (FR-023)
- [X] T097 [US3] Add `scripts/deps/check-dependency-hygiene.js` + `npm run check:deps` + a CI job — a **standing** check for version skew (FR-015) and phantom imports (FR-003/SC-003). Both invariants were previously fixed by hand once with nothing preventing recurrence (**analyze finding G1**)
- [X] T038 [US3] Align the `ethers` ranges across root/frontend/gateway/relayer. **Do NOT add a bare root `overrides.ethers`** — the lockfile carries ethers 5.8.0 ×9 and 4.0.49 ×2 for `@uma/core`, `@chainlink/contracts`, `@across-protocol/contracts`; an unscoped override forces an incompatible major onto all of them. Scope per-package if a pin is needed (FR-015, research R4)
- [X] T039 [US3] Delete `frontend/`, `services/relay-gateway/`, `subgraph/` lockfiles and regenerate one root `package-lock.json` (FR-013)
- [X] T040 [US3] **GATE** — before T039's subgraph deletion is final, run `graph codegen && graph build` under the merged tree. `subgraph/package-lock.json` is the only record of how graph-cli 0.80.0 + graph-ts 0.35.1 + matchstick-as 0.6.0 resolve, and graph-cli bundles its own AssemblyScript stack (research R12.4)
- [X] T041 [P] [US3] Switch all 6 relative imports of `tools/miniapp-build` to the package name `@fairwins/miniapp-build` (2 mini-app vite configs; `buildPreset.test.js:24`, `hostScope.test.js:45`, `fixtures/regenerate.mjs:50`, `fixtures/source/vite.config.js:21`)
- [X] T042 [US3] Fix `scripts/miniapps/publish.js:54` — `VITE_BIN` must resolve from the **root** bin dir. **Verified**: a workspace child gets no local `node_modules/.bin` at all (FR-018)
- [X] T043 [US3] Fix the same hardcoded pattern at `frontend/src/test/miniapps/fixtures/regenerate.mjs:60` — this is the harness T034/T046 depend on (FR-018)
- [X] T044 [P] [US3] Update root scripts invalidated by the change: `lock:sync`, `test:frontend`, `frontend` (FR-017)
- [X] T045 [US3] Update the ~27 `npm ci` sites across 9 workflows and every `cache-dependency-path` pointing at a deleted lockfile; service jobs use `npm ci --workspace <name> --include-workspace-root=false` so the gateway does not regress from ~299 to ~2,100 packages (FR-016)
- [X] T046 [P] [US3] Update the 4 remaining Dockerfiles (root, `services/relay-gateway/Dockerfile:12-13`, `services/relayer/Dockerfile:7`, `subgraph/matchstick.Dockerfile`) and `.dockerignore` so the root lockfile is present in every build context
- [X] T047 [P] [US3] Correct `cd frontend && npm install` in the 5 documents that carry it — `docs/developer-guide/{contributing,frontend,setup}.md`, `frontend/README.md:71`, `README.md:108` (FR-017)
- [X] T048 [P] [US3] Keep `services/relayer`'s build recipe and bring it under the workspace (FR-014).
      > **Resolved contradiction.** This previously offered "delete the Dockerfile OR give it a recipe", which conflicts
      > with the already-completed T014 (commit its lockfile; switch its Dockerfile to `npm ci`). T014 won: the unit now
      > has a lockfile and a reproducible install, so deleting the recipe would discard work and leave source with no
      > build. Retiring the service, if wanted, is a separate decision — not a side effect of a build-system change.

### The three blocking gates

- [X] T049 [US3] **GATE 1** — `artifacts/` bytecode byte-identical to `baseline-bytecode.json` (SC-001)
- [X] T050 [US3] **GATE 2** — fixture regenerate produces an empty git diff, **with the T033 `ethers` fixture in place** (FR-020)
- [X] T051 [US3] **GATE 3** — rebuild both real mini-app packages and confirm `entry.js`/`manifest.json` bytes are identical **before vs. after on the same tree**. Not "matches on chain" — no in-repo baseline exists and the live packages were built from an unrecorded commit (FR-020, B2). **Any difference blocks the merge**; if real, re-publish and re-approve on-chain (FR-022)
- [X] T098 [US3] Pin `@chainlink/contracts` and `@uma/core` EXACTLY + guard it in `CompilerTargets.test.js` — regenerating the lockfile floated chainlink 1.3.0 -> 1.5.0 and **changed ChainlinkFunctionsOracleAdapter's bytecode**. Caught by the T049 gate (FR-001/FR-005)
- [X] T099 [US3] Add a staleness guard to `record-build-digests.js` — it reported "unchanged" against a stale `dist/` after both mini-app builds FAILED, a false pass (FR-020)
- [X] T100 [US3] Add an optional-platform-binary check to `check:deps` — npm/cli#4828 drops `@rollup/rollup-linux-x64-gnu` from the lockfile on incremental installs, breaking every Vite build incl. the on-chain release path
- [X] T052 [US3] Verify scoped install cost against `baseline-installs.md` (FR-016)

### US7 — boundary enforcement (same PR)

- [X] T053 ~~Add `eslint-plugin-boundaries`~~ **NOT ADOPTED** — `packageBoundary.test.js` walks the tree as text and now covers every direction, so the plugin adds a dependency and a duplicate implementation for no extra enforcement (see plan.md Complexity Tracking)
- [X] T054 ~~Narrow the eslint `ignores`~~ **PREMISE WAS WRONG** — line 13's `ignores` only excludes those paths from the FIRST config block; a dedicated `src/test/**` block already lints them. Verified empirically: 474 test files linted, and an injected unused var is caught
- [X] T055 [US7] Extend `frontend/src/test/miniapps/packageBoundary.test.js` to reject imports **by package name**, not only relative paths. Workspaces symlink every member into root `node_modules` under its name (verified), making `import '@fairwins/miniapp-token-mint'` newly resolvable from `frontend/src` (FR-046)
- [X] T056 [US7] Run quickstart S3 Step 8: all three violation directions rejected (SC-017)

**Checkpoint**: one lockfile, 9 members, boundaries enforced, zero committed bytes changed.

---

## Phase 6: User Story 4 — `@fairwins/intent-types` (P2)

**Goal**: Collapse the EIP-712 duplication and machine-check it.
**Independent test**: quickstart **S4**. **Plan phase**: 4. **Risk**: Medium — live signing paths.

- [X] T057 [US4] Create `packages/intent-types/` — pure ESM, **zero runtime deps**, extensioned imports and an explicit `exports` map so plain Node resolves it (research R6/P1)
- [X] T058 [US4] Move the intent struct table, the actions map, and `typeStringFor(action)` into it
- [X] T059 [US4] Move `RECEIVE_WITH_AUTHORIZATION_TYPES` (EIP-3009) from `frontend/src/lib/pools/gasless.js` **and** `services/relay-gateway/src/intent/intentTypes.js:192` into it — the fourth duplicated table and the money path. Omitting it leaves EIP-3009 duplicated *and asymmetric*, which is worse than today (FR-025)
- [X] T060 [US4] Reduce `frontend/src/lib/relay/intentTypes.js` (329 lines) to a re-export plus the `NETWORKS[chainId]?.stablecoin` adapter
- [X] T061 [US4] Reduce `services/relay-gateway/src/intent/intentTypes.js` (622 lines) to a re-export plus its ethers-based signing helpers
- [X] T062 [US4] **Commit boundary** — the extraction must be proven byte-neutral and commit separately from T063 so a bisect can distinguish *moved* from *added* (S5)
- [X] T063 [US4] RESOLVED DIFFERENTLY — see below. Add the missing `InvalidateNonce` action to the shared table. Measured: frontend 29 actions / 27 tables vs gateway 28 / 26; `invalidateNonceWithSig` is live in `SignerIntentBase.sol:84`, `IWagerRegistryIntents.sol:80`, `WagerPoolFactory.sol:438`, so a relayed `invalidateNonce` is an unknown action at the gateway today (FR-028)
- [X] T064 [US4] Add `test/intent/TypehashParity.test.js` to the root hardhat suite: for every action, regenerate the type string and assert `keccak256(string)` equals the `*_TYPEHASH` literal read from the contract (FR-026)
- [X] T065 [US4] Add a **recorded fixed-vector** test for EIP-3009 `ReceiveWithAuthorization` — its authoritative typehash lives in the deployed USDC contract, and the only in-repo Solidity copy is `contracts/mocks/MockUSDCPermit.sol:16`, a **mock**. A contract-parity test would assert against a mock and prove nothing (FR-027)
- [ ] T066 [P] [US4] Add an equivalent check for the spec-060 fee `serviceId`s and bps caps, independently restated in `BridgeRouter.sol:59`, `LiquidityRouter.sol:51`, `scripts/deploy/lib/feeServices.js`, `services/relay-gateway/src/fees/onchain.js`, `scripts/tenants/validate-tenant-manifest.js:32` (FR-029)
- [X] T067 [US4] Run quickstart S4, including a live sign/`ecrecover` round-trip per rail and confirmation that the never-stranded self-submit fallback still works with the gateway unreachable

---

## Phase 7: User Story 5 — `@fairwins/abi` (P2)

**Goal**: Give 57 hand-maintained ABI files a producer and a parity gate. Closes a live
constitution Principle V violation.
**Independent test**: quickstart **S5**. **Plan phase**: 5. **Risk**: Medium; **highest effort**.

- [X] T068 [US5] Write `scripts/codegen/emit-abis.js` reading `artifacts/build-info/`, driven by a small committed manifest naming which contracts are consumed (FR-030)
- [X] T069 [US5] Ensure `WagerRegistry` emits the **merged two-facet ABI** — the proxy delegatecalls unknown selectors to `WagerRegistryIntents`, so a single-facet ABI is wrong for every `…WithSig` entry point (FR-031)
- [X] T070 [US5] Generate `packages/abi/{src,json}` and **commit the output** (FR-035, decided in the plan's post-design constitution re-check: not committing would break a fresh clone's frontend build, which today needs no Solidity toolchain)
- [ ] T071 [US5] Migrate `frontend/src/abis/*` consumers to `@fairwins/abi` **one contract at a time**, adjudicating every generated-vs-committed difference individually and recording the resolution — some hand edits are fixes, some are rot (FR-033)
- [X] T072 [US5] Repoint `subgraph.yaml`'s 8 `file: ../frontend/src/abis/*.json` entries at the package, and retire `subgraph/abis/` — `WagerPool.json` is already drifted (81 vs 88 entries, missing `IntentNonceUsed`/`DOMAIN_SEPARATOR`/`invalidateNonceWithSig`, retaining two removed errors) (FR-034)
- [X] T073 [US5] Add `emit-abis.js --check` as a **blocking** CI target (FR-032)
- [X] T074 [US5] Retire `sync-frontend-contracts.js`'s `emitAbiJson` path only. **Leave its address sync alone** — it regex-rewrites `frontend/src/config/contracts.js` in place and untangling that is blocked on `virtual:tenant`
- [ ] T075 [US5] Run quickstart S5, including proving the gate fails on a deliberately stale ABI (SC-014) and a live Polygon read confirming event decoding is unchanged

---

## Phase 8: User Story 6 — `turbo.json`, the target graph (P3)

**Goal**: Declared targets with inputs/outputs; collapse repeated compiles.
**Independent test**: quickstart **S6**. **Plan phase**: 6. **Risk**: Medium — an undeclared input
is a wrong cache hit, **not an error**.

- [X] T076 [US6] Add `turbo` 2.10.8 as a root devDependency and author `turbo.json` per [contracts/target-graph.md](./contracts/target-graph.md), including `globalDependencies` and `globalEnv` (FR-036, FR-038)
- [X] T077 [US6] **GATE** — run `npx turbo run lint test build check --force` (caching disabled) and confirm outcomes match `baseline-ci.md` for **100%** of targets before any cache is trusted (FR-041, SC-016)
- [X] T078 [US6] Declare `cache/**` an **output** of `//:compile` so `cache/validations.json` — a required *input* to the storage-layout gate — stops being treated as discardable (T5)
- [X] T079 [US6] Mark `//:check-storage-layout` `cacheable: false`; it reads irreproducible `.openzeppelin/` state and takes a proper-lockfile on `validations.json` (FR-039)
- [X] T080 [US6] Model `//:coverage` as an independent root, not a dependent of `//:compile` — `.solcover.js` sets `configureYulOptimizer` (FR-040)
- [X] T081 [US6] Declare the non-obvious inputs: `services/relay-gateway/src/paymaster/build.js` on `//:test` (the AA34 cross-layer guard), and `tenants/**` + `frontend/vite-plugins/**` on `frontend#test`/`frontend#build`
- [X] T082 [US6] Normalised `frontend.test` to `vitest run` (+ `test:watch`) so `turbo run test` does not hang in watch mode — every other workspace already meant run-once. **Vitest `projects` sharding NOT done**: the heap bump comes from NODE_OPTIONS (in globalEnv + CI), so the suite passes, but the OOM is mitigated rather than fixed. Sharding remains open (research R10)
- [X] T083 [US6] Replace `test.yml`'s zero-`needs:` fan-out with `turbo run lint test build check --filter=...[origin/main]`
- [X] T084 [US6] Document every toolchain **outside** the graph — Cypress, Slither, Medusa, Manticore, Matchstick, mkdocs, cloudbuild/gcloud, deploy/verify — in `docs/developer-guide/`. Any claim of "one task graph for the repo" would be false (FR-042)
- [X] T085 [US6] Document the `.env` cache-key limitation honestly: `hardhat.config.js:3` runs `dotenv.config()` **inside** the task process, after the hash is computed, so `AMOY_RPC_URL` in an untracked `.env` switches the test chain with no cache-key movement. Fix with `dotEnv`, or move dotenv out of config evaluation, or state the limitation (research R8)
- [X] T086 [US6] Confirm the graph does **not** become the sole merge gate while `deploy-contracts.yml` still has no test dependency (FR-043)
- [X] T087 [US6] Run quickstart S6 invalidation matrix (SC-015)

---

## Phase 9: Polish & Cross-Cutting

- [ ] T088 [P] Consolidate `contracts-archive/` (68), `test-archive/` (62), `scripts/deploy/archive/` (40), `scripts/admin/archived/` (19) under `archive/` with a README naming the retiring commit
- [ ] T089 [P] Move the ~52 scripts that target archived-only contracts alongside them
- [ ] T090 Add a CI grep asserting nothing outside `archive/` references it — mechanises a constitution rule currently held as prose
- [ ] T091 [P] Write `docs/developer-guide/monorepo.md` — the workspace layout, the target graph, what is outside it, and the `.env` caveat
- [ ] T092 [P] Add `dependabot.yml` — now possible with one lockfile; there is no vuln gate anywhere today while `npm audit` reports 53 findings (3 critical)
- [ ] T093 Update `CLAUDE.md` with the monorepo invariants (one lockfile; boundary is lint+test not manifest; mini-app bytes are on-chain-committed so hoisting changes are gated)
- [ ] T094 Request the smart-contract security review required by the constitution for the `contracts/`-touching change in US1

---

## Dependencies

```
Phase 1 (T001-T004)  ── baselines, blocking
        │
        ├─▶ US1 (T005-T018)  ─┐  independently mergeable
        │                     │
        ├─▶ US2 (T019-T030)  ─┤  independently mergeable
        │                     │
        │                     ▼
        └────────────▶ US3+US7 (T031-T056)   needs US1 (bytecode gate) + US2 (trustworthy CI)
                              │
                              ├─▶ US4 (T057-T067)   needs a workspace to publish into
                              │
                              ├─▶ US5 (T068-T075)   needs a workspace to publish into
                              │
                              └─▶ US6 (T076-T087)   needs US2's honest baseline to compare against
                                        │
                                        ▼
                                   Polish (T088-T094)
```

**Hard ordering rules**

- T008 blocks everything. A bytecode difference is an incident, not a task.
- T032, T033, T034 block T036. No baseline and no `ethers` fixture ⇒ no workspace change.
- T040 blocks finalising T039. Prove graph-cli survives before deleting its lockfile.
- T049, T050, T051 block the US3 merge.
- T062 must be its own commit, before T063.
- T077 blocks trusting any turbo cache.

## Parallel Opportunities

| Phase | Parallel set |
|---|---|
| Setup | T002, T003 |
| US1 | T005+T006; then T009, T010, T011, T013, T014, T015, T016, T017 |
| US2 | T025, T026, T027, T028, T029 |
| US3 | T041, T044, T046, T047, T048; T053 alongside |
| US4 | T066 alongside T064/T065 |
| Polish | T088, T089, T091, T092 |

Cross-story parallelism is **not** available: US1 and US2 may be developed concurrently, but US3
must not begin until both have merged.

## Implementation Strategy

**MVP = User Story 1 alone.** It is independently mergeable, requires no structural change, and
closes the defect with the worst failure mode (undeployable contracts / changed CREATE2 addresses
on 7 chains). If nothing else in this feature ships, US1 should.

**Recommended increments**

1. **US1** — one PR, zero behaviour change, hard-gated on a bytecode diff.
2. **US2** — one PR. Expect red; budget 1–2 days to clear the e2e backlog.
3. **US3 + US7** — one PR, three blocking byte gates. The highest-risk step.
4. **US4** — two commits (extract, then add `InvalidateNonce`).
5. **US5** — incremental, contract by contract; the longest phase (~3–4 weeks).
6. **US6** — `--force` observation period before any cache is trusted.
7. **Polish**.

**Total**: 94 tasks — US1 14, US2 12, US3+US7 26, US4 11, US5 8, US6 12, Setup 4, Polish 7.
