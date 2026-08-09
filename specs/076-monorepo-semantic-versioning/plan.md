# Implementation Plan: Monorepo Semantic Versioning & Release Promotion

**Branch**: `claude/monorepo-semantic-versioning-kkk4lq` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/076-monorepo-semantic-versioning/spec.md`

## Summary

Give the repository a single, computed, enforced release version; deploy `staging` to its own
environment so a candidate is exercised before members see it; and stamp the running version onto
every deployed surface so a defect is traceable from a bug report to a version to the artifacts it
shipped.

The approach in one paragraph: **one script computes every version** (`scripts/release/version.js`)
from Conventional-Commits PR titles, gated as a required check that also predicts the next version on
the PR; **promotion is a `staging` → `main` merge commit** that preserves the classification history
the computation depends on; **staging is two Cloud Run services** built from one commit — a mainnet
one that mirrors the next production build, and a testnet one — which satisfies "all cohorts" without
touching the build-time cohort rule; and **version identity is a build arg** surfaced in the account
modal and on the gateway health endpoint, reporting `unreleased+<sha>` rather than lying when a build
is not a published release.

## Technical Context

**Language/Version**: Node.js 22 (workflow scripts, ESM/CJS per workspace); YAML for GitHub Actions;
existing React 18 + Vite frontend

**Primary Dependencies**: GitHub Actions; Release Drafter v6 (already installed, scope narrowed to
notes only); Google Cloud Build + Cloud Run (existing `cloudbuild.yaml`). **No new runtime
dependency and no new release tool** — see research R2.

**Storage**: git tags and files in the repository. No database.

**Testing**: Vitest for the new `scripts/release/*` units and the frontend version line; existing
`test/` Hardhat suite untouched; workflow behavior validated per `quickstart.md`

**Target Platform**: GitHub Actions runners (`ubuntu-latest`); Cloud Run `us-central1`

**Project Type**: Repository infrastructure — CI/CD, release tooling, and two small display surfaces

**Performance Goals**: A merge into `staging` is serving on both staging services within 30 minutes
unattended (SC-006). The version gate runs on the `opened` event in under a minute — it reads only
the PR title and the changed-file list (R3, R4).

**Constraints**:
- The production build must be unaffected by this feature's existence (FR-026b). `networks.js` is
  not touched.
- The version gate must not be `continue-on-error` (constitution IV).
- No deployed surface may report a version it is not running (constitution III, FR-031).
- Staging holds mainnet-capable credentials; none may be shared with production (FR-027).

**Scale/Scope**: 8 workspace members + root; ~15 GitHub Actions workflows, 4 of which change; 3 Cloud
Run services after this feature (1 today); 2 independently versioned mini-app packages.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 — result at the bottom of this section.*

| Principle | Assessment |
| --- | --- |
| **I. Security-First Smart Contracts** | No `contracts/` changes; no ABI, storage, or deployment change. **But** this feature creates a new security surface the constitution's key-management rule reaches: a staging environment holding mainnet-capable credentials. Addressed by FR-026c/FR-027 and `contracts/environments.md` — separate secrets, separate funded accounts, and **no admin or deployer key on staging at all**. PASS. |
| **II. Test-First** | `scripts/release/version.js` and the classification parser are pure functions over (tag list, commit subjects, changed files) and get unit tests written alongside. The frontend version line gets a Vitest test including its `unreleased` state. Workflow behavior is covered by `quickstart.md` scenarios, which are executable rather than narrative. PASS. |
| **III. Honest State** | Directly engaged, three ways. (a) FR-031: a build with no published release reports `unreleased+<sha>`, never the nearest tag. (b) FR-026d: the mainnet staging service discloses that its on-chain actions are real. (c) R1 keeps the testnet/mainnet cohort boundary enforced by construction rather than by a runtime flag. PASS. |
| **IV. Fail Loudly in CI** | The version gate, the branch-policy gate and the mini-app version-pairing check are all required and none carries `continue-on-error`. The feature *adds* enforcement rather than relaxing any. PASS. |
| **V. Accessible Frontend** | One new UI element: a version line in the account modal. Plain text, meets WCAG 2.1 AA, covered by the existing axe test pattern used across this repo's component tests. PASS. |

**Post-Phase-1 re-check**: no new violations. The design adds one item to Complexity Tracking (the
second staging service), justified below. No principle is weakened by any Phase 1 artifact.

## Project Structure

### Documentation (this feature)

```text
specs/076-monorepo-semantic-versioning/
├── plan.md                      # This file
├── spec.md                      # Feature specification
├── research.md                  # Phase 0 — R1..R9
├── data-model.md                # Phase 1 — entities
├── quickstart.md                # Phase 1 — executable validation scenarios
├── contracts/
│   ├── version-scheme.md        # Normative: classification grammar, bump map, "breaking" here
│   ├── environments.md          # Normative: the 3 services and their enumerated differences
│   └── release-record.md        # Normative: the shape of a release record
├── checklists/requirements.md   # Spec quality checklist
└── tasks.md                     # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
scripts/release/                      # NEW — the single version authority (R2)
├── version.js                        # compute next version from tags + commit subjects
├── classify.js                       # parse a PR title / commit subject into a ChangeClassification
├── artifacts.js                      # build the release record's artifact table
└── __tests__/                        # unit tests for all three

.github/workflows/
├── version-gate.yml                  # NEW — required check: classification + predicted version (FR-009..FR-014)
├── branch-policy.yml                 # NEW — required check: PRs into main come from staging or hotfix/* (FR-018)
├── release.yml                       # NEW — tag, publish record, update CHANGELOG on main (FR-033..FR-037)
├── staging-deploy.yml                # NEW — build once, deploy both staging services (FR-023, R1)
├── release-drafter.yml               # CHANGED — notes only; version supplied explicitly
├── ci-manager.yml                    # CHANGED — develop → staging in push trigger (FR-022)
├── frontend-testing.yml              # CHANGED — develop → staging
├── subgraph-build.yml                # CHANGED — develop → staging
└── container-build.yml               # CHANGED — add staging to push trigger

.github/release-drafter.yml           # CHANGED — remove version-resolver (R2)

cloudbuild.yaml                       # CHANGED — pass VITE_APP_VERSION / VITE_GIT_SHA
cloudbuild.staging.yaml               # NEW — builds both staging images from one commit
Dockerfile                            # CHANGED — ARG/ENV for the two version values
CHANGELOG.md                          # NEW — generated, never hand-edited

frontend/src/
├── config/version.js                 # NEW — reads the build values, resolves the unreleased state
└── components/ui/FairWinsUserModal.jsx   # CHANGED — render the version line (FR-029)

services/relay-gateway/src/server.js  # CHANGED — version + sha on the PUBLIC half of /healthz + /status (FR-030, R5)

docs/
├── developer-guide/versioning-and-releases.md   # NEW
└── runbooks/release-and-promotion.md            # NEW
```

**Structure Decision**: Infrastructure feature — the work lands in `.github/workflows/`,
`scripts/release/`, and the two deploy configs, with two small display surfaces in existing files.
No new workspace member is created: `scripts/` is not a workspace member today and does not need to
become one for three scripts the workflows invoke directly with `node`.

## Phase ordering

The user stories are independently shippable and should land in priority order, because each is
useful before the next exists:

1. **US1 (P1) — version identity.** `scripts/release/version.js`, `release.yml`, the two display
   surfaces, `CHANGELOG.md`. After this, production can be asked what it is running.
2. **US3 (P3) — the gate.** `classify.js`, `version-gate.yml`, `branch-policy.yml`, the
   release-drafter narrowing. Landed second rather than third because the release job needs
   classifications to be reliable before the staging pipeline starts producing candidates from them.
3. **US2 (P2) — staging.** `staging` branch, `cloudbuild.staging.yaml`, `staging-deploy.yml`, the
   trigger corrections. The largest operational step (two new Cloud Run services, DNS, secrets).
4. **US4 (P4) — artifact tracing.** `artifacts.js` and the release-record artifact table.

US3 before US2 inverts the spec's P-order deliberately; the spec's priorities rank *value*, and this
ranks *dependency*. Nothing is skipped.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| **Two staging Cloud Run services instead of one** | FR-026a requires staging to reach every cohort; `buildIsTestnet()` folds `VITE_NETWORK_ID` at build time (`networks.js:917,1017`), so one image resolves exactly one cohort. N cohorts therefore means N services. | A single service reaching both cohorts requires a runtime cohort switch or a staging-only union flag. Both put a testnet/mainnet seam into code that also ships to production, which FR-026b forbids and constitution III makes a funds-safety issue. Multiplying services costs money; weakening the boundary costs correctness. See research R1. |
| **A merge commit for promotion, against the repo's squash-merge convention** | The version is computed from the classification carried in each commit subject. Squashing a promotion collapses every PR title in the release into one, destroying that history. | Computing the release from the GitHub API's PR list instead of git would remove the need — but it makes the release depend on API availability and label history rather than on the repository itself, and would not survive a repository export. See research R6. |
