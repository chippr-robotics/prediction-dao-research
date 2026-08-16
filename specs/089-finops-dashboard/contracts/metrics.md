# Contract: metric names and labels

This is the wire contract between the exporter, the generated dashboards, and the alert rules.
Changing anything here changes what every committed panel queries, so a change ships with a
regenerated `infra/grafana/` tree (`npm run finops:generate`) or `check:finops` fails.

All metrics are prefixed `fairwins_finops_`.

## Honesty triplet — emitted for EVERY catalogued source

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `..._source_configured` | gauge | `source`, `kind`, `status` | `1` if this source has the configuration/credentials it needs, else `0`. |
| `..._source_up` | gauge | `source`, `kind` | `1` if the last collection succeeded, `0` if it failed. Only meaningful when configured. |
| `..._source_last_success_timestamp_seconds` | gauge | `source` | Unix seconds of the last successful read. Absent if never read. |

The three states of FR-006 decode from the first two, in PromQL alone:

```
read            configured == 1  and  up == 1
unreadable      configured == 1  and  up == 0
not-configured  configured == 0
```

**This is the whole honesty mechanism.** A panel distinguishes "zero" from "unknown" without anyone
opening a log, because a value metric is *absent* — never zero — when the source is not `read`.

## Value metrics

| Metric | Type | Labels | Notes |
|---|---|---|---|
| `..._revenue_total` | counter | `source`, `unit`, `chain` | Cumulative gross revenue. Finalized blocks only (R5), so it never rewinds. |
| `..._revenue_accrued` | gauge | `source`, `unit`, `chain` | Earned but not yet withdrawn. **Never added to `revenue_total`.** |
| `..._revenue_waived_total` | counter | `source`, `unit`, `chain` | `FeeSkippedNoTreasury` — revenue not earned for a fixable reason. |
| `..._cost_usd_total` | counter | `source`, `basis`, `gcp_service` | `basis` is `billed` or `modelled` (R1) and is **mandatory**. |
| `..._vendor_usage` | gauge | `source`, `metric` | Raw vendor usage (requests, bytes, API credits) — a fact even when the dollar figure is a model. |
| `..._pool_balance` | gauge | `pool`, `unit`, `chain` | Prepaid pool balance. |
| `..._pool_burn_rate` | gauge | `pool`, `unit`, `chain` | Trailing-window burn per second. |
| `..._pool_runway_seconds` | gauge | `pool`, `chain` | `balance / burn_rate`. **Absent** when burn rate is zero or unknown — not `+Inf`, which alert rules silently treat as healthy. |
| `..._collection_duration_seconds` | gauge | `source` | Per-source collection latency; feeds the exporter's own health. |
| `..._info` | gauge | `version`, `commit`, `cohort` | Always `1`. Build identity. |

## Label enumerations (bounded — FR-028)

- `source` — a catalogue `id`. ~20 values.
- `kind` — `revenue` \| `cost`.
- `status` — `live` \| `planned` \| `retired`.
- `unit` — `USDC` \| `USD` \| `POL` \| `ETH` \| `ETC`.
- `chain` — `1` \| `10` \| `61` \| `63` \| `137` \| `8453` \| `42161`.
- `basis` — `billed` \| `modelled`.
- `pool` — `paymaster-137` \| `relayer-137` \| `relayer-63` \| `bundler-137`.
- `gcp_service` — GCP service name from the billing export.

**No unbounded label may ever be added.** Not member address, not wager id, not transaction hash, not
endpoint path. Enforced by `check:finops`, which rejects any label not declared here.

## Rules that bind the metrics together

**A value metric is emitted only in state `read`.** Never a zero placeholder. This is what makes
"absent means unknown" true, and every panel and alert depends on it.

**A `planned` source emits the honesty triplet and nothing else** (`configured=0`), so it is visible
on the dashboard as not-yet-live without contributing `0` to a total (FR-014).

**Totals are computed in the dashboard, not the exporter**, so a partial total can name what is
missing. The canonical revenue total is:

```promql
sum by (unit) (fairwins_finops_revenue_total)
```

paired with a completeness check that drives the "partial" label:

```promql
count(fairwins_finops_source_configured{kind="revenue",status="live"} == 1
      unless on(source) fairwins_finops_source_up == 1)
```

Non-zero ⇒ the total is partial, and the sources it names are exactly the missing ones (FR-011).

**Derived KPIs use `and on(...)` guards** so a missing input yields no sample rather than a zero
(FR-012):

```promql
  rate(fairwins_finops_cost_usd_total{source="paymaster-gas"}[1h])
/ rate(fairwins_finops_sponsored_ops_total[1h])
  and on() (fairwins_finops_source_up{source="paymaster-gas"} == 1)
```

## Cross-unit rule

`sum` across different `unit` values is forbidden — the aggregator never emits one, and no generated
panel produces one. A USD roll-up exists only where a price is available and carries its rate source
and age as a separate `..._fx_rate` gauge with `..._fx_age_seconds`, so a stale rate is visible
rather than silently applied (FR-013).
