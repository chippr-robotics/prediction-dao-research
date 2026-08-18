# Data Model: End-to-End Coverage Expansion

**Feature**: 094-e2e-coverage-expansion | **Date**: 2026-08-18

Two committed JSON files carry every fact this feature adds. Everything else — the generated
document, the shard assignment, the gate messages — is derived from them.

---

## 1. Coverage matrix — `frontend/cypress/coverage/matrix.json`

### `MatrixFile`

| Field | Type | Rule |
|---|---|---|
| `version` | integer | Schema version. Bumped when an enum gains a value. |
| `generatedDoc` | string | Path of the rendered document, so the gate knows what to diff. |
| `specs` | `SpecEntry[]` | **One entry per directory under `specs/`.** Set equality is the staleness gate. |

### `SpecEntry`

| Field | Type | Rule |
|---|---|---|
| `id` | string | The spec **directory name** (`073-miniapp-platform`). Not the number — three numbers are reused across two features each, and a numeric key would merge them. |
| `title` | string | Short human name. |
| `memberFacing` | boolean | Whether any member-facing flow exists. |
| `reason` | string | **Required when `memberFacing` is false.** Why there is nothing to drive (e.g. "build tooling; no member surface"). |
| `flows` | `Flow[]` | Required and non-empty when `memberFacing` is true; must be empty otherwise. |

### `Flow`

| Field | Type | Rule |
|---|---|---|
| `id` | string | Stable slug, unique across the file (`pools.settle-payout-matrix`). Sub-issues and matrix rows both cite it. |
| `name` | string | The journey in a member's words. |
| `status` | `Status` | See enum. |
| `tier` | `Tier` | Where it lives, or — when absent — where it *should* live. |
| `depth` | `Depth` | What its tests actually prove. `none` when absent. |
| `risk` | `Risk` | Money-at-risk if it breaks unnoticed. Orders the backlog. |
| `tests` | string[] | Test ids (`CLM-01`) or spec paths backing the claim. Empty iff `depth` is `none`. |
| `missing` | string | **Required when `status` is `partial`.** What specifically is not covered. |
| `reason` | string | **Required when `status` is `out-of-scope`.** Why it is not drivable or not worth driving. |
| `issue` | string | Tracking sub-issue, required when `status` is `absent` or `partial`. |

### Enums

**`Status`** — what exists.

| Value | Meaning |
|---|---|
| `covered` | Tests exist and prove the outcome. |
| `partial` | Tests exist but leave a named part unproven. |
| `absent` | Nothing drives this flow at any tier. |
| `out-of-scope` | Deliberately not tested, with a reason that survives review. |

**`Depth`** — what the tests prove. **Independent of `Status`**: a flow can be `covered` at depth
`smoke`, and several are. That combination is the finding, not a contradiction.

| Value | Meaning |
|---|---|
| `none` | No test, or only assertions that cannot fail. |
| `smoke` | A surface rendered; a control existed. |
| `flow` | The journey completed and the interface agreed it had. |
| `settled` | The outcome was read back from the authority that decides it — chain state, a stored record, a balance. |

**`Tier`** — execution context.

| Value | Directory | Needs |
|---|---|---|
| `no-chain` | `cypress/e2e/fast/` | A built app. No chain. |
| `on-chain` | `cypress/e2e/full/` | A local chain, a deploy and a seed. |
| `account-native` | `cypress/e2e/passkey/` | The WebAuthn harness. |
| `none` | — | Only valid with status `absent` or `out-of-scope`; paired with `proposedTier`. |

**`Risk`** — what a member loses if it breaks unnoticed.

| Value | Meaning |
|---|---|
| `custody` | Member funds are escrowed, moved, bridged, swept or sent. |
| `disclosure` | A member consents to a cost; a wrong disclosure charges them more than they agreed. |
| `access` | Gating, identity, permission — the wrong person acts, or the right person cannot. |
| `information` | Read-only surfaces. A break misinforms but takes nothing. |
| `none` | No member consequence. |

### Invariants (enforced by `coverageMatrix.test.js`)

1. The set of `specs[].id` equals the set of directory names under `specs/`. Neither extra nor missing.
2. `memberFacing: false` ⇒ `flows` empty **and** `reason` present.
3. `memberFacing: true` ⇒ at least one flow.
4. `status: partial` ⇒ `missing` present. `status: out-of-scope` ⇒ `reason` present.
5. `status` ∈ {`absent`, `partial`} ⇒ `issue` present.
6. `depth: none` ⇔ `tests` empty.
7. `depth` above `none` ⇒ every path in `tests` resolves to a file that exists.
8. `tier: none` ⇒ `status` ∈ {`absent`, `out-of-scope`} and `proposedTier` present.
9. Every `flow.id` is unique file-wide.
10. The generated document is byte-identical to a fresh render of this file.

---

## 2. Full-tier weights — `frontend/cypress/coverage/full-tier-weights.json`

| Field | Type | Rule |
|---|---|---|
| `measuredAt` | string | ISO date of the run these came from. |
| `source` | string | Where measured (workflow + run id), so a reader can check. |
| `shards` | integer | Leg count the split targets. |
| `specs` | object | Spec path → measured seconds. |

**Invariants**: every key resolves to an existing spec file; a spec present on disk but missing here
is assigned the file's mean rather than dropped — a split that silently omits a spec would remove it
from the merge gate, which is the failure this whole feature exists to prevent. The splitter reports
any spec it had to estimate.

---

## 3. Derived, not stored

| Artefact | Derived from | By |
|---|---|---|
| `docs/developer-guide/e2e-coverage-matrix.md` | `matrix.json` | `scripts/e2e/generate-coverage-matrix.js` |
| Shard spec lists | `full-tier-weights.json` + specs on disk | `scripts/e2e/split-full-tier.js` (longest-processing-time-first) |
| Lighthouse route × profile expectations | `frontend/lighthouse-routes.json` | `scripts/e2e/check-lighthouse-coverage.js` |
| Suppression count | `disableRules` entries in the suite | `assertionDepth.test.js` |
