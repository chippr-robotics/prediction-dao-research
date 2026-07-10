# Phase 1 Data Model: Contract Audit Coverage Restoration & Hardening

**Feature**: 046-contract-audit-coverage
**Date**: 2026-07-10

This feature has no on-chain data model. Its "entities" are the configuration and
report artifacts that define, measure, and enforce coverage. They are the durable
contracts between the coverage run, the gate, and CI.

---

## Entity 1 — Contract Classification

Every `contracts/**` source file is classified into exactly one bucket. The
classification drives instrumentation, accounting, and gating.

| Field | Description |
|-------|-------------|
| `path` | Repo-relative Solidity path |
| `bucket` | `first-party-gated` \| `first-party-report-only` \| `vendored-excluded` \| `test-excluded` \| `interface-excluded` |
| `tier` | `A` \| `B` \| `C` \| `—` (only for `first-party-gated`/`report-only`) |
| `rationale` | One line; required for every `report-only`, `vendored-excluded`, `test-excluded` entry |

**Rules**:
- `vendored-excluded`: `contracts/account/lib/**`, `contracts/pools/SemaphoreDeploy.sol`
  + its vendored closure, any other imported third-party code.
- `test-excluded`: `contracts/test/**`, `contracts/mocks/**` (compiled where needed
  for source-map attribution; never counted).
- `interface-excluded`: `**/interfaces/**` and interface-only files.
- `first-party-gated` vs `first-party-report-only`: per FR-013 / FR-013a — token
  templates and `clearpath/ExternalDAORegistry` are `report-only` until launched.

**State transition**: a `report-only` contract becomes `first-party-gated` when it
reaches a live launch path (documented in the policy file's changelog).

---

## Entity 2 — Coverage Threshold Policy

A single checked-in, machine-readable source of truth (see
`contracts/coverage-threshold-policy.md` for the concrete schema). Consumed by the
gate script; human-reviewed in PRs.

| Field | Description |
|-------|-------------|
| `tiers` | Map `A/B/C` → `{ minStatements, minBranches }` (95/90 · 90/80 · 80/70) |
| `gated` | List of `{ path, tier }` — the contracts the gate fails on |
| `reportOnly` | List of `{ path, tier, rationale }` — measured, printed, never fail |
| `excluded` | List of `{ pathGlob, reason }` — dropped from accounting |
| `baseline` | Frozen first-party totals that must not regress (FR-016) |

**Validation rules**:
- Every path in `gated`/`reportOnly` resolves to an existing first-party contract.
- No path appears in more than one of `gated`/`reportOnly`/`excluded`.
- Tier keys referenced by `gated`/`reportOnly` exist in `tiers`.
- `baseline` ≤ current first-party totals at all times.

---

## Entity 3 — Coverage Summary Artifact

Produced by the instrumented run via istanbul `json-summary`
(`coverage/coverage-summary.json`), plus `lcov.info` and `text`.

| Field | Description |
|-------|-------------|
| `total` | Aggregate `{ statements, branches, functions, lines }` each `{ pct, covered, total }` |
| `<file>` | Per-file same shape, keyed by absolute path |

**Derived (first-party) view**: the gate recomputes a first-party `total` by summing
only `first-party-*` files (Entity 1), so the reported headline excludes vendored and
test-only code. This derived total — not istanbul's raw `total` — is what CI prints
and what `baseline` (FR-016) is compared against.

---

## Entity 4 — Gate Result

The output of the enforcement step; the contract between the gate script and CI.

| Field | Description |
|-------|-------------|
| `rows` | Per-contract `{ path, tier, statementsPct, branchesPct, required, status }` where status ∈ `pass`/`fail`/`report-only`/`n/a` |
| `firstPartyTotal` | Derived first-party aggregate (Entity 3) |
| `baselineOk` | Boolean — first-party total ≥ frozen baseline |
| `violations` | List of gated contracts below threshold (empty ⇒ exit 0) |
| `exitCode` | `0` if `violations` empty **and** `baselineOk`; else non-zero |

**Behavioral rules**:
- `report-only` rows never contribute to `violations`.
- A gated first-party contract that is present but **uncovered/missing from the
  summary** counts as a violation (FR-012 — new contract without tests fails loudly).
- The table (all rows) is always printed, even on success, for auditability.

---

## Entity relationships

```text
Contract Classification ──feeds──▶ Coverage Threshold Policy
        │                                   │
        │ instrument                        │ tiers + gated/reportOnly/excluded
        ▼                                   ▼
Coverage Summary Artifact ──filtered by──▶ Gate Result ──exitCode──▶ CI (per-PR + weekly)
```
