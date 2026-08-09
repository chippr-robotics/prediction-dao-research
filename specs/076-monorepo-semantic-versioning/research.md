# Phase 0 Research: Monorepo Semantic Versioning & Release Promotion

**Feature**: `specs/076-monorepo-semantic-versioning` | **Date**: 2026-08-09

Every decision below is grounded in the repository as it exists today; file and line references are
to `HEAD` at the time of writing.

---

## R1 — How staging reaches every cohort without weakening the cohort rule (FR-026b)

This is the largest open question the spec deliberately left to planning.

**Finding — the cohort really is build-time, exactly as the spec assumed.** The chain is short and
worth stating precisely:

```
frontend/src/config/networks.js:1017  getCurrentChainId() -> import.meta.env.VITE_NETWORK_ID
frontend/src/config/networks.js:917   buildIsTestnet()    -> NETWORKS[getCurrentChainId()].isTestnet
frontend/src/config/networks.js:981   cohortChainIds()    -> filters NETWORKS by that boolean
```

Vite inlines `VITE_NETWORK_ID` at build time, so `buildIsTestnet()` is a constant folded into the
bundle. One image resolves exactly one cohort. There is no runtime seam, and `membershipChainId()`,
`miniAppChainId()` and `isInCohort()` all hang off the same boolean.

**Decision: two staging services built from one commit, not one service with a widened cohort.**

| Service | Cohort | `VITE_NETWORK_ID` | Role |
| --- | --- | --- | --- |
| `prediction-dao-research-staging` | mainnet | `137` | The promotion mirror — byte-for-byte the build that goes to `main`, minus the enumerated differences |
| `prediction-dao-research-staging-testnet` | testnet | `80002` | Safe rehearsal: testnet estate, Mordor-side mini-app registry, no real funds |

Both are built by the same pipeline from the same commit and carry the same release-candidate
version. Together they satisfy FR-026a ("reach every cohort the product supports"); the mainnet one
alone satisfies FR-026's mirror requirement.

**Rationale.** FR-026b requires reaching both cohorts *without* weakening the boundary and *without*
loosening the production build. Multiplying environments satisfies both trivially: `networks.js` is
not touched at all, so the production build is bit-for-bit unaffected by this feature's existence.
The cohort rule keeps meaning what it means — one build, one cohort — and staging gets two builds.

**Alternatives rejected.**

- *Make cohort runtime-selectable.* Directly forbidden by FR-026b. It would put a
  testnet/mainnet switch into the production bundle, and constitution III's boundary would then be
  enforced by a runtime value rather than by construction.
- *A staging-only build flag that unions both cohorts.* A flag that must never be true in production
  is one misconfiguration away from being true in production, and the blast radius is members
  reading mainnet balances against testnet contracts. Rejected on the same grounds the repo already
  rejects `getNetwork()` fallbacks in custody code.
- *Point staging at mainnet only.* Fails FR-026a: testnet networks must be exercisable on staging,
  and the mini-app registry's testnet home is Mordor (63), which a mainnet build cannot reach at all.

**Consequence to carry into tasks.** "Staging" is a two-service environment. Anywhere the plan says
staging deploys, it deploys twice. The mainnet one is the promotion gate; the testnet one is where
destructive testing belongs.

---

## R2 — One authority for the version number (FR-008, FR-015)

**Decision.** A single script, `scripts/release/version.js`, is the sole computer of versions. It is
called by the PR gate (to predict) and by the release job (to decide). Release Drafter keeps writing
release *notes* but stops resolving the *version*: the release job passes it an explicit `version:`
input, and `version-resolver:` is removed from `.github/release-drafter.yml`.

**Rationale.** FR-015 requires the notes configuration and the version gate to agree on what each
classification means. Two systems that must agree will eventually disagree; one system cannot. Today
`release-drafter.yml` already carries a `version-resolver` block that has never produced a published
number — leaving it in place beside a new gate is precisely the disagreement FR-015 names as a
defect.

**Alternatives rejected.**

- *release-please.* Would do most of this, but it brings a release-PR flow, its own changelog
  convention, and a second bot's opinion about versions, on top of Release Drafter which is already
  installed and already labelling. Constitution's simplicity principle (YAGNI) argues against
  adopting a second release system to replace one that only needs its scope narrowed.
- *changesets.* Built for independently versioned packages — the opposite of the FR-007a decision
  that internal members track the repo version. It would also require a changeset file on every PR
  including Dependabot's, which collides with FR-014's no-retitle/no-extra-step requirement.

---

## R3 — Change classification comes from the PR title (FR-009, FR-011, FR-014)

**Decision.** Conventional-Commits-style PR titles are the machine-readable classification. Labels
keep their existing job — release-note grouping through the autolabeler — and stop being load-bearing
for versioning.

**Rationale.** Three properties decide it:

1. **Present at PR open.** A required check must be able to run on the `opened` event. Labels are
   applied asynchronously by the autolabeler, which is a race against the very check that would
   consume them.
2. **Survives the merge.** The repo squash-merges, so the PR title becomes the commit subject on the
   target branch. That is what makes "compute the release from the commit range" possible with git
   alone, with no API call and no dependence on label history.
3. **Dependabot already complies.** Its titles are `chore(deps): Bump X from A to B`, unmodified —
   satisfying FR-014's requirement that automation clear the gate without a human retitling every
   one. This matters at this repo's dependency volume.

The existing history already reads this way (`fix(eip712):`, `docs(claude):`, `chore(deps):`), so
this formalizes a convention rather than imposing one.

**Breaking changes** are declared with a `!` before the colon or a `BREAKING CHANGE:` footer. The
type→bump map and the repository-specific definition of "breaking" required by FR-003 are written
down in `contracts/version-scheme.md`.

---

