# Coverage and Audit Gates That Fail Loudly

*How a false 0% on the escrow contract taught us to wire quality gates so a regression physically cannot merge*

---

| | |
|---|---|
| **Series** | Security & DevOps (part 2) |
| **Part** | 30 of 34 |
| **Audience** | Engineering leads, security-minded teams |
| **Tags** | `ci`, `test-coverage`, `audit`, `quality-gates`, `slither` |
| **Reading time** | ~8 minutes |

---

## A green suite that was quietly lying

On July 6, 2026, the Weekly Torture Test went red. The Coverage Analysis job exited with code **182** — not a coincidence, a count: **182 contract tests had failed with "Transaction ran out of gas."** The tests that failed were exactly the ones exercising the core escrow contracts. So the report that landed in the run summary showed the wager escrow family — `WagerRegistry`, `WagerRegistryCore`, `WagerRegistryIntents`, the contracts that hold every participant's stake — sitting at a flat **0%**. The blended coverage total had dropped from **56.68%** the previous week to **31.21%**.

Here is the uncomfortable part. Nothing had actually broken in the contracts. The escrow logic was fine, its unit tests passed under a normal `npm test`, and funds were never at risk. What had broken was the *measurement*. Coverage instrumentation rewrites bytecode to record which lines execute, and that rewrite inflates code size and per-transaction gas. Several recently landed contracts — the passkey smart accounts with their elliptic-curve libraries, group wager pools, and the two-facet gasless registry that already sits against the 24 KB EVM code-size limit — pushed the instrumented bytecode past the run's gas headroom. Under instrumentation they ran out of gas before their tests could touch the escrow paths.

The failure mode is worse than a broken test. A broken test is loud. This was a *safety net reporting a false negative*: the single most important contract in the system read as untested, and the number was low enough that a real coverage regression could have hidden inside the noise and merged unnoticed. Spec `046-contract-audit-coverage` exists to fix both problems at once — restore a measurement you can trust, then wire it so a genuine regression fails the build loudly instead of drifting.

This post is about the gates, not the tests they protect. The interesting engineering is not "write more tests." It is: how do you build a quality gate that (a) measures the right thing, (b) can't be gamed into a false pass, and (c) blocks a merge rather than filing a complaint nobody reads.

## Fixing the measurement before trusting the number

The first job was to get instrumented tests to run at all. The fix is narrow on purpose. `npm run test:coverage` sets `COVERAGE=true`, and only under that flag does Hardhat apply coverage-scoped network settings — a raised `blockGasLimit` and adjusted `initialBaseFeePerGas` — so instrumented contracts have the headroom to execute:

```
test:coverage = COVERAGE=true TZ=UTC hardhat coverage --testfiles '{test/*.test.js,test/access/**,test/account/**,...}'
```

Because those relaxed limits are gated behind `COVERAGE=true`, a normal `npm test` and the gas report keep realistic mainnet-like limits. We restored instrumentation headroom without pretending production gas is unlimited. The result, captured on July 10, was a green run: **674 passing, zero out-of-gas failures**, and the escrow family reporting real numbers again.

The second problem was subtler: *what* to measure. The blended 31.21% was meaningless even when green, because it averaged in vendored third-party code — FreshCryptoLib, solady, webauthn-sol, the account-abstraction libraries under `contracts/account/lib/**` — plus test-only fuzz harnesses. None of that is code the project owns or should be judged on.

The obvious fix, adding those paths to solidity-coverage's `skipFiles`, is a trap, and `.solcover.js` carries a long comment explaining why. Skipping a directory that first-party contracts *import* corrupts source-map attribution for the importers. Skip `contracts/test/**` and `WagerRegistry`'s own coverage collapses to ~5%, because the harnesses that drive it are what map execution back to its source. So instrumentation stays deliberately broad, and all first-party filtering happens in **post-processing** instead:

```
scripts/coverage/lib/first-party.js   # pure helpers over istanbul's coverage-summary.json
scripts/coverage/check-thresholds.js  # the gate that reads them
```

