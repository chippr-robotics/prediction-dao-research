# Phase 0 Research: Contract Audit Coverage Restoration & Hardening

**Feature**: 046-contract-audit-coverage
**Date**: 2026-07-10

This document resolves the technical unknowns behind the failing weekly Coverage
Analysis job and the coverage gaps, and records the decisions the plan builds on.
All findings are grounded in the current repo state (`.solcover.js`,
`hardhat.config.js`, `package.json`, the two CI workflows, and the 2026-07-06 vs
2026-06-29 torture-test runs).

---

## R1 — Root cause of the 182 "Transaction ran out of gas" failures

**Decision**: The instrumentation-induced out-of-gas failures are a **block-gas-limit
ceiling problem**, not a bug in the tests or the contracts. Fix by giving the
coverage run explicit block-gas headroom, scoped to coverage only.

**Evidence / rationale**:
- `networks.hardhat` in `hardhat.config.js` sets `allowUnlimitedContractSize: true`
  but **never sets `blockGasLimit`**, so it defaults to **30,000,000**. Hardhat uses
  the block gas limit as the *default per-transaction gas* when a call doesn't
  specify one, and surfaces exhaustion as `ProviderError: Transaction ran out of gas`
  — exactly the observed error.
- The `.solcover.js` `providerOptions.gasLimit: 0xfffffffffff` is a **ganache-era
  relic**; solidity-coverage 0.8.x runs the *Hardhat* network and does not apply
  `providerOptions` to the hardhat network's block gas limit. So the 30M default
  binds during coverage despite that setting.
- The app compiles with **`viaIR: true`, `optimizer.runs: 1`** (size-optimized).
  Under coverage, solidity-coverage reduces optimization (`solcOptimizerDetails`
  with most passes off) so instrumented runtime gas per call is far higher than in a
  normal `npm test` run.
- The 2026-06-29 run passed (338 passing, 0 OOM) at the same 30M limit; between then
  and 2026-07-06 the heavy account stack (spec 041: Coinbase wallet + FreshCryptoLib
  elliptic-curve math, pinned `0.8.23`/paris), group pools, the two-facet gasless
  registry, and Safe custody landed — pushing instrumented per-tx gas for 182
  escrow/oracle/account tests past 30M.

**Chosen fix**: In `hardhat.config.js`, detect coverage mode
(`process.env.COVERAGE === "true" || process.argv.includes("coverage")`) and, only
then, raise `networks.hardhat.blockGasLimit` to a large value (e.g. `0x1fffffffffffff`)
and set `initialBaseFeePerGas: 0` so max-gas transactions don't fail on fee-vs-balance.
Set `COVERAGE=true` in the `test:coverage` npm script. Normal test/gas-report runs
keep the realistic default so genuine gas regressions stay visible.

**Alternatives considered**:
- *Disable `viaIR` for coverage* — rejected: the heavy contracts rely on viaIR to
  avoid "stack too deep"; a coverage-only non-viaIR compile risks failing to compile
  and diverges instrumented code from production codegen.
- *Split the coverage run into shards* — rejected as the primary fix (adds CI
  complexity); kept as a fallback only if headroom alone proves insufficient.

**Validation**: This is a strong, evidence-backed hypothesis but the exact block-gas
value must be confirmed by running `npm run test:coverage` locally/CI to green (see
quickstart.md). Task list includes this as the first, gating validation step.

---

## R2 — The coverage run silently omits whole first-party test suites

**Decision**: Run coverage over **all first-party test suites**, not the current
narrow glob. Exclude only fork tests (they need a live RPC).

**Evidence / rationale**:
- `test:coverage` today is
  `hardhat coverage --testfiles '{test/*.test.js,test/access/*.test.js,test/upgradeable/*.test.js,test/oracles/*.test.js,test/integration/**/*.test.js}'`.
- That glob **omits** `test/pools/` (6 files), `test/account/` (3), `test/intent/`
  (3), `test/clearpath/` (1), `test/custody/` (1), and `test/tokens/` (8). Those
  suites **exist** but never run under coverage — which is why `WagerPool` (3%),
  `account/*` (0%), `ExternalDAORegistry` (0%), and `SignerIntentBase` (52%, only
  incidentally exercised) report so low. A large share of the "gap" is *unmeasured
  existing tests*, not missing tests.
- `test/fork/` (3 files) needs `AMOY_RPC_URL` and belongs to the separate
  `test:fork` / `oracle-fork-tests.yml` flow; it stays out of the standard coverage
  run.

