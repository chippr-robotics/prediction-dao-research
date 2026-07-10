# Feature Specification: Contract Audit Coverage Restoration & Hardening

**Feature Branch**: `046-contract-audit-coverage`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Based on the latest weekly torture test of smart contracts we have several failures for coverage. Restore and harden solid audit coverage across the contracts."

## Overview

The weekly **Weekly Torture Test** is the project's standing safety net for the
smart contracts. Its **Coverage Analysis** job is currently **failing**: in the
latest run (2026-07-06, run `28764296740`) the coverage step exited with code
**182** because **182 contract tests fail with "Transaction ran out of gas"**
under coverage instrumentation. Because those failing tests are exactly the ones
exercising the core escrow contracts, the report shows the **wager escrow family
(`WagerRegistry`, `WagerRegistryCore`, `WagerRegistryIntents`) at 0%**, and the
blended total dropped from **56.68%** (last green run, 2026-06-29) to **31.21%**.

Two problems are entangled here and this feature addresses both:

1. **The measurement is broken and untrustworthy.** The weekly safety net is red,
   so contract regressions can land unnoticed, and no reliable coverage number
   exists for the funds-handling contracts.
2. **Real coverage gaps exist on live, funds-handling contracts** — group wager
   pools (`WagerPool` at ~3%, LIVE on Mordor), passkey/smart accounts
   (`account/*` at 0%, deployed on Polygon), oracle adapters, membership vouchers,
   and gasless-intent plumbing — which is unacceptable audit risk for code that
   escrows real value on Polygon mainnet (137) and Mordor testnet.

This work restores a trustworthy coverage measurement, scopes it to code the
project actually owns, sets and enforces coverage thresholds for security-critical
contracts, and closes the gaps — bringing the contract suite to an audit-ready
coverage baseline. It is a **testing / measurement / audit-readiness** feature: it
MUST NOT alter on-chain contract behavior or storage layout to chase a number.

## Clarifications

### Session 2026-07-10

- Q: How should coverage treat the vendored-but-deployed `account/*` smart wallets (Coinbase/Solady-adapted, live on Polygon, custody funds)? → A: Include them at **Tier B** — cover the integration surface FairWins actually invokes (ERC-1271 signature validation, factory create, owner management) to ≥90% statements / ≥80% branches; the deeper vendored crypto libraries under `account/lib/**` (FreshCryptoLib, account-abstraction, solady, webauthn-sol) remain excluded.
- Q: Which lower-priority first-party contracts does the CI gate block on (vs. report-only)? → A: **Gate the live / launch-path contracts only.** Not-yet-launched token templates (`OpenERC20`/`OpenERC20V2`, `OpenERC721`/`OpenERC721V2`, `RestrictedERC20`/`RestrictedERC20V2`) and `clearpath/ExternalDAORegistry` are measured and included in the first-party report but are NOT gated this round, each with a documented deferral rationale; they move into the gated set when they ship.
- Q: Which coverage threshold model is enforced? → A: The **tiered** model — Tier A (funds custody & settlement) ≥95% statements/lines / ≥90% branches; Tier B (security-critical supporting, incl. the deployed `account/*` wallet contracts) ≥90% / ≥80%; Tier C (other first-party) ≥80% / ≥70%, applied as report-only where deferred per the scope decision above.
- Q: Where does the coverage gate run and block? → A: **Both** — a blocking per-PR gate on the security-critical set (catches regressions before merge) and the weekly torture test gating the full first-party report.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restore a trustworthy coverage run (Priority: P1)

A maintainer or security reviewer runs the coverage suite (locally or via the
weekly torture test) and gets a **complete, green report** in which every
first-party contract — including the core wager escrow family — is actually
exercised and reports a real percentage, with **zero "out of gas" test failures**
caused by instrumentation.

**Why this priority**: Nothing else in this feature can be trusted until the
measurement works. Today the number for the single most important contract
(`WagerRegistry`) is a false 0%, and the whole job fails. This is the MVP: restore
the safety net and produce numbers that reflect reality.

**Independent Test**: Run the coverage suite against the current contracts and
confirm (a) it exits successfully, (b) no test fails with "Transaction ran out of
gas", and (c) `WagerRegistry`, `WagerRegistryCore`, and `WagerRegistryIntents`
each report a non-zero, plausible coverage figure that is consistent between
consecutive runs.

**Acceptance Scenarios**:

1. **Given** the current contract set with coverage instrumentation applied,
   **When** the coverage suite is executed, **Then** it completes with a success
   exit code and produces a coverage report.
