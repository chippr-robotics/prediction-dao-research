# Phase 1 Data Model: Monorepo Semantic Versioning & Release Promotion

**Feature**: `specs/076-monorepo-semantic-versioning` | **Date**: 2026-08-09

No database is involved. The "data" here is git refs, files in the repository, and build-time
environment values. Each entity below names where it physically lives, because the durability of
each one is the whole point of the feature.

---

## ReleaseVersion

The three-component identifier for one deployable state of the repository.

| Field | Type | Source of truth |
| --- | --- | --- |
| `major`, `minor`, `patch` | integer ≥ 0 | derived by `scripts/release/version.js` |
| `tag` | `v<major>.<minor>.<patch>` | annotated git tag on `main` |
| `commit` | 40-hex SHA | the tagged commit |
| `predecessor` | ReleaseVersion \| null | previous tag by version order; `null` for the first |

**Rules**

- Immutable once published. A tag is never moved or reused (FR-004).
- Strictly increasing (FR-005).
- With no tags present, the next version is `v1.0.0` — a fixed constant, never inherited from a
  package manifest (FR-006, R9).
- Never written by hand into a manifest (FR-008).

---

## ReleaseCandidate

A pre-release identity for a build on `staging`.

| Field | Type | Notes |
| --- | --- | --- |
| `base` | ReleaseVersion | the version this would become on promotion |
| `iteration` | integer ≥ 1 | increments per `staging` merge since the last release |
| `tag` | `v<base>-rc.<iteration>` | annotated git tag on `staging` |

**Rules**

- Distinguishable at a glance from the production release of the same number (FR-002) — the
  `-rc.N` suffix is that distinction, and semver already orders `1.4.0-rc.2 < 1.4.0`.
- `base` is recomputed on every `staging` merge. A candidate that was `1.3.1-rc.1` becomes
  `1.4.0-rc.2` when a `feat:` lands: the base tracks the accumulated classification, not the first
  guess.

---

## ChangeClassification

The machine-readable declaration attached to a pull request.

| Field | Type | Source |
| --- | --- | --- |
| `type` | enum — see `contracts/version-scheme.md` | PR title prefix |
| `scope` | string \| null | PR title, parenthesized |
| `breaking` | boolean | `!` before the colon, or a `BREAKING CHANGE:` footer |
| `bump` | `major` \| `minor` \| `patch` \| `none` | derived from `type` + `breaking` |

**Rules**

- Required on every pull request; a missing or unrecognized value fails a merge-blocking check
  (FR-009, FR-010) with a message naming the accepted values (FR-011).
- Survives the merge as the squash commit subject, which is what makes a release computable from
  the commit range alone (R3).
- **Escalation**: when the PR modifies a byte-gate baseline file, `type` may not be `chore`,
  `docs`, or `style` (FR-014, R4).

---

## Release

The durable record of one published release.

| Field | Type | Notes |
| --- | --- | --- |
| `version` | ReleaseVersion | |
| `predecessor` | ReleaseVersion \| null | |
| `range` | `<prev-tag>..<tag>` | exact commit range |
| `promotedFrom` | ReleaseCandidate \| null | `null` only for a hotfix release (FR-036) |
| `changes` | ChangeClassification[] | grouped by type for the notes |
| `artifacts` | ArtifactMovement[] | see below (FR-034) |

**Lives in**: a GitHub Release (notes) plus `CHANGELOG.md` (FR-037). Both are generated; neither is
hand-written.

**Rules**

- Never produced for an empty commit range (FR-021).
- Every artifact category appears, including the ones that did not move — "unchanged" is stated, not
  implied by omission (FR-035).

---

## ArtifactMovement

One line in a release record: what a category of artifact did in this release.

| Field | Type | Notes |
| --- | --- | --- |
| `category` | `spa-image` \| `gateway-image` \| `contract-impl` \| `miniapp-package` \| `subgraph-endpoint` | |
| `moved` | boolean | false renders as an explicit "unchanged" |
| `identity` | string \| null | image digest, implementation address, CID, or endpoint version |
| `previous` | string \| null | the value it replaced |

**Per-category identity**

- `contract-impl` — the proxy name plus the implementation address it now points at, read from
  `deployments/` (FR-034).
- `miniapp-package` — the package's own version *and* the content address committed on-chain, read
  from the registry rather than assumed from the build (R8).
- `subgraph-endpoint` — the endpoint version the SPA build consumes, which lives in a namespace this
  scheme does not own (FR-034, spec Assumptions).

---

## Environment

A deployed instance with a branch it tracks and a version it is currently serving.

| Field | Type | Production | Staging (mainnet) | Staging (testnet) |
| --- | --- | --- | --- | --- |
| `service` | string | `prediction-dao-research` | `…-staging` | `…-staging-testnet` |
| `tracks` | branch | `main` | `staging` | `staging` |
| `cohort` | enum | mainnet | mainnet | testnet |
| `chainId` | integer | 137 | 137 | 80002 |
| `serving` | ReleaseVersion \| ReleaseCandidate \| `unreleased+<sha>` | | | |
| `credentials` | set | own | own | own |

**Rules**

- `serving` reports what is *actually* running. A build with no corresponding published release
  reports `unreleased+<sha>`, never the nearest tag (FR-031, SC-010).
- Staging and production share no credentials, funded accounts, gas wallet, or paymaster deposit
  (FR-026c, FR-027, SC-012).
- Configuration differs from production only in the enumerated set; anything else blocks a
  promotion (FR-024, FR-027a).
- Neither staging service is presented as the production app, and both are noindex (FR-025).

### State transitions

```
feature branch ──PR──▶ staging ──deploy──▶ both staging services  (rc.N)
                          │
                          └──promotion PR (merge commit)──▶ main ──deploy──▶ production  (vX.Y.Z)

hotfix/* ──PR──▶ main ──deploy──▶ production  (vX.Y.Z, promotedFrom = null)
                  └──back-merge required──▶ staging     (FR-019)
```