**Chosen fix**: Change `test:coverage` to cover `test/**/*.test.js` **excluding**
`test/fork/**` (via `--testfiles` glob or `.solcover.js` handling). This must land
together with R1 — adding the pools/account suites increases per-tx gas, so the gas
headroom is a prerequisite.

**Alternatives considered**: keep the narrow glob and only add named dirs — rejected;
an allow-list drifts (this is how the omission happened). Prefer "all except fork."

---

## R3 — Measure first-party code only (honest accounting)

**Decision**: Instrument broadly but compute the reported total and thresholds from a
**first-party-filtered** view. Use two complementary mechanisms:
1. `skipFiles` in `.solcover.js` for code that no measured contract's source-map
   attribution depends on being instrumented.
2. A **post-processing filter** over the istanbul summary for the accounting/threshold
   step, excluding vendored + test-only paths regardless of instrumentation.

**Evidence / rationale**:
- The existing `.solcover.js` comment documents a real hazard: adding whole
  directories to `skipFiles` (specifically `contracts/test/*`) **corrupts
  source-map attribution** for the production contracts those harnesses import,
  collapsing e.g. WagerRegistry to ~5%. So `skipFiles` cannot be used naively.
- The first-party wallet contracts (`account/CoinbaseSmartWallet.sol`, `ERC1271.sol`,
  `MultiOwnable.sol`, `CoinbaseSmartWalletFactory.sol`) **import** the vendored
  `account/lib/**` (FreshCryptoLib, solady, webauthn-sol, account-abstraction).
  Skipping `account/lib/**` risks the same attribution problem for the wallet
  contracts we DO want to measure.
- Therefore the robust approach for the *reported number and gate* is a filter on the
  istanbul `coverage-summary.json`, keeping instrumentation intact.

**Excluded from first-party accounting** (each with documented rationale):
- `contracts/account/lib/**` — vendored third-party crypto/AA/util libraries.
- `contracts/test/**`, `contracts/mocks/**` — test-only harnesses & mocks.
- `contracts/**/interfaces/**` and interface-only `.sol` — no executable logic.
- `contracts-archive/**` — reference only (never deployed; already out of compile).

**Included** (first-party, gated or report-only per clarifications): `wagers/`,
`pools/` (excl. `SemaphoreDeploy` vendored closure), `account/*` top-level wallet
contracts (Tier B), `oracles/*` adapters, `access/*`, `upgradeable/*`, `tokens/*`
(report-only where not launched), `privacy/*`, `clearpath/ExternalDAORegistry`
(report-only), `custody/*`.

**Alternatives considered**: rely solely on `skipFiles` — rejected (attribution
hazard). Rely solely on the post-filter without any `skipFiles` — acceptable, but we
still `skipFiles` the safe, self-contained vendored dirs to cut instrumentation time.

---

## R4 — Emit a machine-readable summary and enforce thresholds

**Decision**: Configure solidity-coverage's `istanbulReporter` to include
`json-summary` (plus `lcov` and `text`), then enforce tiers with a small first-party
gate script that reads `coverage/coverage-summary.json`.

**Evidence / rationale**:
- Both `test.yml` and `torture-test.yml` already try to read
  `coverage/coverage-summary.json`, but `.solcover.js` configures **no
  `istanbulReporter`**, so that file is never produced and every summary step falls
  through to "not available." Adding `istanbulReporter: ['json-summary', 'lcov',
  'text']` fixes the summary for free.
- The threshold policy is expressed as a checked-in machine-readable file (see
  `contracts/coverage-threshold-policy.md`). A gate script maps each first-party
  contract to its tier, compares per-file `statements`/`branches` pct against the
  tier minima, prints a table of pass/fail, and exits non-zero on any breach in the
  **gated** set (report-only contracts are printed but never fail the gate).

**Alternatives considered**: solidity-coverage's built-in global thresholds — rejected;
they're a single global bar and can't express per-contract tiers or report-only
deferrals. istanbul/nyc `check-coverage` per-glob — viable but less transparent than an
explicit policy file + table; rejected for auditability.

---

## R5 — Where the gate runs (per-PR + weekly)

**Decision**: Enforce in **two** places, both blocking:
- **Per-PR** — in `test.yml`'s `smart-contract-tests` job: generate coverage over all
  first-party suites, then run the gate against the **gated security-critical set**.
  Remove the current `continue-on-error: true` from the coverage step.
