# Contract Coverage & Audit Gates

The contract test suite carries a **tiered coverage gate** that runs on every PR and
in the weekly torture test. It restores a trustworthy coverage measurement and blocks
regressions on the security-critical, funds-handling contracts. (Spec
`046-contract-audit-coverage`.)

## How it works

```text
npm run test:coverage        COVERAGE=true TZ=UTC hardhat coverage over all non-fork suites
  │                          coverage-scoped block-gas headroom (hardhat.config.js) avoids
  │                          instrumentation "out of gas"; istanbul emits coverage-summary.json
  ▼
scripts/coverage/            first-party.js filters out vendored (account/lib/**), test
  check-thresholds.js        harnesses, mocks, and interfaces, then compares each GATED
  │                          contract to its tier in coverage-threshold-policy.json
  ▼
exit 0 pass / 1 breach / 2 bad input   → per-PR (test.yml) + weekly (torture-test.yml)
```

- **Measurement (`npm run test:coverage`)** runs the whole non-fork suite under
  instrumentation. Coverage-only network settings (`blockGasLimit`,
  `initialBaseFeePerGas`) are applied **only** when `COVERAGE=true` so `npm test` and
  the gas report stay realistic.
- **First-party accounting** is done in post-processing, not `skipFiles`, so excluding
  vendored code can't corrupt source-map attribution for the first-party contracts that
  import it.
- **The gate** (`scripts/coverage/check-thresholds.js`) prints a per-contract table and
  a derived first-party total, and exits non-zero if any gated contract is below its
  tier or the first-party total regresses below `baseline`.

## The policy file — `coverage-threshold-policy.json`

Single source of truth. Edited via PR (auditable).

| Key | Meaning |
|-----|---------|
| `tiers` | A = 95% stmts / 90% branch (funds custody & settlement); B = 90/80 (security-critical supporting); C = 80/70 (other first-party) |
| `gated` | Contracts the gate **fails** on when below tier |
| `reportOnly` | Measured and printed, but **never fail** the gate — each carries a `rationale` |
| `excluded` | Dropped from first-party accounting entirely (vendored / test / interfaces) |
| `baseline` | First-party totals that must not regress (ratcheted up as coverage rises) |

### Tiers

- **Tier A** — wager escrow (`WagerRegistry` family), group pools, `MembershipVoucher`
  redemption, oracle auto-resolution.
- **Tier B** — the deployed `account/*` wallet contracts (integration surface only —
  ERC-1271 / factory / owner management; the vendored crypto under `account/lib/**`
  stays excluded), oracle adapters, access control, gasless-intent plumbing,
  upgradeable base, `TokenFactory`.
- **Tier C** — other first-party contracts.

## Common tasks

**Run the gate locally**

```bash
TZ=UTC npm run test:coverage
node scripts/coverage/check-thresholds.js \
  --summary coverage/coverage-summary.json \
  --policy coverage-threshold-policy.json --scope gated   # per-PR set
```

**Promote a report-only contract to gated** (e.g. when a token template or
`custody/SafeProposalHub.sol` ships): move its entry from `reportOnly` to `gated` in
`coverage-threshold-policy.json`, add tests until it meets its tier, and confirm the
gate passes. Report-only exists so unlaunched code is *measured* without blocking PRs —
never leave a shipped fund-handling contract in `reportOnly`.

**Raise the bar**: after adding tests, bump `baseline` up to the achieved first-party
totals so the numbers can only go up (FR-016).

**A gated contract is missing from the summary**: the gate treats "present in the repo
but absent/untested" as a failure — add tests rather than removing it from `gated`.

## CI wiring

- **Per-PR** — `.github/workflows/test.yml` › *Smart Contract Tests*: coverage runs
  blocking (no `continue-on-error`), then the gate runs `--scope gated`.
- **Weekly** — `.github/workflows/torture-test.yml` › *Coverage Analysis*: the gate runs
  `--scope all`, printing the first-party table (incl. report-only rows) to the run
  summary and failing on any gated breach.

See `scripts/coverage/README.md` and `specs/046-contract-audit-coverage/` for the full
spec, plan, and the policy/gate interface contract.
