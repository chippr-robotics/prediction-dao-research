# Implementation Plan: Contract Audit Coverage Restoration & Hardening

**Branch**: `046-contract-audit-coverage` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/046-contract-audit-coverage/spec.md`

## Summary

The weekly Coverage Analysis job fails (exit 182) because 182 contract tests hit an
out-of-gas ceiling under instrumentation — the hardhat network has **no
`blockGasLimit`** (defaults to 30M, used as the per-tx gas), and the recently landed
heavy contracts (account stack, pools, two-facet gasless registry, Safe custody) push
instrumented per-tx gas past it. Separately, the `test:coverage` glob **omits whole
first-party suites** (`pools`, `account`, `intent`, `clearpath`, `custody`, `tokens`),
so those contracts read ~0% because their existing tests never run under coverage, and
`.solcover.js` emits **no istanbul summary**, so both CI workflows can't report or gate.

The approach, in dependency order: **(1)** give coverage block-gas headroom (coverage-scoped)
and keep `viaIR`; **(2)** run coverage over all first-party suites (except fork); **(3)**
emit `json-summary` and compute a **first-party-only** total via a post-filter; **(4)**
declare a tiered threshold **policy file** and enforce it with a **gate script**, wired
**blocking** into both the per-PR job (`test.yml`, security-critical scope) and the
weekly job (`torture-test.yml`, full report); **(5)** close residual gaps to hit the
tiers, prioritizing funds-handling paths and revert/guard branches. No production
contract logic or storage changes.

## Technical Context

**Language/Version**: Solidity 0.8.24 (app, `viaIR:true`, `runs:1`) + 0.8.23/paris
(vendored account closure); JS tooling on Node 22.

**Primary Dependencies**: Hardhat, `solidity-coverage@0.8.17` (istanbul under the
hood), Mocha/Chai, ethers v6; GitHub Actions (`test.yml`, `torture-test.yml`); Slither
+ Medusa (unchanged, still gating).

**Storage**: N/A (on-chain). Artifacts on disk: `coverage/coverage-summary.json`,
`coverage/lcov.info`, the policy JSON.

**Testing**: Hardhat/Mocha unit + integration + fork; coverage via `hardhat coverage`.
Test suites already present for every gap area (`test/pools`, `test/account`,
`test/intent`, `test/clearpath`, `test/custody`, `test/tokens`) — currently unmeasured.

**Target Platform**: CI (ubuntu-latest, Node 22) + local dev (`TZ=UTC` for parity).

**Project Type**: Single-project smart-contract testing/CI tooling (contracts + scripts
+ workflows). No frontend or backend surface.

**Performance Goals**: Coverage run completes within the pipeline envelope; weekly job
already ~6 min — adding suites + gas headroom must stay bounded (shard as documented
fallback if the per-PR job exceeds budget). Measurement is deterministic (SC-007).

**Constraints**: No contract behavior/storage change (keep `check:storage-layout`
green); `viaIR` must stay on (stack-too-deep risk if disabled); fork tests excluded
(need RPC); coverage-only gas settings must not alter `npm test`/gas-report; no new
backend / no footprint growth; do not weaken Slither/Medusa.

**Scale/Scope**: ~40 first-party contracts across `wagers/ pools/ account/ oracles/
access/ upgradeable/ tokens/ privacy/ clearpath/ custody/`; ~46 non-fork test files;
3 threshold tiers; 2 CI gate sites.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Security-First Smart Contracts** | ✅ Strengthens it — raises tested coverage of fund-custody/oracle/access paths. No `contracts/` logic or storage changes, so no new attack surface; EthTrust posture improves. |
| **II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE)** | ✅ This feature *is* the principle — restores trustworthy measurement and enforces comprehensive coverage of resolution/claim/refund/timeout paths and their failure branches. |
| **III. Honest State, No Mocks in Shipped Paths** | ✅ Makes the coverage number honest (first-party only). All added code is test-scoped; no mocks enter production paths. |
| **IV. Fail Loudly in CI** | ✅ Removes the current `continue-on-error: true` on the per-PR coverage step and adds a blocking gate in both workflows; Slither/Medusa untouched. |
| **V. Accessible, Consistent Frontend** | ➖ N/A — no frontend surface. |
| **Additional — upgradeable append-only / storage-layout** | ✅ No contract state touched; `check:storage-layout` stays trivially green. |
| **Additional — archived code, key mgmt, deployments** | ✅ Not touched; no keys/secrets; no deploys. |

**Result**: PASS, no violations. Complexity Tracking not required.

*Post-Phase-1 re-check*: design introduces only a policy JSON, a Node gate script, and
`.solcover.js`/`hardhat.config.js`/workflow edits — all test/CI tooling. No principle
regressed. **PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/046-contract-audit-coverage/
├── plan.md              # This file
├── spec.md              # Feature spec (+ Clarifications)
├── research.md          # Phase 0 — decisions R1–R8
├── data-model.md        # Phase 1 — coverage entities
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   └── coverage-threshold-policy.md   # policy schema + gate CLI contract
├── checklists/
│   └── requirements.md  # spec quality checklist (passing)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
.solcover.js                       # + istanbulReporter[json-summary,lcov,text]; safe skipFiles; run all non-fork suites
hardhat.config.js                  # coverage-scoped blockGasLimit + initialBaseFeePerGas:0 (COVERAGE flag)
package.json                       # test:coverage → COVERAGE=true TZ=UTC, glob = test/** minus fork
coverage-threshold-policy.json     # NEW — tiered policy + classification + baseline (single source of truth)
scripts/coverage/
└── check-thresholds.js            # NEW — gate CLI (reads summary + policy, exits non-zero on breach)

.github/workflows/test.yml         # per-PR: coverage over first-party suites + gate (--scope gated), remove continue-on-error
.github/workflows/torture-test.yml # weekly: gate (--scope all) + first-party summary to $GITHUB_STEP_SUMMARY

test/                              # expand to close residual gaps after suites are measured
├── pools/       (WagerPool deep paths: resolve matrix, per-index claim, dup-winner, sanctions)
├── account/     (ERC-1271 validation, factory create/getAddress, MultiOwnable guards)
├── oracles/     (UMA + Chainlink Functions branch coverage: resolved/unresolved/already/adapter-unset)
├── access/      (MembershipVoucher redemption branches)
├── intent/      (SignerIntentBase …WithSig/…WithAuthorization branches)
└── (existing suites simply become measured once the glob is fixed)

docs/                              # runbook note: coverage gate, policy file, deferral list
```

