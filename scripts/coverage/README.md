# Coverage restore & audit-gate toolchain

Tooling for spec **046-contract-audit-coverage** — restores a trustworthy contract
coverage measurement and enforces tiered thresholds on the security-critical set.

## Pipeline

```text
hardhat coverage            → instruments contracts, runs all non-fork suites
  (COVERAGE=true, TZ=UTC)      with coverage-scoped block-gas headroom (hardhat.config.js)
        │
        ▼
.solcover.js                → istanbulReporter [json-summary, lcov, text]
        │                       produces coverage/coverage-summary.json
        ▼
lib/first-party.js          → derives the FIRST-PARTY view of the summary,
        │                       excluding vendored (account/lib/**), test, mocks, interfaces
        ▼
check-thresholds.js         → compares each gated contract to its tier in
                              coverage-threshold-policy.json; exits non-zero on breach
```

## Files

| File | Role |
|------|------|
| `../../coverage-threshold-policy.json` | Single source of truth: tiers, gated/report-only/excluded, baseline |
| `lib/first-party.js` | Pure filter/aggregator over `coverage-summary.json` (first-party derived total) |
| `check-thresholds.js` | Gate CLI: `--summary --policy --scope gated\|all`; exit 0 pass / 1 breach / 2 bad input |

## Usage

```bash
# 1. produce coverage/coverage-summary.json
TZ=UTC npm run test:coverage

# 2a. per-PR gate (security-critical set) — used by .github/workflows/test.yml
node scripts/coverage/check-thresholds.js \
  --summary coverage/coverage-summary.json \
  --policy coverage-threshold-policy.json --scope gated

# 2b. weekly full report — used by .github/workflows/torture-test.yml
node scripts/coverage/check-thresholds.js \
  --summary coverage/coverage-summary.json \
  --policy coverage-threshold-policy.json --scope all
```

See `specs/046-contract-audit-coverage/` for the spec, plan, and the policy/gate
interface contract (`contracts/coverage-threshold-policy.md`).
