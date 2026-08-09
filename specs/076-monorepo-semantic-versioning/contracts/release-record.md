# Contract: Release Record

**Feature**: `specs/076-monorepo-semantic-versioning` | Satisfies FR-033 – FR-037

Every release produces this record, generated — never hand-written. It is published as the GitHub
Release body and appended to `CHANGELOG.md`.

---

## Required shape

```markdown
## v1.4.0 — 2026-08-14

Promoted from v1.4.0-rc.3.
Previous release: v1.3.2 · Range: v1.3.2..v1.4.0 (17 commits)

### 🚀 Features
- feat(earn): surface the live fee rate before signature (#1081)

### 🐛 Bug Fixes
- fix(bitcoin): reject a stale fee quote at signing time (#1079)

### 🧹 Maintenance
- chore(deps): Bump @solana/kit from 7.0.0 to 7.1.0 (#1080)

### Artifacts

| Artifact | Status | Identity |
|---|---|---|
| SPA image | moved | `sha256:9f2c…` (was `sha256:41ab…`) |
| Relay gateway image | unchanged | `sha256:41ab…` |
| Contract implementations | unchanged | — |
| Mini-app packages | moved | `token-mint` v1.1.0 → `bafy…7q` (was `bafy…2k`) |
| Subgraph endpoint | unchanged | `fairwins-polygon/v0.2.0` |
```

## Rules

- **Every artifact category appears** (FR-035). "unchanged" is stated explicitly. A missing row is
  indistinguishable from an unexamined one, and the record exists to be trusted during an incident.
- **`promotedFrom` is named** (FR-036). A hotfix release says `Promoted from: none (hotfix)` rather
  than omitting the line.
- **The range is exact** (FR-033) — this is why promotion uses a merge commit rather than a squash
  (R6).
- **Contract implementations** are read from `deployments/`, and **mini-app CIDs** from the
  on-chain registry, at release time. Neither is inferred from the build (R8), because the record's
  value is that it describes what is deployed rather than what was built.
- **Changes are grouped by classification**, reusing the existing Release Drafter category taxonomy
  in `.github/release-drafter.yml` so notes and versioning cannot disagree (FR-015, R2).

## Generation

| Part | Produced by |
| --- | --- |
| Version, predecessor, range | `scripts/release/version.js` |
| Grouped change list | Release Drafter, with an explicit `version:` input |
| Artifact table | `scripts/release/artifacts.js` (reads `deployments/`, the registry, image digests) |
| `CHANGELOG.md` entry | the release workflow, prepending the generated body |
