# Data model

Four entities. Only the first is persisted (in the repo, as source); the rest exist per collection
cycle in memory.

## Source

A declared revenue or cost stream. Lives in `packages/finops-catalogue/src/sources.js` and is the
single place a source is declared (FR-001).

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable kebab-case identity. Becomes the `source` metric label, so **renaming one breaks history** — retire and add instead. |
| `kind` | `'revenue'` \| `'cost'` | |
| `status` | `'live'` \| `'planned'` \| `'retired'` | `planned` never contributes to a total (FR-014). `retired` keeps its history queryable without appearing in current totals. |
| `label` | string | Panel title. |
| `metric` | string | The metric family the collector emits. Checked against the exporter by the gate (FR-021). |
| `unit` | enum | From the bounded enumeration in `contracts/metrics.md`. |
| `collector` | string | Which collector produces it. Checked to exist. |
| `basis` | `'billed'` \| `'modelled'` | **Cost sources only.** Mandatory — see research R1. |
| `chains` | number[] | On-chain sources only. Must fall inside the build's cohort (FR-008). |
| `meaning` | string | Prose: what this number is, and — where it matters — what it is not. |
| `interval` | seconds | Matched to how fast the source actually changes (FR-009). |
| `credential` | string \| null | The **name** of the Secret Manager secret, never its value (FR-003). |
| `docs` | string | Runbook anchor an alert points at (FR-018). |

Deliberately absent: endpoints, account ids, zone tags, tokens. Those are configuration. The
catalogue is a description and is world-readable in the repo.

## Reading

One collection attempt for one source.

| Field | Type | Notes |
|---|---|---|
| `sourceId` | string | |
| `state` | `'read'` \| `'not-configured'` \| `'unreadable'` | Exactly one (FR-006). |
| `value` | number \| null | **Exists only when `state === 'read'`.** The type is what enforces FR-006; a `?? 0` has nowhere to live. |
| `unit` | enum \| null | |
| `at` | epoch ms | |
| `reason` | string \| null | Only on `unreadable`. Redacted (FR-025). |

A `Reading` is the only thing a collector may return. It cannot express "zero because the read
failed", which is the bug class this whole feature exists to prevent.

## Pool

A prepaid balance with a derived runway.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `paymaster-137`, `relayer-63`, … |
| `balance` | Reading | |
| `burnRatePerSec` | number \| null | Trailing window; `null` until enough samples exist. |
| `runwaySeconds` | number \| null | `null` when burn rate is zero or unknown — **never `Infinity`**, which an alert rule reads as healthy. |

## PanelBinding

The link from a `Source` to the dashboard panel that displays it — the gate's subject (FR-020).
Produced by the generator, not hand-written: every `live` and `planned` source gets exactly one
primary panel, and the gate re-derives the set and diffs it against the committed dashboard JSON.

## Invariants

1. A value exists only in state `read`.
2. `revenue_accrued` and `revenue_total` are never summed.
3. No aggregate crosses `unit` boundaries.
4. `planned` and `retired` sources are excluded from current totals.
5. Every label value comes from a declared enumeration.
6. A source id is never reused for a different meaning.
