# Validation record: quickstart scenarios S1–S10

**Feature**: `specs/076-monorepo-semantic-versioning` | **Run**: 2026-08-09 | Task T050

Scenarios that can be exercised without deployed infrastructure were run and their outcomes are
recorded verbatim below. Those requiring the staging environment or a live release cannot be run
until the operational steps in `docs/runbooks/release-and-promotion.md` § "One-time setup" are done;
they are listed as **deferred**, not as passing.

| Scenario | Status | Evidence |
| --- | --- | --- |
| S1 — version computation correct and deterministic | ✅ pass | below |
| S2 — classification gate blocks and explains | ✅ pass (logic) / deferred (as a required check) | below |
| S3 — bytecode-moving dependency bump cannot ship as a chore | ✅ pass | below |
| S4 — version identity honest on every surface | ✅ pass (unit) / deferred (deployed) | 41 tests |
| S5 — staging serves both cohorts | ⏸ deferred | needs the two Cloud Run services |
| S6 — configuration drift blocks a promotion | ✅ pass | below |
| S7 — branch policy and hotfix drift | ⏸ deferred | needs `staging` on the remote |
| S8 — promotion produces one honest release | ⏸ deferred | needs a real promotion |
| S9 — mini-app version pairing | ✅ pass | below |
| S10 — full-suite regression / byte neutrality | ✅ pass | below |

---

## S1 — version computation (FR-006, FR-013)

```
$ node scripts/release/version.js --explain
previous: none
...
bump:     n/a
reason:   no-previous-release
next:     v1.0.0
```

Correct: the repository has zero tags, so the first release is the constant `v1.0.0` rather than a
value inherited from a manifest (the manifests currently say 1.0.0 / 0.1.0 / 0.0.0, and inheriting
any of them would be arbitrary).

**Determinism**: two consecutive `--explain` runs produced byte-identical output.

**Aggregation** is covered by unit test — one `feat` among many `chore`s yields `v1.4.0` from
`v1.3.2`, not `v1.3.3`.

## S2 — the classification gate (FR-009, FR-011)

```
$ node scripts/release/classify.js --title "update some things"
::error::Change classification failed: "update some things" does not match "<type>[(<scope>)][!]: <subject>"
Every pull request must declare what kind of change it makes, as a title of the form:
    <type>[(<scope>)][!]: <subject>
Accepted types: feat, fix, perf, refactor, docs, spec, test, build, ci, chore, style, revert
```

Rejects, and names both the accepted values and the shape of the fix.

**Negative check** — `grep -n "continue-on-error" .github/workflows/version-gate.yml` returns
nothing, so the gate cannot pass on error (constitution IV).

**Deferred half**: the check becomes merge-*blocking* only once registered as required in branch
protection (T031). Until then it runs and reports correctly but does not block.

## S3 — byte-gate escalation (FR-014)

Same changed-file list (`package-lock.json` + `baseline-bytecode.json`), two titles:

```
chore(deps): Bump @chainlink/contracts   -> REJECTED
  type "chore" is not permitted when a byte-gate baseline is modified …
  Re-recording a baseline means deployed bytecode or published package bytes changed,
  which is never housekeeping.

fix(contracts): pin the chainlink source -> ACCEPTED
```

Escalation only ever raises: the correct classification is not punished.

## S6 — promotion configuration drift (FR-024, FR-027a, FR-026b)

```
$ node scripts/release/check-promotion-config.js
promotion config OK: staging mirrors production within the enumerated differences
```

**Proven to have teeth.** With `VITE_NETWORK_ID` temporarily changed to `1` in
`cloudbuild.staging.yaml`:

```
::error::VITE_NETWORK_ID differs: production "137" vs staging "1"
```

and it returned to OK when restored. A check that only ever passes manufactures confidence; this one
fires.

## S9 — mini-app version pairing (FR-007b)

```
$ node scripts/release/check-miniapp-versions.js --base HEAD~3 --head HEAD
mini-app version/bytes pairing OK
```

Correct — this change touches no mini-app. Both failure directions are covered by unit tests.

## S10 — regression and byte neutrality

| Gate | Result |
| --- | --- |
| `npm run compile` | 236 Solidity files compiled (evm target: paris) |
| `bytecode-digest.js --compare` | **145 contracts, CHANGED: 0 REMOVED: 0 ADDED: 0 — byte-identical** |
| `build:miniapps` + `record-build-digests.js --compare` | **output bytes unchanged** |
| `npm run check:storage-layout` | 26 live implementations diffed, all append-only compatible |
| `npm run check:deps` | 101 packages, no skew, no phantom imports |
| `npm run check:abis` | 21 generated files match |
| `npm run tenants:validate` | 2 manifests valid |
| `npm run test:release` | **45 passed** |
| `npm test --workspace fairwins-relay-gateway` | **234 passed** |
| frontend (scoped: the 3 new suites) | **24 passed** |
| ESLint on every changed frontend file | clean |

Both byte gates matter most here: this feature must not move a single byte of deployed bytecode or
published mini-app output, and it did not.

---

## Deferred scenarios

S5, S7, S8 and the deployed halves of S2 and S4 require infrastructure that a pull request cannot
create. Each maps to a one-time setup step:

| Scenario | Blocked on |
| --- | --- |
| S2 (blocking) | T031 — register the required status checks |
| S4 (deployed) | T035 — provision the staging services |
| S5 | T032 + T035 — `staging` branch and both Cloud Run services |
| S7 | T032 — `staging` on the remote |
| S8 | T032 + release-identity push access to `main` |

Run them as the acceptance test for that setup, following
`docs/runbooks/release-and-promotion.md`.
