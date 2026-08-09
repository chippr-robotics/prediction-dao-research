# Quickstart: Validating Semantic Versioning & Release Promotion

**Feature**: `specs/076-monorepo-semantic-versioning` | **Date**: 2026-08-09

Runnable checks that prove the feature works. Each scenario names the requirement it validates and
the observable outcome. Details live in [`contracts/`](./contracts/); nothing is duplicated here.

## Prerequisites

- A checkout with tags: `git fetch --tags`
- Node 22 (`node --version`)
- Repository admin access for the branch-protection and Cloud Run steps

---

## S1 — The version computation is correct and deterministic (FR-013, US3)

```bash
node scripts/release/version.js --explain
npm test --workspace-root -- scripts/release/__tests__
```

**Expect**: the computed next version, the classification of every commit since the last tag, and
which one determined the bump. Running it twice on the same tree gives the same answer.

**Also assert** — the aggregation rule, which is the one most likely to regress:

```bash
# One feat among many chores must yield a MINOR bump, not a patch.
node scripts/release/version.js --explain | grep -E 'bump: minor'
```

**With no tags present** (the state this repo is in today) it must print `v1.0.0` and say the reason
is "no previous release", never a value read from a `package.json` (FR-006).

---

## S2 — The classification gate blocks and explains (FR-009, FR-010, FR-011)

Open a PR titled `update some things` (no type prefix).

**Expect**: the `version-gate` check **fails**, and its message names the accepted types and the
exact edit. Retitle to `fix(scope): update some things` and the check passes and reports the version
the PR would produce (FR-012).

**Negative check** — the gate must not be bypassable:

```bash
grep -n "continue-on-error" .github/workflows/version-gate.yml   # must return nothing
```

---

## S3 — A bytecode-moving dependency bump cannot ship as a chore (FR-014)

Open a PR titled `chore(deps): Bump @chainlink/contracts` that also edits
`specs/075-monorepo-workspaces/baseline-bytecode.json`.

**Expect**: the gate **fails**, stating that editing a byte-gate baseline is not housekeeping and
requires at least `fix`, or `!` if the interface changed. See `contracts/version-scheme.md` §4.

This is checked from the diff, so it must fail on the `opened` event — before any digest job runs.

---

## S4 — Version identity is honest on every surface (FR-029 – FR-032, SC-010)

```bash
# SPA
curl -s https://fairwins.app/ | grep -o 'v[0-9]*\.[0-9]*\.[0-9]*'
# Gateway — version must be in the PUBLIC half, readable with no X-Origin-Auth
curl -s https://relay.fairwins.app/status | jq '{version, gitSha}'
```

**Expect**: both report the same version and revision, and both match the release record.

**The honest-state case** (the one that matters most): build from a commit with no tag and deploy it.

```bash
curl -s https://staging.fairwins.app/ | grep -o 'unreleased+[0-9a-f]\{7\}'
```

**Expect**: `unreleased+<sha>`. A nearest-tag value here is a failure, not a cosmetic issue.

---

## S5 — Staging serves both cohorts from one commit (FR-023, FR-026, FR-026a)

```bash
curl -s https://staging.fairwins.app/         | grep -o 'rc\.[0-9]*'
curl -s https://staging-testnet.fairwins.app/ | grep -o 'rc\.[0-9]*'
```

**Expect**: the same `-rc.N` on both — same commit, two cohorts.

**Then assert the boundary held**, which is the entire point of R1:

```bash
# The production build must be untouched by this feature.
git diff origin/main -- frontend/src/config/networks.js   # must be empty
```

Membership on the mainnet staging service must resolve to Polygon 137, and on the testnet one to
Amoy 80002 — never a mix. See `contracts/environments.md`.

---

## S6 — Configuration drift blocks a promotion (FR-024, FR-027a)

Add an unlisted build arg to the staging pipeline and open a `staging` → `main` PR.

**Expect**: the promotion check **fails**, naming the unenumerated difference. Add it to the
enumerated list in `contracts/environments.md` (a reviewed decision) and it passes.

---

## S7 — Branch policy and hotfix drift (FR-018, FR-019)

1. Open a PR from `feature/x` into `main`. **Expect**: `branch-policy` fails — head must be `staging`
   or `hotfix/*`.
2. Open one from `hotfix/urgent` into `main`. **Expect**: passes.
3. Merge it, then check drift detection: **expect** an issue reporting that `main` contains a release
   absent from `staging`, which clears once the back-merge lands.

---

## S8 — Promotion produces one honest release (FR-020, FR-021, FR-033 – FR-036)

Merge two classified PRs into `staging`, then promote.

**Expect**: one release whose range covers **both** commits; whose notes group them by
classification; whose `Promoted from` names the candidate; and whose artifact table lists **every**
category including the unchanged ones (FR-035).

**The empty case**: promote again with no new commits. **Expect**: no tag, no release, and a log line
saying the range was empty (FR-021).

**The fixed-candidate case**: merge into `staging` while a promotion PR is open. **Expect**: the PR's
head moves and its checks re-run — the late commit cannot ride along silently (FR-020).

---

## S9 — Mini-app version pairing (FR-007b)

Change a mini-app's source without bumping its `package.json` version.

**Expect**: CI fails, reporting that the app's output bytes changed while its version did not. The
reverse (a version bump with unchanged bytes) must fail too — both directions, because either
disagreement makes the release record's CID pairing untrue.

---

## S10 — Full-suite regression

```bash
npm run compile
node scripts/codegen/bytecode-digest.js --compare specs/075-monorepo-workspaces/baseline-bytecode.json
npm run check:deps
npm test --workspace fairwins-relay-gateway
```

**Expect**: byte gates unchanged — this feature must not move a single byte of deployed bytecode or
mini-app output. Two `test/fork/` failures are known-environmental; see the `monorepo-verify` skill.