2. **Given** the coverage run, **When** the results are inspected, **Then** no test
   fails with an out-of-gas error attributable to instrumentation, and the
   previously-affected escrow/oracle tests pass.
3. **Given** the two-facet wager registry (main implementation plus intents
   facet behind one proxy), **When** coverage runs, **Then** both facets are
   exercised through the merged-ABI proxy path and both report real coverage.
4. **Given** two consecutive coverage runs with no code change, **When** their
   per-file numbers are compared, **Then** they are identical (deterministic,
   reproducible measurement).

---

### User Story 2 - Measure first-party code only, and report it honestly (Priority: P2)

A maintainer reading the weekly torture-test summary sees a coverage total and
per-area breakdown that reflect **only the code the project owns**. Vendored /
third-party code and test-only harnesses do not dilute or distort the headline
number, and the summary is accurate enough to act on.

**Why this priority**: The current blended total (31.21%) is meaningless for
decision-making because it mixes in vendored libraries (`account/lib/**`:
FreshCryptoLib, account-abstraction, solady, webauthn-sol) and test-only fuzz
harnesses. An honest first-party number is a prerequisite for setting and
enforcing meaningful thresholds (US3) and for auditors to trust the figure.

**Independent Test**: Run coverage and confirm the reported total and per-area
breakdown exclude vendored third-party libraries and test-only harnesses from the
accounting, while first-party production contracts remain included; confirm the
weekly summary shows this first-party number rather than the diluted blend.

**Acceptance Scenarios**:

1. **Given** vendored third-party code under `account/lib/**` (and any other
   imported third-party code), **When** coverage is computed, **Then** that code is
   excluded from the coverage accounting and from any threshold evaluation, with the
   exclusion list documented and justified.
2. **Given** test-only fuzz/mocks harnesses that must remain compiled (so
   source-map attribution for the production contracts they import stays correct),
   **When** coverage is computed, **Then** those harnesses are excluded from the
   first-party accounting even though they are not removed from compilation.
3. **Given** a completed weekly torture test, **When** a maintainer opens the run
   summary, **Then** the coverage section reports the first-party statements /
   branches / functions / lines totals (not the vendored-diluted blend) in a
   human-readable form.

---

### User Story 3 - Enforce coverage thresholds automatically, failing loudly (Priority: P2)

When a change lowers coverage of a security-critical contract below its required
threshold — or adds a new security-critical contract with insufficient tests — the
pipeline **fails loudly** and identifies exactly which contract and metric fell
short, so the regression cannot merge or pass silently.

**Why this priority**: A one-time coverage cleanup rots without enforcement. The
project constitution requires comprehensive coverage (Principle II) and loud CI
(Principle IV); the coverage job must actively gate on thresholds, not merely
render a report. This prevents the exact silent regression that let the escrow
number reach a false 0% in the weekly run.

**Independent Test**: Temporarily remove or weaken a test for a security-critical
contract, run the coverage gate, and confirm it fails with a clear message naming
the contract and the metric/threshold breached; restore the test and confirm the
gate passes.

**Acceptance Scenarios**:

1. **Given** a defined per-tier coverage threshold policy, **When** any
   security-critical first-party contract falls below its threshold, **Then** the
   coverage gate fails (non-zero exit, no `continue-on-error`) and names the
   offending contract and metric.
2. **Given** a new first-party contract in a security-critical area added without
   adequate tests, **When** the coverage gate runs, **Then** it fails rather than
   silently passing with the new contract uncovered.
3. **Given** the coverage gate is part of CI, **When** it fails, **Then** the
   failure blocks the relevant pipeline (it is not an auxiliary/optional step) and
   the report artifact is still uploaded for inspection.

---

### User Story 4 - Close the coverage gaps on funds-handling and security-critical contracts (Priority: P3)

An auditor reviewing the contract suite finds that every security-critical
first-party contract meets its coverage threshold, with the **funds-handling and
settlement paths and the revert/guard branches** demonstrably exercised — not just
happy paths.

**Why this priority**: This is the substantive "solid audit coverage" work. It
depends on US1–US3 (you cannot close gaps you cannot measure or enforce). It is
prioritized after them because the enforcement mechanism defines "done," and the
gap-closing can then proceed contract-by-contract against a stable target.

**Independent Test**: For each security-critical contract, confirm its coverage
meets the threshold and that named high-risk paths (create/accept/claim/refund/
cancel/draw for wagers; join/resolve/claim for pools; oracle auto-resolution;
voucher redemption; account signature-validation / ERC-1271) and their failure
branches are covered by tests.

**Acceptance Scenarios**:

1. **Given** the wager escrow family, **When** coverage is measured, **Then** the
   create, accept, claim, refund, cancel, and draw paths — and their revert
   conditions (access-control, deadline, already-resolved/not-resolved states) —
   are exercised and the contracts meet their threshold.
2. **Given** the group wager pools (`WagerPool` / `WagerPoolFactory`), **When**
   coverage is measured, **Then** join, resolve (creator-proposed payout matrix
   and member approval to threshold), and per-index claim paths — including
   duplicate-winner and sanctions-guard branches — are exercised and meet the
   threshold.
3. **Given** the passkey / smart-account contracts (`account/*`), **When**
   coverage is measured, **Then** signature validation, ERC-1271, and owner-management
   paths and their reverts are exercised (currently 0%) and meet the threshold.
4. **Given** the oracle adapters (Polymarket, Chainlink Data Feed, Chainlink
   Functions, UMA), **When** coverage is measured, **Then** the resolved,
   unresolved, already-resolved, and adapter-unset branches of auto-resolution are
   exercised and branch coverage meets the threshold.
5. **Given** access-control and gasless-intent plumbing (`MembershipManager`,
   `MembershipVoucher`, `SanctionsGuard`, `SignerIntentBase` and the `…WithSig` /
   `…WithAuthorization` twins), **When** coverage is measured, **Then** redemption,
   signature-intent, and authorization paths and their reverts meet the threshold.

---

### Edge Cases

- **Contract at the 24 KB code-size limit under instrumentation**: instrumentation
  inflates bytecode and per-transaction gas; the measurement MUST still complete
  for such contracts (this is the current out-of-gas root cause) without disabling
  the contracts' real behavior.
- **Vendored library that a first-party contract imports**: the library is compiled
  (so imports resolve and source maps stay correct) but excluded from the coverage
  accounting and thresholds.
- **Test-only harness (`contracts/test/*` fuzz/mocks)**: must remain compiled (not
  added to skip lists that would corrupt source-map attribution for the production
  contracts they import), yet must not count toward or against first-party coverage.
- **Interfaces and abstract-only files**: report as trivially covered and are not
  subject to threshold gating.
- **A newly added first-party contract with no tests**: the gate treats "file
  present, ~0% covered" in a security-critical area as a failure, not an omission.
- **Contract intentionally deferred from gating** (e.g., a token template or
  `ExternalDAORegistry` not yet on the launch path): measured and reported but not
  gated this round, allowed only with an explicit, documented deferral rationale;
  once it ships it moves into the gated set.
- **Local vs CI parity**: the coverage suite and its gate produce the same
  pass/fail verdict locally and in CI, so a red locally is trustworthy and vice
  versa.

## Requirements *(mandatory)*

### Functional Requirements

**Restore & correctness (US1)**

- **FR-001**: The coverage suite MUST complete successfully (success exit code)
  with the current contract set, producing a per-file and total coverage report.
- **FR-002**: No test may fail with an out-of-gas error caused by coverage
  instrumentation; the escrow and oracle tests that currently fail this way MUST
  pass under instrumentation.
- **FR-003**: The wager escrow family (`WagerRegistry`, `WagerRegistryCore`,
  `WagerRegistryIntents`) MUST report real, non-zero coverage, with both proxy
  facets exercised through the merged-ABI proxy path.
- **FR-004**: The coverage measurement MUST be deterministic — two runs over
  identical code produce identical per-file numbers.

**Honest first-party accounting (US2)**

- **FR-005**: Coverage accounting MUST include only first-party production
  contracts. Vendored/third-party code under `account/lib/**` (FreshCryptoLib,
  account-abstraction, solady, webauthn-sol) and any other imported third-party
  code MUST be excluded from the reported total and from threshold evaluation. The
  one deliberate exception is the deployed wallet contracts at the top level of
  `account/` (`CoinbaseSmartWallet`, `ERC1271`, `MultiOwnable`,
  `CoinbaseSmartWalletFactory`): although Coinbase/Solady-adapted, they are
  deployed live and custody funds, so they ARE included in the accounting and gated
  at Tier B on the integration surface FairWins invokes; only the deeper crypto
  libraries under `account/lib/**` stay excluded.
- **FR-006**: Test-only harnesses and mocks (e.g., `contracts/test/*`,
  `contracts/mocks/*`) MUST be excluded from first-party coverage accounting while
  remaining compiled where their removal would corrupt source-map attribution for
  the production contracts they import.
- **FR-007**: The set of excluded paths MUST be documented with a rationale for
  each exclusion, so an auditor can see exactly what is and is not counted.
