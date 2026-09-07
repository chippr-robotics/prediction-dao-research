# The dependency vulnerability gate

`npm run check:dep-alerts` (issue #1521). Source: `scripts/security/check-dependency-alerts.js`,
policy: `scripts/security/dependency-alert-policy.json`.

## Why it exists

`.github/dependabot.yml` has carried this line in its header since it landed:

> There is currently no vulnerability gate anywhere in CI while `npm audit` reports findings on
> every install, so this is the first automated pressure on that.

The pressure it meant was Dependabot opening pull requests, capped at five. Nothing ever read the
**alerts**, so they were not a signal anybody had to answer. By 2026-09-06 there were 45 open — one
critical, nine high — and every required check had been green throughout.

That is the same shape as every other invariant this repo ended up gating: `check:specs`,
`check:ci-gating`, `check:finops`, the byte gates. A prose rule with no enforcement is the rule that
gets broken. Dependency vulnerabilities were the last class still on the honour system.

## What it does *not* do

**It does not run `npm audit`.** Two reasons, both disqualifying:

1. `npm audit` re-resolves the tree to answer. An incremental resolve in this repo silently drops
   the platform rolldown binary from `node_modules` **and** the lockfile (npm/cli#4828, spec 075),
   so the gate would break the builds it is meant to protect.
2. It cannot see dismissals. The 12 OpenZeppelin alerts against a 4.7.3 copy nested under
   `@chainlink/contracts` that solc never reads (#1520) would keep it permanently red for a reason
   that is already understood and written down.

It reads the Dependabot alerts API instead, where a dismissed alert is simply not `open`.

## The threshold

Declared in the policy file, not in code:

| severity | scopes that fail |
|---|---|
| `critical` | `development` and `runtime` |
| `high` | `runtime` only |
| `medium`, `low` | never |

A gate that failed on all 45 would have been red on the day it landed, and a gate that is always red
gets bypassed — which is how the repo went without one. 32 of the 45 are development-scope and none
of those is critical, so they are reported by Dependabot and do not block a merge.

**An unknown scope counts as `runtime`.** The API can report `scope: null`; absence of a
"development" label is not evidence of safety.

## Acceptances are time-boxed

Every entry in `acceptances` needs four things: a valid `ghsa` id, the `package`, a `reason` of real
length, the `issue` tracking its removal, and an `expires` date.

The expiry is the point. An acceptance with no end date is a silenced alert, and silence is what let
45 accumulate. When one expires the gate fails and the choice comes back: fix it, or renew
deliberately with a fresh reason.

**The list only ever shrinks.** D-04 removes an entry that no longer matches an open alert, so a
stale excuse cannot sit in the file hiding the next real finding. That is the same rule as
`LEGACY_COLLISIONS` under the spec registry's S-04.

Note what is deliberately *not* accepted: the OpenZeppelin alerts belong on the alert itself as a
**dismissal**, with the import-graph reasoning attached. An acceptance here would record them as
tolerated risk, which is a different and wrong claim.

## Two halves, because they need different things

| | runs | needs | enforces |
|---|---|---|---|
| **offline** (default) | every PR, in the `Spec Registry` job | nothing | D-01, D-02, D-06 |
| **live** (`--live`) | push to `staging`/`main`, daily cron, manual | `vulnerability-alerts: read` | D-03, D-04, D-05 |

**The live half deliberately does not run per-PR.** Dependabot alerts are computed for the
*repository*, not for a branch, so a pull request's own diff cannot move them — running it there
would re-report repository state as though it were a property of the change. It would also fail on
every fork and Dependabot PR, where `GITHUB_TOKEN` is not granted that permission.

Expiry is enforced in the **offline** half on purpose, so an acceptance rotting past its date fails
a pull request rather than waiting for the nightly job.

`vulnerability-alerts: read` is the only permission that lets `GITHUB_TOKEN` list Dependabot alerts
— `security-events` covers code scanning, which is a different API. No PAT is required.

## The rules

| rule | half | fails when |
|---|---|---|
| **D-01** | offline | the policy is malformed: bad threshold, or an acceptance missing a GHSA id, package, reason, issue or expiry; duplicates |
| **D-02** | offline | an acceptance has expired |
| **D-03** | live | an open alert at or above the threshold has no unexpired acceptance |
| **D-04** | live | an acceptance no longer matches any open alert |
| **D-05** | live | the alert list could not be read |
| **D-06** | offline | `dependency-alerts.yml` is missing, lacks `vulnerability-alerts: read`, never runs `--live`, or uses `continue-on-error` |

## D-05: unreadable is a failure, never a pass

Same rule the estate reads follow (spec 071) and the FinOps catalogue follows (spec 089): a value
exists only when it was read. A gate that goes green when it cannot see also reports success when it
is broken, which is strictly worse than having no gate — you get the silence *and* the reassurance.

`check-ci-gating` makes the sibling point about skipped jobs: "passed" and "never ran" must not look
alike. The live workflow always writes a line to the run summary saying which happened.

## Things that will bite you

- **The alerts endpoint has no `page` parameter.** It answers
  `400 Pagination using the `page` parameter is not supported.` and pages by cursor through the
  `Link` header. The first implementation used `?page=N`, passed every stubbed unit test, and failed
  on the first real call. There is now a regression test asserting on the URL actually built, but
  the general lesson stands: run `--live` before believing the fixtures.
- **Adding an acceptance is a decision, not a formality.** It is the one edit that makes the gate
  quieter. Reviews should read the `reason`, not just the diff stat.
- **Do not raise the threshold to get green.** Widening `failOn` downward is fine; narrowing it is
  how a gate stops meaning anything. If a class of alert genuinely should not block, say so in the
  policy's `$comment` where the next reader will find it.

## Running it

```bash
npm run check:dep-alerts          # offline: schema, expiry, wiring
npm run test:dep-alerts           # the gate's own must-fail fixtures

GITHUB_REPOSITORY=chippr-robotics/prediction-dao-research \
GITHUB_TOKEN=$(gh auth token) \
npm run check:dep-alerts:live     # live reconciliation
```
