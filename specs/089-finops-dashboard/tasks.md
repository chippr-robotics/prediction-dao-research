# Tasks: FinOps Dashboard & Alerting

Status as implemented on `claude/finops-grafana-dashboard-pjfc8z`.

## Phase 1 — the catalogue

- [x] **T001** `packages/finops-catalogue` package (plain-Node resolvable, extensioned imports,
      explicit `exports`, zero runtime deps — spec 075 rule 3)
- [x] **T002** `schema.js`: bounded label enumerations + `validateSource` / `validateCatalogue`
- [x] **T003** `sources.js`: 8 fee services, waived fees, 2 membership lines, 4 referral venues,
      2 planned, 4 gas pools, 4 vendors — 25 entries
- [x] **T004** Register as a workspace member; `deps:reinstall`; `check:deps` green

## Phase 2 — exporter core

- [x] **T005** `reading.js` — three states, value only on `read`, `redact`, `attempt`
- [x] **T006** `registry.js` — Prometheus text exposition, honesty triplet, value only on `read`
- [x] **T007** `scheduler.js` — per-source intervals, failure isolation, staleness
- [x] **T008** `burnRate.js` — decrease-only burn, `null` (never `Infinity`) runway
- [x] **T009** `aggregate.js` — per-unit subtotals, partial totals naming missing sources, `ratio`
- [x] **T010** `config/index.js` — env + `describeConfig` (presence only, never a value)

## Phase 3 — collectors

- [x] **T011** `chain/providers.js` (read-only, cohort-scoped) + `chain/logs.js` (chunked, cursors)
- [x] **T012** `collectors/feeRouter.js` — `FeeCharged` + `FeeSkippedNoTreasury`, finalized blocks
- [x] **T013** `collectors/membership.js` — accrued vs received, never summed
- [x] **T014** `collectors/pools.js` — EntryPoint deposit + executor EOAs, derived pool series
- [x] **T015** `collectors/fx.js` — Chainlink feed, rate + age published, stale ⇒ no conversion
- [x] **T016** `collectors/gcpBilling.js` — BigQuery export, per-service, lag metric, capped scan
- [x] **T017** `collectors/cloudflare.js` — GraphQL usage; cost `modelled` (research R1)
- [x] **T018** `collectors/quicknode.js` — credits; metered vs flat-rate models; flat subscriptions
- [x] **T019** `collectors/referral.js` — unset attribution ⇒ `not-configured`, never `$0`
- [x] **T020** `server.js` — `/metrics` (loopback), `/healthz`, `/status`, `/v1/finops/summary`

## Phase 4 — dashboards and alerts

- [x] **T021** `scripts/finops/lib/panels.js` — stat, partial-total, per-source, health, runway,
      KPI (with `and on()` guards), FX provenance
- [x] **T022** `scripts/finops/lib/alerts.js` — runway (2 tiers), per-source staleness, revenue
      stall, cost anomaly, fees waived, FX stale; `noDataState: Alerting` throughout
- [x] **T023** `generate-dashboards.js` — 3 dashboards + alert rules, `--check` mode
- [x] **T024** `provision-grafana.js` — upsert, `--dry-run`, `--detect-drift`
- [x] **T025** `infra/grafana/alloy/config.alloy` — scrape + remote_write + cardinality relabel

## Phase 5 — the gate

- [x] **T026** `check-finops-coverage.js` — C1…C5, every message naming its fix
- [x] **T027** Wire `check:finops` into `test.yml` (no `continue-on-error`)
- [x] **T028** Verified the gate FAILS on an uncatalogued fee service and names the file (SC-004)

## Phase 6 — IaC, tests, docs

- [x] **T029** Terraform: 3 secret containers, dataset-scoped `bigquery.dataViewer`, project
      `bigquery.jobUser`, `billing_export_dataset` variable; `check:iac` green
- [x] **T030** `fetch-secrets.sh`: per-container `finops.env` / `alloy.env`, all optional, refuses to
      boot if key material lands in the exporter's env
- [x] **T031** `docker-compose.yml`: `finops` + `alloy` in the gateway namespace, loopback only,
      persisted Alloy WAL
- [x] **T032** `services/finops-exporter/Dockerfile` (workspace-aware, copies the linked package)
- [x] **T033** Tests: 46 across honesty, burn rate, and end-to-end (SC-002/SC-003)
- [x] **T034** Wire exporter tests into `test.yml`
- [x] **T035** `docs/developer-guide/finops.md` + `docs/runbooks/finops-operations.md`
- [x] **T036** CLAUDE.md guardrail entry

## Deferred — needs credentials or an operator decision

- [ ] **T037** Provision the three Secret Manager payloads (Grafana Cloud, Cloudflare, QuickNode)
      and run `npm run finops:provision`. Until then each source reports `not-configured`, which is
      honest and non-alerting.
- [ ] **T038** Set `FEE_ROUTER_ADDRESS`, `MEMBERSHIP_MANAGER_ADDRESS`, `BUNDLER_EXECUTOR_137` and
      `CLOUDFLARE_ZONE_ID` in the compose environment.
- [ ] **T039** Confirm the Cloudflare and QuickNode plan prices, set `FINOPS_CLOUDFLARE_PLAN_USD`
      and either `FINOPS_QUICKNODE_PLAN_USD` or `FINOPS_QUICKNODE_USD_PER_MCREDIT`. Unset means no
      dollar figure is modelled — usage is still reported.
- [ ] **T040** Build and push the exporter image, then bump the tag in `docker-compose.yml`.
- [ ] **T041** Confirm the `sponsored_ops_total` / `relayed_intents_total` counters. The KPI panels
      reference them and the gateway does not emit them yet; the `and on()` guards mean those two
      panels read "not computed" rather than showing a wrong number until it does.