- **FR-008**: The weekly torture-test summary MUST report the first-party
  statements / branches / functions / lines totals in a human-readable form, not
  the vendored-diluted blend.

**Enforcement (US3)**

- **FR-009**: A coverage threshold policy MUST be enforced using three risk-based
  tiers: **Tier A** (funds custody & settlement) ≥95% statements/lines and ≥90%
  branches; **Tier B** (security-critical supporting, including the deployed
  `account/*` wallet contracts) ≥90% statements/lines and ≥80% branches; **Tier C**
  (other first-party) ≥80% statements/lines and ≥70% branches. Tier C contracts not
  yet on a launch path are measured and reported but not gated this round, per
  FR-013a.
- **FR-010**: The coverage run MUST evaluate results against the threshold policy
  and fail (non-zero exit) when any covered contract is below its threshold,
  naming the offending contract and metric.
- **FR-011**: The coverage gate MUST fail loudly in CI — it is a blocking step,
  not `continue-on-error`, consistent with constitution Principle IV; the report
  artifact MUST still be uploaded on failure for inspection. The gate MUST run in
  two places: a **blocking per-PR gate on the security-critical set** (so a
  coverage regression is caught before merge, not a week later) and the **weekly
  torture test gating the full first-party report**.
- **FR-012**: Adding a new security-critical first-party contract without adequate
  tests MUST cause the gate to fail rather than pass silently.

**Gap closure (US4)**

- **FR-013**: Every security-critical first-party contract MUST meet its assigned
  threshold: wager escrow family (Tier A), group pools
  (`WagerPool`/`WagerPoolFactory`, Tier A), the deployed `account/*` wallet
  contracts (Tier B, integration surface — ERC-1271 validation, factory create,
  owner management), oracle adapters (Tier B; auto-resolution paths Tier A), access
  control (`MembershipManager`/`MembershipVoucher`/`SanctionsGuard`; voucher
  redemption Tier A), gasless intents (`SignerIntentBase` and the `…WithSig`/
  `…WithAuthorization` twins, Tier B), and upgradeable plumbing (Tier B).
- **FR-013a**: Token templates (`OpenERC20`/`OpenERC20V2`, `OpenERC721`/
  `OpenERC721V2`, `RestrictedERC20`/`RestrictedERC20V2`) and
  `clearpath/ExternalDAORegistry` are measured and included in the first-party
  report but are NOT gated in this feature unless they are on a live launch path.
  Each ungated contract carries a one-line documented deferral rationale, and the
  deferral list MUST be revisited when those contracts ship (at which point they
  move into the gated set).
- **FR-014**: Coverage-closing tests MUST prioritize funds-handling and settlement
  paths: wager create/accept/claim/refund/cancel/draw; pool join/resolve/claim;
  oracle auto-resolution; membership-voucher redemption; and account
  signature-validation / ERC-1271 paths.
- **FR-015**: Coverage-closing tests MUST cover the revert/guard branches
  (access-control reverts, deadline checks, sanctions-guard denials, and
  already-resolved / not-resolved oracle states), which are currently the weakest
  dimension across the suite.
- **FR-016**: The overall first-party coverage total MUST be at least the last
  known-good baseline (2026-06-29: 56.68% statements / 48.88% branches / 58.05%
  functions / 62.28% lines) and MUST NOT regress below it thereafter.

**Constraints (apply to all requirements)**

- **FR-017**: This feature MUST NOT change on-chain contract behavior or storage
  layout to achieve coverage. Upgradeable contracts (`WagerRegistry`,
  `MembershipManager`, `WagerPoolFactory`) MUST keep storage append-only and pass
  the storage-layout check.
- **FR-018**: This feature MUST NOT delete or weaken existing security tests;
  static analysis (Slither) and fuzzing (Medusa) gates MUST continue to run and
  pass.
- **FR-019**: This feature MUST NOT introduce a new application backend or expand
  the deployment footprint; it operates entirely within the existing test/CI
  tooling.

### Key Entities *(include if feature involves data)*

- **First-party contract set**: the production Solidity the project owns and must
  cover — wager escrow, pools, first-party account contracts, oracle adapters,
  access control, gasless-intent plumbing, upgradeable base, token contracts,
  privacy, clearpath. Distinct from the excluded set.
- **Excluded set**: vendored/third-party libraries (`account/lib/**`) and test-only
  harnesses/mocks — compiled where needed for correctness, but never counted in the
  coverage total or thresholds. Each entry carries a documented rationale.
- **Coverage threshold policy**: a tiered mapping from contract (or contract group)
  to minimum statement/line and branch coverage targets, keyed by risk, used by the
  enforcement gate.