The separation matters. Measurement instruments everything (correct source maps); accounting excludes the vendored and test-only paths (honest headline number). One deliberate exception survives the exclusion: the deployed wallet contracts at the top of `contracts/account/` — `CoinbaseSmartWallet`, `ERC1271`, `MultiOwnable`, `CoinbaseSmartWalletFactory`. They are Coinbase/Solady-adapted, but they are deployed live and custody funds on Polygon, so they *are* counted, gated on the integration surface FairWins actually invokes. Only the deeper crypto libraries under `account/lib/**` stay excluded.

## The policy file is the whole argument

Every threshold lives in one auditable place: `coverage-threshold-policy.json`, edited only by PR. There is no coverage config scattered across workflow YAML. The gate reads three risk-based tiers:

- **Tier A** — funds custody and settlement: the `WagerRegistry` family, group pools (`WagerPool` / `WagerPoolFactory`), `MembershipVoucher` redemption, oracle auto-resolution. **≥95% statements / ≥90% branches.**
- **Tier B** — security-critical supporting: the deployed `account/*` wallets, oracle adapters, access control, gasless-intent plumbing, the upgradeable base, `TokenFactory`. **≥90% / ≥80%.**
- **Tier C** — other first-party. **≥80% / ≥70%.**

Each gated contract carries its tier and, optionally, a per-contract `min` floor:

```json
{ "path": "contracts/wagers/WagerRegistry.sol",       "tier": "A", "min": { "statements": 92, "branches": 67 } },
{ "path": "contracts/wagers/WagerRegistryCore.sol",   "tier": "A" },
{ "path": "contracts/access/MembershipVoucher.sol",   "tier": "A", "min": { "statements": 76, "branches": 45 } }
```

The `min` is a **ratchet**. `tier` is the audit-readiness target; `min` is the currently-enforced floor for a contract that hasn't reached target yet. The gate fails below `min` — so coverage can never regress — while the target stays visible as the number to raise toward. As gaps close, you bump `min` up and eventually delete it, at which point the full tier is enforced. A contract with no `min` is held to its tier immediately. `MembershipVoucher` at `76/45` is honest about being mid-climb toward `95/90`; it just can't slide backward.

Two more lists complete the policy. `reportOnly` contracts (unlaunched token templates, `ExternalDAORegistry`) are measured and printed but **never** fail the gate — each with a written `rationale` — so not-yet-shipped code is visible without blocking PRs. `excluded` drops vendored and test-only paths from first-party accounting entirely. The doctrine is explicit: never leave a shipped fund-handling contract in `reportOnly`. When `custody/SafeProposalHub.sol` or a token template goes live, it moves into `gated`, tests come up to tier, and only then does the gate go green.

## The gate itself: three exit codes, no negotiation

`scripts/coverage/check-thresholds.js` reads istanbul's `coverage-summary.json` and the policy, then exits with one of three codes:

```
0 — all gated contracts meet their tier AND first-party total >= baseline
1 — one or more gated contracts below tier, or a baseline regression
2 — bad input (missing/invalid summary or policy, unresolved gated path)
```

Two design choices make it hard to fool. First, a gated contract that is **absent** from the coverage summary is treated as a failure, not an omission — "file present, ~0% covered" in a security-critical area is exactly the July 6 scenario, and the gate now calls it what it is (FR-012). You cannot make the gate pass by deleting a contract's tests so it drops out of the report. Second, beyond per-contract tiers, the gate enforces a `baseline` on the first-party total that ratchets upward: after the fix it was raised to `91.51/73.04/89.76/91.14`, up from the old-baseline `56.68/48.88/58.05/62.28`. The blended total can only go up.

The gate runs in two places, with two scopes:

- **Per-PR** — `.github/workflows/test.yml`, the *Smart Contract Tests* job runs `--scope gated`. Coverage generation is a blocking step (no `continue-on-error`), then the gate blocks the merge if any security-critical contract is below its floor. A regression is caught before merge, not a week later.
- **Weekly** — `.github/workflows/torture-test.yml`, the *Coverage Analysis* job runs `--scope all`, printing the full first-party table (report-only rows included) into the run summary and failing on any gated breach.

The weekly job uses one careful shell idiom worth stealing: it tees the gate's output into the step summary but captures the exit code so the summary is always written *and* a non-zero exit still fails the job.

