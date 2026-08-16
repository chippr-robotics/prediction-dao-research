# Implementation Plan: FinOps Dashboard & Alerting

**Branch**: `claude/finops-grafana-dashboard-pjfc8z` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

## Summary

A new read-only collector service (`services/finops-exporter`) polls every revenue and cost source at
a per-source interval and exposes them as Prometheus metrics on loopback. A Grafana Alloy sidecar on
the gateway VM scrapes it and `remote_write`s to **Grafana Cloud**, where dashboards and alert rules
are provisioned **from generated JSON committed in this repo**.

The load-bearing idea is not the service. It is that **one catalogue file describes every source**,
and the exporter, the dashboard generator and a CI gate all read it. That is what turns the user's
"we MUST update the dashboard" from a convention into a build failure.

## Technical Context

**Language**: Node 20+ ESM (matches `services/relay-gateway`).
**Dependencies**: `express` (already used), `ethers` (already used), `@google-cloud/bigquery` (new).
No Prometheus client library — the text exposition format is ~60 lines and hand-rolling it keeps the
service's dependency surface at the same size as the gateway's.
**Storage**: none. The exporter is stateless apart from an in-memory last-good cache; Grafana Cloud
holds the timeseries.
**Testing**: Vitest, matching the gateway. Every collector is tested against its three states.
**Target**: the existing `fairwins-gateway` GCE node, as two more containers in the gateway's
network namespace — the same pattern the engine and redis already use.
**Scale**: ~250 active metric series at launch. The bounded-enumeration rule (FR-028) is what keeps
that number a constant rather than a function of member count.

### Why Grafana Alloy rather than pushing from the exporter

Prometheus `remote_write` is snappy-compressed protobuf. Implementing it inside the exporter would
mean two new dependencies and a wire format we would then own. Alloy is the vendor's own agent, is
configured by one file, and moves the retry/backoff/WAL problem out of our code entirely. The
exporter's contract stays "expose `/metrics` on loopback", which is also exactly what a test can
assert against.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Security-first contracts | **N/A** | No `contracts/` change. The feature only *reads* chain state, so no smart-contract security review is triggered. |
| II. Test-first | **PASS** | Every collector, the three-state resolver, the aggregator's partial-total logic, the dashboard generator and the gate all ship with tests. |
| III. Honest state | **PASS — and is the feature's core** | Three states, values only on `read`, partial totals named, `planned` sources excluded from totals, cohort boundary respected. FR-006, FR-010…FR-014. |
| IV. Fail loudly in CI | **PASS** | `check:finops` runs in CI without `continue-on-error` (FR-022). |
| V. Accessible frontend | **N/A** | No member-facing surface. Operator dashboards live in Grafana. |
| Key management | **PASS** | Every credential from Secret Manager at runtime, per-container tmpfs env files, redacted at log boundaries, never in Terraform state (G-04). |

### Complexity Tracking

| Added complexity | Why it earns its place | Rejected alternative |
|---|---|---|
| A new service | Collection needs long-lived per-source scheduling and credentials the SPA must never hold. | Collecting in the relay gateway — it is the public surface and is deliberately stateless; adding vendor billing tokens to it widens the blast radius of the one container facing the internet. |
| A new shared package (`packages/finops-catalogue`) | Three consumers in two runtimes need the same list. A copy in each is the exact drift the gate exists to prevent. | A JSON file read by path — loses the schema validation, and the gate would have to re-implement parsing. |
| A third-party SaaS (Grafana Cloud) | Chosen by the issue author over self-hosting and over Managed Prometheus. | Self-hosted Grafana adds a VM cost center to the system that measures cost centers. |
| Generated-and-committed dashboard JSON | Makes the gate a regenerate-and-diff check, the same shape as the repo's existing byte-digest gates. | Hand-written dashboard JSON — 2,000 lines nobody diffs, and the coverage gate becomes unwritable. |