## R4 — Escalating a dependency bump that moves bytecode (FR-014)

This resolves the sequencing question the spec's checklist flagged for planning.

**Finding.** The byte gates do not merely *report* — they compare against **committed baseline
files**:

```
.github/workflows/test.yml:100  bytecode-digest.js  --compare specs/075-monorepo-workspaces/baseline-bytecode.json
.github/workflows/test.yml:226  record-build-digests.js --compare specs/075-monorepo-workspaces/baseline-miniapp-builds.json
```

A change that alters deployed bytecode or mini-app output bytes therefore *cannot merge* without
editing one of those files. That is what CLAUDE.md means by "getting the gate green means
deliberately re-recording a baseline".

**Decision.** The escalation is a **diff rule, not a job-ordering rule**: if a PR modifies a baseline
file, the classification may not be `chore`, `docs`, or `style`. No dependency between the version
gate and the digest jobs is required, and the gate stays runnable on `opened` with nothing but the
diff and the title.

This is strictly better than the ordering approach the checklist anticipated: the signal is available
immediately, and it cannot be defeated by a digest job being skipped by path filters.

---

## R5 — Where version identity is plumbed and displayed (FR-029 – FR-032)

**SPA.** Two new build args, `VITE_APP_VERSION` and `VITE_GIT_SHA`, following the existing
`ARG`/`ENV` pattern in `Dockerfile` and passed from `cloudbuild.yaml` (which already has
`$COMMIT_SHA` available). Displayed in the account modal, `frontend/src/components/ui/
FairWinsUserModal.jsx`, as a plain text line.

**Gateway.** `APP_VERSION` and `GIT_SHA` environment variables echoed on the existing health
surface in `services/relay-gateway/src/server.js:193`. One constraint from that code: `/status` is
origin-lock exempt and reachable unauthenticated on the raw `run.app` URL, while `gasWalletRunwayHrs`
is deliberately disclosed only to callers presenting `X-Origin-Auth`. Version and short SHA belong in
the **public** half of that payload — they are not secrets, and putting them behind the header would
make the value unreadable exactly when an operator most needs it.

**Honest-state (FR-031).** When the build does not correspond to a published release, the value is
`unreleased+<short-sha>` and the UI says "unreleased build". It is never the nearest tag. This is not
cosmetic: displaying a release number for a build that is not that release would make every other
guarantee in this feature unreliable, and constitution III forbids it.

---

## R6 — Promotion mechanism (FR-020, FR-021)

**Decision.** Promotion is a `staging` → `main` pull request merged with a **merge commit**, not a
squash. The release job on `main` tags the merge commit and computes the release from the commit
range since the previous tag.

**Why a merge commit here specifically.** Everywhere else this repo squash-merges, and should keep
doing so. But squashing a promotion would collapse every PR title in the release into a single
subject line — destroying exactly the classification history R3 relies on to compute the version.
The promotion is the one merge whose purpose is to preserve history.

**FR-020 (fixed candidate)** falls out of the PR head SHA: a merge into `staging` while the promotion
PR is open changes the PR's head, which re-runs its required checks. A late merge cannot ride along
silently — it either becomes part of a re-reviewed candidate or it does not land.

**FR-021 (no empty release)** is an explicit early exit: the release job computes the commit range
since the last tag and exits without tagging when it is empty.

---

## R7 — Branch model enforcement (FR-016 – FR-019, FR-022)

- **`staging` must be created** — it does not exist on the remote (`git branch -r` shows only
  `origin/main`). It is cut from `main` and protected to the same standard (FR-017).
- **FR-018** is a `branch-policy` job on `pull_request` targeting `main`, failing unless the head ref
  is `staging` or matches `hotfix/*`.
- **FR-019 (hotfix drift)** is a job that runs after each release and asks whether `main` contains
  commits absent from `staging`, reporting through an issue rather than a silent log line.
- **FR-022 (trigger hygiene)** — `develop` appears in the push triggers of `ci-manager.yml`,
  `frontend-testing.yml` and `subgraph-build.yml` and refers to a branch that does not exist. Replace
  with `staging`; add `staging` to `container-build.yml`'s push trigger. The spec-075 correction
  stands: path filters scope these workflows, base-branch filters do not decide whether code is
  tested.

---

## R8 — Mini-app package versions (FR-007, FR-007b)

**Decision.** `frontend/miniapps/<app>/package.json#version` is the package version. A CI check
asserts the pairing FR-007b requires: if the mini-app baseline digest changed for an app, that app's
`package.json` version must have changed in the same PR, and vice versa.

**Rationale.** The failure mode FR-007b names — a package version and its on-chain content address
disagreeing — is only detectable if something compares them. The baseline file is the available proxy
for "the published bytes changed", and it is already in the diff (R4).

The release record pairs the version with the CID actually committed on-chain, read from the registry
at release time rather than assumed from the build.

---

## R9 — The first version (FR-006)

**Finding.** Zero tags exist. Root `package.json` says `1.0.0`; `frontend` says `0.0.0`; the services
say `0.1.0`. FR-006 forbids inheriting any of these implicitly.

**Decision: the first release is `v1.0.0`.**

**Rationale.** The product is live in production, holds member funds, and has shipped 75 specs. A
`0.x` series communicates pre-release instability that is not true of this codebase, and semver
treats `0.x` as a regime where anything may break at any time — which would make the breaking-change
discipline this feature is introducing meaningless from day one. `version.js` treats "no tags found"
as "the next release is `v1.0.0`" explicitly, not as a fallback to a manifest value.

---

## Open items carried into tasks

None. Both spec-level clarifications were resolved before planning, and the two items the checklist
flagged for planning are answered here: FR-014 sequencing by R4, and the FR-020/FR-021 promotion
mechanism by R6.
