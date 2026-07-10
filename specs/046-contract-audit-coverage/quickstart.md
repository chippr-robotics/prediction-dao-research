# Quickstart & Validation: Contract Audit Coverage Restoration & Hardening

**Feature**: 046-contract-audit-coverage
**Date**: 2026-07-10

Runnable scenarios that prove the feature works end-to-end. See
[research.md](./research.md) for the why, [contracts/coverage-threshold-policy.md](./contracts/coverage-threshold-policy.md)
for the policy/gate interface, and [data-model.md](./data-model.md) for the artifacts.

## Prerequisites

- Node 22, repo deps installed (`npm ci`).
- Contracts compile (`npm run compile`).
- Run coverage under `TZ=UTC` for local/CI parity (see research R6).

## Scenario 1 — Coverage runs green with no out-of-gas (US1 / SC-001, SC-002)

```bash
TZ=UTC npm run test:coverage
```

**Expected**:
- Exit code 0; **zero** `Transaction ran out of gas` failures (down from 182).
- `contracts/wagers/WagerRegistry.sol`, `WagerRegistryCore.sol`,
  `WagerRegistryIntents.sol` each report a real, non-zero figure (not 0%).
- `test/pools/**`, `test/account/**`, `test/intent/**`, `test/clearpath/**`,
  `test/tokens/**` all execute (previously omitted from the coverage glob).
- `coverage/coverage-summary.json` now exists (istanbul `json-summary`).

**If it still OOMs**: increase the coverage-only `blockGasLimit` in
`hardhat.config.js` (research R1) and re-run; this is the first validation gate.

## Scenario 2 — Determinism (SC-007)

```bash
TZ=UTC npm run test:coverage && cp coverage/coverage-summary.json /tmp/cov-a.json
TZ=UTC npm run test:coverage && diff <(jq -S . /tmp/cov-a.json) <(jq -S . coverage/coverage-summary.json)
```

**Expected**: no diff — identical per-file numbers over unchanged code.

## Scenario 3 — First-party-only accounting (US2 / SC-003)

```bash
node scripts/coverage/check-thresholds.js --summary coverage/coverage-summary.json \
  --policy coverage-threshold-policy.json --scope all
```

**Expected**: the printed **First-party total** excludes `account/lib/**`,
`contracts/test/**`, `contracts/mocks/**`, and interfaces; the number is the
first-party figure (not istanbul's vendored-diluted blend). Every `reportOnly`
contract appears in the table but is marked `report-only`.

## Scenario 4 — Gate fails loudly on a regression (US3 / SC-005, SC-009)

```bash
# Temporarily skip a security-critical test, e.g. comment out a WagerPool claim test
TZ=UTC npm run test:coverage
node scripts/coverage/check-thresholds.js --summary coverage/coverage-summary.json \
  --policy coverage-threshold-policy.json --scope gated; echo "exit=$?"
```

**Expected**: `exit=1`, with a line naming the contract and metric
(e.g. `contracts/pools/WagerPool.sol ... FAIL (stmts ..<95, branch ..<90)`).
Restore the test → gate exits `0`.

## Scenario 5 — Thresholds met across the gated set (US4 / SC-004, SC-006, SC-008)

```bash
TZ=UTC npm run test:coverage
node scripts/coverage/check-thresholds.js --summary coverage/coverage-summary.json \
  --policy coverage-threshold-policy.json --scope gated; echo "exit=$?"
```

**Expected**: `exit=0`; every gated contract meets its tier; first-party total ≥ the
2026-06-29 baseline (56.68 / 48.88 / 58.05 / 62.28). Spot-check that funds-handling
revert/guard branches (access-control, deadline, sanctions, already/not-resolved
oracle states) each have a covering test.

## Scenario 6 — CI parity (US1 / SC-007)

- **Per-PR**: open a PR; `test.yml` › *Smart Contract Tests* runs coverage + the gate
  (`--scope gated`) as a **blocking** step (no `continue-on-error`).
- **Weekly**: `torture-test.yml` › *Coverage Analysis* runs the gate (`--scope all`),
  prints the first-party table to the run summary, and fails on a breach.

**Expected**: local and CI give the same pass/fail verdict.

## Guardrail checks (must stay green)

```bash
npm run check:storage-layout   # unchanged — no contract storage touched
npm test                       # normal run unaffected by coverage-only gas settings
# Slither/Medusa jobs unchanged (weekly torture test)
```