- **Weekly** — in `torture-test.yml`'s `coverage-report` job: run the gate over the
  **full first-party report** and emit the first-party summary.

**Evidence / rationale**:
- Today `test.yml` runs `npm run test:coverage` with **`continue-on-error: true`** —
  a silent coverage step that violates the intended "fail loudly" gate (constitution
  IV). The weekly `coverage-report` job has no `continue-on-error` (it *did* fail the
  run), so it only needs the gate + summary added.
- Per-PR catches regressions before merge (SC-009); weekly provides the full-report
  audit view. Both reuse the same gate script and policy file (single source of truth).

**Performance note**: adding the pools/account/tokens suites lengthens the per-PR
coverage job. Mitigation options captured for planning: run the per-PR coverage job in
parallel with the existing test job (already a separate concern), and — if wall-clock
is a problem — scope the per-PR *gate* to the security-critical set while still
instrumenting everything. Fork tests remain excluded. Target: per-PR coverage job
stays within the existing pipeline's time envelope; if it can't, shard as a documented
fallback (log what is deferred — no silent caps).

---

## R6 — Determinism & local/CI parity

**Decision**: Make coverage runs deterministic and reproducible; run under `TZ=UTC`.

**Evidence / rationale**:
- Some tests are timezone-sensitive (documented: `SetTimeModal` and datetime-local
  strings assume UTC); CI runs UTC, this dev box runs CDT. Contract coverage is mostly
  TZ-independent, but the gate must give the same verdict locally and in CI (SC-007),
  so the documented `TZ=UTC` convention is adopted for the coverage npm script/runbook.
- No `Date.now()`/randomness in the gate; block gas headroom is fixed, not derived.

---

## R7 — account/* Tier B integration surface (what to actually cover)

**Decision**: For the deployed wallet contracts, cover the **surface FairWins invokes**
to Tier B (≥90% stmts / ≥80% branches), not the upstream crypto internals.

**Surface to cover** (from the deployed usage + existing `test/account/` suites):
- `ERC1271.isValidSignature` / `replaySafeHash` (the intent-signing path used by
  gasless flows and passkey login) incl. invalid-signature and wrong-hash reverts.
- `CoinbaseSmartWalletFactory.createAccount` / `getAddress` (deterministic deploy),
  incl. already-deployed and owner-set branches.
- `MultiOwnable` add/remove owner, `onlyOwner` guard reverts, owner-index paths.
- `CoinbaseSmartWallet.execute`/`executeBatch` entrypoints as invoked, and the
  signature-validation reverts.
- The deeper `account/lib/**` elliptic-curve/webauthn/solady internals stay **excluded**
  (R3); they carry upstream Coinbase/Solady audits.

**Rationale**: These are the branches FairWins can break through its own configuration
and calls; exhaustively re-testing vendored secp256r1/webauthn math is low-value and
out of scope per the clarification.

---

## R8 — Constraints confirmed (no-behavior-change guardrails)

**Decision / findings**:
- No production contract logic or storage changes are required to hit coverage —
  every lever is test code, `.solcover.js`, coverage-scoped `hardhat.config.js`
  network settings, CI job definitions, a policy file, a gate script, and docs. This
  keeps `check:storage-layout` trivially green and honors constitution I & the
  upgradeable append-only rule.
- Slither/Medusa jobs are untouched and continue to gate.
- The coverage-only `blockGasLimit`/`initialBaseFeePerGas` overrides do not affect
  `npm test` gas reporting or deployed behavior (test-network settings only).

---

## Summary of decisions

| # | Decision |
|---|----------|
| R1 | Fix OOM via coverage-scoped `blockGasLimit` headroom + `initialBaseFeePerGas: 0`; keep viaIR. |
| R2 | Coverage runs all first-party suites (`test/**` except `test/fork/**`). |
| R3 | First-party-only accounting via istanbul-summary post-filter (+ safe `skipFiles`); exclude `account/lib/**`, `test`, `mocks`, interfaces, archive. |
| R4 | Add `istanbulReporter: ['json-summary','lcov','text']`; enforce tiers with a policy-file-driven gate script. |
| R5 | Gate per-PR (security-critical set, remove `continue-on-error`) **and** weekly (full report). |
| R6 | Deterministic, `TZ=UTC`, local/CI parity. |
| R7 | account/* Tier B = integration surface (ERC-1271, factory, owner mgmt), not vendored crypto. |
| R8 | No contract behavior/storage change; Slither/Medusa preserved. |