- **Coverage report**: the per-file and first-party-total statements / branches /
  functions / lines figures produced by a run, plus the pass/fail verdict against
  the threshold policy.
- **Weekly Coverage Analysis job**: the torture-test job that produces the report,
  emits the human-readable summary, and enforces the gate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Coverage Analysis job completes green — **0** tests fail with an
  instrumentation-induced out-of-gas error (down from 182), and the job exits
  successfully.
- **SC-002**: The wager escrow family (`WagerRegistry`, `WagerRegistryCore`,
  `WagerRegistryIntents`) reports a real, non-zero coverage figure (up from a false
  0%), and both proxy facets are exercised.
- **SC-003**: The reported first-party coverage total excludes 100% of vendored
  third-party code and test-only harnesses, and the weekly summary displays that
  first-party number.
- **SC-004**: Every gated security-critical first-party contract meets its tier
  threshold; in particular the contracts currently below target are brought up —
  group pools (`WagerPool` from ~3% to Tier A), the deployed `account/*` wallet
  contracts (from 0% to Tier B integration-surface coverage), `MembershipVoucher`
  (from 76% statements / 46% branches), `SignerIntentBase` (from 52% / 37%), and
  the oracle adapters' auto-resolution branches (from ≤58%).
- **SC-005**: A deliberately weakened test for a security-critical contract causes
  the coverage gate to fail with a message naming the contract and metric; the gate
  passes again once the test is restored.
- **SC-006**: The first-party coverage total is at least the 2026-06-29 baseline
  (≥56.68% statements, ≥48.88% branches, ≥58.05% functions, ≥62.28% lines) and does
  not regress below it in subsequent runs.
- **SC-007**: A coverage run over unchanged code produces identical per-file
  numbers on repeat (reproducible), and the local and CI runs agree on pass/fail.
- **SC-008**: Branch coverage of the funds-handling revert/guard conditions across
  the security-critical set is demonstrably exercised (each named guard branch has
  at least one covering test).
- **SC-009**: A PR that drops a gated security-critical contract below its tier
  threshold is blocked by the per-PR coverage gate before merge — not only by the
  following weekly run.

## Assumptions

- **Threshold values (confirmed 2026-07-10)**: a three-tier policy —
  - *Tier A — funds custody & settlement (highest risk)*: wager escrow family,
    `WagerPool`/`WagerPoolFactory`, `MembershipVoucher` redemption, and oracle
    auto-resolution → **≥95% statements/lines, ≥90% branches**, with every
    funds-moving function executed at least once.
  - *Tier B — security-critical supporting*: the deployed `account/*` wallet
    contracts (integration surface), `MembershipManager`, `SanctionsGuard`, oracle
    adapters, `SignerIntentBase`, upgradeable base, `TokenFactory` → **≥90%
    statements/lines, ≥80% branches**.
  - *Tier C — other first-party* (token templates, `ExternalDAORegistry`): **≥80%
    statements/lines, ≥70% branches** *when on a launch path*; otherwise measured
    and reported but not gated this round, each with a documented deferral rationale
    (FR-013a).
- **"Security-critical" (gated) scope**: the contracts named in FR-013 are the
  gated security-critical set. The `account/*` wallet contracts are gated at Tier B
  on the integration surface FairWins invokes (not the deeper vendored crypto).
  Interfaces, mocks, vendored libraries under `account/lib/**`, and test harnesses
  are out of that set. Token templates and `ExternalDAORegistry` are measured but
  report-only until they reach a launch path (FR-013a).
- **Out-of-gas root cause**: the instrumentation-induced out-of-gas failures stem
  from the recently landed, heavy contracts (passkey accounts + elliptic-curve
  libraries, group pools, the two-facet gasless registry, Safe custody) pushing
  instrumented bytecode/gas past the run's limits; the fix restores headroom for
  instrumented execution without changing production gas behavior.
- **Enforcement placement (confirmed 2026-07-10)**: enforcement runs in two
  places — a blocking per-PR gate on the security-critical (gated) set, and the
  weekly Coverage Analysis job gating the full first-party report. Both fail loudly
  (no `continue-on-error`).
- **Vendored code stays vendored**: third-party libraries under `account/lib/**`
  are treated as external dependencies to be excluded from coverage, not rewritten
  or tested by this feature.
- **Baseline source of truth**: the 2026-06-29 successful torture-test run is the
  reference baseline for the "no regression" criterion; the 2026-07-06 failed run
  is the reference for the defect being fixed.
- **No production contract edits**: any code touched is test code, coverage
  configuration, CI job definition, and documentation — not deployed contract logic
  or storage.
