# Interface Contract: Coverage Threshold Policy & Gate

**Feature**: 046-contract-audit-coverage
**Date**: 2026-07-10

This feature exposes two internal interfaces: (1) a checked-in **policy file** that
declares the tiered thresholds and per-contract classification, and (2) a **gate CLI**
that consumes the policy + istanbul summary and returns a pass/fail verdict. Both are
consumed by CI (per-PR and weekly) and by developers locally.

---

## 1. Policy file — `coverage-threshold-policy.json`

**Location**: repo root or `scripts/coverage/` (finalized in tasks). Single source of
truth; edited via PR (auditable).

### Schema

```jsonc
{
  "tiers": {
    "A": { "minStatements": 95, "minBranches": 90 },
    "B": { "minStatements": 90, "minBranches": 80 },
    "C": { "minStatements": 80, "minBranches": 70 }
  },
  "baseline": {                       // FR-016 — first-party totals must not regress
    "statements": 56.68, "branches": 48.88, "functions": 58.05, "lines": 62.28,
    "source": "torture-test run 28345700846 (2026-06-29)"
  },
  "gated": [                          // fails the gate when below tier
    { "path": "contracts/wagers/WagerRegistry.sol",           "tier": "A" },
    { "path": "contracts/wagers/WagerRegistryCore.sol",       "tier": "A" },
    { "path": "contracts/wagers/WagerRegistryIntents.sol",    "tier": "A" },
    { "path": "contracts/pools/WagerPool.sol",                "tier": "A" },
    { "path": "contracts/pools/WagerPoolFactory.sol",         "tier": "A" },
    { "path": "contracts/access/MembershipVoucher.sol",       "tier": "A" },
    { "path": "contracts/oracles/PolymarketOracleAdapter.sol",           "tier": "B" },
    { "path": "contracts/oracles/ChainlinkDataFeedOracleAdapter.sol",    "tier": "B" },
    { "path": "contracts/oracles/ChainlinkFunctionsOracleAdapter.sol",   "tier": "B" },
    { "path": "contracts/oracles/UMAOptimisticOracleV3Adapter.sol",      "tier": "B" },
    { "path": "contracts/access/MembershipManager.sol",       "tier": "B" },
    { "path": "contracts/access/SanctionsGuard.sol",          "tier": "B" },
    { "path": "contracts/access/VoucherBatchMinter.sol",      "tier": "B" },
    { "path": "contracts/account/CoinbaseSmartWallet.sol",        "tier": "B" },
    { "path": "contracts/account/ERC1271.sol",                   "tier": "B" },
    { "path": "contracts/account/MultiOwnable.sol",              "tier": "B" },
    { "path": "contracts/account/CoinbaseSmartWalletFactory.sol","tier": "B" },
    { "path": "contracts/upgradeable/SignerIntentBase.sol",   "tier": "B" },
    { "path": "contracts/upgradeable/UUPSManaged.sol",        "tier": "B" },
    { "path": "contracts/tokens/TokenFactory.sol",            "tier": "B" },
    { "path": "contracts/privacy/KeyRegistry.sol",            "tier": "B" },
    { "path": "contracts/privacy/BackupPointerRegistry.sol",  "tier": "B" }
    // custody/SafeProposalHub.sol (spec 043) added here once its launch status is confirmed
  ],
  "reportOnly": [                     // measured + printed, never fails the gate (FR-013a)
    { "path": "contracts/tokens/templates/OpenERC20.sol",     "tier": "C", "rationale": "template not on active launch path" },
    { "path": "contracts/tokens/templates/OpenERC20V2.sol",   "tier": "C", "rationale": "template not on active launch path" },
    { "path": "contracts/tokens/templates/OpenERC721.sol",    "tier": "C", "rationale": "template not on active launch path" },
    { "path": "contracts/tokens/templates/OpenERC721V2.sol",  "tier": "C", "rationale": "template not on active launch path" },
    { "path": "contracts/tokens/templates/RestrictedERC20.sol",   "tier": "C", "rationale": "template not on active launch path" },
    { "path": "contracts/tokens/templates/RestrictedERC20V2.sol", "tier": "C", "rationale": "template not on active launch path" },
    { "path": "contracts/clearpath/ExternalDAORegistry.sol",  "tier": "C", "rationale": "connector not yet launched (spec 042 native DAOs deferred)" },
    { "path": "contracts/account/utils/ERC1271InputGenerator.sol", "tier": "C", "rationale": "offchain helper; not a fund-custody path" }
  ],
  "excluded": [                       // dropped from first-party accounting entirely
    { "pathGlob": "contracts/account/lib/**",   "reason": "vendored FreshCryptoLib/solady/webauthn/account-abstraction" },
    { "pathGlob": "contracts/pools/SemaphoreDeploy.sol", "reason": "vendored Semaphore self-deploy closure" },
    { "pathGlob": "contracts/test/**",          "reason": "test-only fuzz/mocks harnesses" },
    { "pathGlob": "contracts/mocks/**",         "reason": "test-only mocks" },
    { "pathGlob": "contracts/**/interfaces/**", "reason": "no executable logic" }
  ]
}
```