```bash
node scripts/coverage/check-thresholds.js --summary coverage/coverage-summary.json \
  --policy coverage-threshold-policy.json --scope all | tee -a "$GITHUB_STEP_SUMMARY"; rc=${PIPESTATUS[0]}
exit $rc
```

## The storage-layout gate rides alongside

Coverage is not the only thing that fails loudly on every PR. FairWins runs several contracts as UUPS proxies — `WagerRegistry`, `MembershipManager`, `WagerPoolFactory`, `FeeRouter`, and others — where logic is swappable but state must be preserved. A well-meaning refactor that reorders a storage variable is invisible to a coverage number and catastrophic to a live proxy. So `npm run check:storage-layout` runs in the same *Smart Contract Tests* job, before the tests, and blocks the pipeline on any storage-incompatible or upgrade-unsafe implementation (`scripts/deploy/check-storage-layout.js`, spec 025). It even handles the two-facet registry: `WagerRegistry` and `WagerRegistryIntents` share one proxy's storage, so the check treats the facet as if it were an upgrade of the main implementation and diffs the layouts. Same doctrine, different invariant.

## Design decisions and trade-offs

**Post-processing over `skipFiles`.** Filtering vendored code in accounting rather than at instrumentation costs a little complexity (`first-party.js` plus a documented exclusion list) but is the only way to get an honest number *and* uncorrupted source maps. The alternative silently reports the escrow contract at 5% — the exact failure we were trying to eliminate.

**A ratchet, not a cliff.** We could have demanded every Tier A contract hit 95/90 on day one. Instead the `min` floor locks in current coverage and lets targets rise over time. This is the difference between a gate teams route around and one they live with: it never blocks a green PR for coverage that already exists, only for coverage that *drops*.

**Honest about what actually blocks.** Coverage thresholds, storage layout, unit tests, lint, and the frontend build are hard gates — no `continue-on-error`. Slither and Medusa, by contrast, run in the weekly torture test and the security workflow as **informational** steps: they run on every relevant push, their findings are uploaded as artifacts and reviewed (the security agents under `.github/agents/`), but a raw Slither finding does not auto-fail the pipeline, because its false-positive rate would make the gate noise. That is a deliberate line: gate on the checks with a crisp pass/fail (does coverage meet the floor? is storage append-only?), and treat the heuristic analyzers as review inputs rather than merge blockers. Calling that out honestly is the point — a "fail loudly" culture is credible only when you're precise about which checks are loud and which are advisory.

The measurable outcome: 182 instrumentation-induced out-of-gas failures went to zero, the escrow family reports real coverage instead of a false 0%, and a deliberately weakened test on a security-critical contract now fails the gate with a message naming the contract and the metric — before it can merge, not a week after.

## Sources

- `specs/046-contract-audit-coverage/spec.md` — feature spec, failure narrative (run `28764296740`), tiers, FR-001 through FR-019
- `docs/developer-guide/coverage-and-audit-gates.md` — how the gate works, policy-file reference, common tasks
- `docs/security/ci-configuration.md` — security workflow structure, tool versions, gating vs. informational jobs
- `coverage-threshold-policy.json` — the tiered policy: `tiers`, `gated`, `reportOnly`, `excluded`, `baseline`
- `scripts/coverage/check-thresholds.js` and `scripts/coverage/lib/first-party.js` — the gate and first-party accounting
- `.solcover.js` — instrumentation config and the `skipFiles` source-map-corruption note
- `.github/workflows/test.yml` (per-PR gate) and `.github/workflows/torture-test.yml` (weekly `--scope all`)
- `scripts/deploy/check-storage-layout.js` — the upgrade-safety / storage-layout gate (spec 025)
- `package.json` — `test:coverage`, `check:storage-layout` scripts
- Istanbul / nyc coverage summary format: https://github.com/istanbuljs/istanbuljs
- solidity-coverage: https://github.com/sc-forks/solidity-coverage
- Slither: https://github.com/crytic/slither — Medusa: https://github.com/crytic/medusa
- OpenZeppelin Upgrades (storage-layout safety): https://docs.openzeppelin.com/upgrades-plugins/