**Structure Decision**: Single-project layout. Changes are concentrated in coverage
config (`.solcover.js`, `hardhat.config.js`, `package.json`), one new policy file, one
new gate script under `scripts/coverage/`, two workflow edits, and additive tests under
`test/**`. No new packages, services, or contracts.

## Implementation Phasing (for /speckit-tasks)

Ordered by dependency; each phase is independently verifiable (maps to spec user stories):

1. **US1a — Restore the run** (P1): coverage-scoped block-gas headroom (R1) + include
   all non-fork suites (R2). Exit criterion: `TZ=UTC npm run test:coverage` green, 0
   OOM, WagerRegistry family non-zero. *This is the gating validation step — do first.*
2. **US2 — Honest accounting** (P2): `istanbulReporter` json-summary (R4) + safe
   `skipFiles` + first-party post-filter (R3); weekly summary shows first-party total.
3. **US3 — Enforcement** (P2): policy file + `check-thresholds.js` gate; wire blocking
   into `test.yml` (`--scope gated`, drop `continue-on-error`) and `torture-test.yml`
   (`--scope all`). Verify with a deliberately weakened test (SC-005).
4. **US4 — Close residual gaps** (P3): after suites are measured, add tests for the
   still-below-tier contracts — `WagerPool` deep paths, `account/*` integration surface
   (R7), oracle auto-resolution branches, `MembershipVoucher` redemption,
   `SignerIntentBase` intent branches — prioritizing funds-handling + revert/guard
   branches (FR-014/FR-015). Tighten the policy baseline as numbers rise.

## Complexity Tracking

No constitution violations — no entries required.