> The exact gated/reportOnly membership above is the **initial proposal** derived from
> the current tree and the clarifications; `/speckit-tasks` may adjust individual
> entries (e.g. confirm `custody/SafeProposalHub.sol` gating, split oracle
> auto-resolution paths into Tier A) but the tier definitions and buckets are fixed.

---

## 2. Gate CLI — `scripts/coverage/check-thresholds.js`

**Invocation**:
```bash
node scripts/coverage/check-thresholds.js \
  --summary coverage/coverage-summary.json \
  --policy  coverage-threshold-policy.json \
  [--scope gated|all]        # gated = per-PR security-critical; all = weekly full report
```

**Inputs**:
- `--summary`: istanbul `coverage-summary.json` produced by the instrumented run.
- `--policy`: the policy file above.
- `--scope`: `gated` (default, per-PR) evaluates only `gated` entries; `all` (weekly)
  additionally prints `reportOnly` rows and the full first-party total.

**Behavior**:
1. Build the first-party file set (policy `gated` + `reportOnly`, minus `excluded`).
2. Recompute the **derived first-party total** from those files only.
3. For each `gated` entry: look up per-file `statements.pct` / `branches.pct`; compare
   to its tier minima. A gated contract absent from the summary ⇒ violation.
4. Print a full table (path · tier · stmts% · branch% · required · status) — always,
   even on success.
5. Check `firstPartyTotal ≥ baseline` (FR-016).
6. Exit **0** iff no gated violations **and** baseline holds; else exit **1** with a
   one-line-per-violation summary naming contract + metric + actual-vs-required.

**Output contract** (stdout, human + greppable):
```text
COVERAGE GATE (scope=gated)
path                                         tier  stmts  branch  required     status
contracts/wagers/WagerRegistry.sol            A    96.2   91.0    95/90        pass
contracts/pools/WagerPool.sol                 A    62.0   40.0    95/90        FAIL (stmts 62.0<95, branch 40.0<90)
...
First-party total: stmts 71.3% / branch 61.2% (baseline 56.68/48.88: OK)
RESULT: FAIL — 1 gated contract below threshold
```

**Exit codes**: `0` pass · `1` threshold/baseline violation · `2` bad input
(missing summary/policy, unresolved path) — CI treats `1` and `2` as failing.

**Consumers**:
- **Per-PR** (`test.yml` › `smart-contract-tests`): `--scope gated`; step is blocking
  (no `continue-on-error`); coverage artifact still uploaded on failure.
- **Weekly** (`torture-test.yml` › `coverage-report`): `--scope all`; also feeds the
  `$GITHUB_STEP_SUMMARY` first-party table.