## Project Structure

### Documentation (this feature)

```
specs/089-finops-dashboard/
├── spec.md
├── plan.md              # this file
├── research.md          # source-by-source acquisition research
├── data-model.md        # Source, Reading, Pool, PanelBinding
├── quickstart.md        # local run + provisioning walkthrough
└── contracts/
    ├── metrics.md       # the metric naming + label contract
    └── catalogue-schema.md
```

### Source Code

```
packages/finops-catalogue/          # THE source of truth for what exists
├── src/
│   ├── index.js                    # catalogue + validation + lookup helpers
│   ├── sources.js                  # every revenue + cost source, declared once
│   └── schema.js
└── package.json

services/finops-exporter/
├── src/
│   ├── server.js                   # /metrics (loopback), /healthz, /v1/finops/summary
│   ├── config/index.js             # env + Secret Manager wiring, redaction
│   ├── registry.js                 # three-state readings -> Prometheus text
│   ├── scheduler.js                # per-source intervals, failure isolation
│   ├── aggregate.js                # totals, partial labelling, unit separation
│   ├── collectors/
│   │   ├── feeRouter.js            # 8 services, FeeCharged, per chain
│   │   ├── membership.js           # purchased/upgraded/extended + accrued vs withdrawn
│   │   ├── referral.js             # OpenSea, Gains, GMX, Polymarket
│   │   ├── pools.js                # paymaster deposit, relayer + bundler EOAs, burn/runway
│   │   ├── gcpBilling.js           # BigQuery billing export
│   │   ├── cloudflare.js
│   │   └── quicknode.js
│   └── chain/{providers.js,logs.js}
└── test/

infra/grafana/
├── dashboards/*.json               # GENERATED — never hand-edited
├── alerts/*.json                   # GENERATED
└── alloy/config.alloy              # scrape + remote_write

scripts/finops/
├── generate-dashboards.js          # catalogue -> dashboard + alert JSON
├── check-finops-coverage.js        # the gate (FR-019…FR-023)
└── provision-grafana.js            # push to Grafana Cloud API
```

## Phases

**Phase 1 — catalogue.** Declare every source. This is done first because everything else derives
from it.

**Phase 2 — exporter core.** Scheduler, three-state registry, Prometheus rendering, aggregation. No
collectors yet; the honesty machinery is what needs to be right.

**Phase 3 — collectors.** On-chain first (they need no vendor token and are the highest-value,
lowest-latency sources), then the four cost vendors.

**Phase 4 — dashboards + alerts.** Generate from the catalogue; provision to Grafana Cloud.

**Phase 5 — the gate.** Coverage + regenerate-and-diff, wired into CI.

**Phase 6 — IaC + docs.** Secret containers, IAM, compose/systemd wiring, developer guide, runbook.

## Key Design Decisions

### Three states, two gauges

Every source emits `fairwins_finops_source_configured` and `fairwins_finops_source_up`. `read` is
(1,1); `unreadable` is (1,0); `not-configured` is (0,·). This is deliberately expressible in PromQL
alone — a panel must be able to tell "zero" from "unknown" without anyone reading a log (FR-010).

### Revenue counters are computed from finalized blocks only

Each chain has a confirmation lag. A counter that could decrease on a reorg would break every
`increase()` and `rate()` query built on it, and the breakage would look like a revenue drop.

### Derived KPIs refuse to compute on missing inputs

`recording rules` for unit economics are written so a missing numerator or denominator yields no
sample, not a zero. A cost-per-op of `0` because the op count failed to load is a fabricated number
that reads as excellent news (FR-012).

### The gate is regenerate-and-diff

`check:finops` re-runs the generator into a temp dir and diffs against `infra/grafana/`. Combined
with the catalogue-vs-contracts check, a new fee service fails CI three ways: no catalogue entry, no
emitted metric, no panel. Each failure message names the file to edit (FR-023).
