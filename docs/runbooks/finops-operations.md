# Runbook: FinOps operations

Operating the FinOps exporter, dashboards and alerts (spec 089).

Every alert rule links to a section here by anchor. If you add an alert, add its section — an alert
that says what is wrong but not what to do gets acknowledged and forgotten.

## The one thing to understand first

**A missing number is never shown as zero.** Every source resolves to exactly one of three states:

| State | Means | Alerts? |
|---|---|---|
| `read` | We got a value. | no |
| `unreadable` | The source IS configured and we could not read it. | **yes** — staleness |
| `not-configured` | No credential/config. Nothing is broken; it is not wired up. | no |

On the dashboard: `source_configured == 1 && source_up == 1` is `read`; `configured == 1 && up == 0`
is `unreadable`; `configured == 0` is `not-configured`. The **Source health** table on the overview
shows all three, and it is where you confirm that a zero elsewhere is a real zero.

If a total is missing a live source, the **"sources currently MISSING"** table names it and the total
is partial. An empty table means every live source reported.

## Provisioning

Dashboards and alerts are generated from the catalogue and pushed from the repo. A dashboard edited
in the Grafana UI is **drift** and is overwritten on the next provision.

```bash
npm run finops:generate                        # regenerate infra/grafana/ from the catalogue
npm run check:finops                           # verify coverage + that the committed tree is fresh
GRAFANA_URL=... GRAFANA_API_TOKEN=... npm run finops:provision -- --dry-run
GRAFANA_URL=... GRAFANA_API_TOKEN=... npm run finops:provision
GRAFANA_URL=... GRAFANA_API_TOKEN=... npm run finops:provision -- --detect-drift
```

The token lives in Secret Manager as `finops-grafana-cloud-token`. Never paste it on a command line
on a shared host — export it from `gcloud secrets versions access`.

## Adding a revenue or cost source

This is the workflow the brief made a MUST, and CI enforces it.

1. Add an entry to `FEE_SERVICES` (for a fee) or the appropriate array in
   `packages/finops-catalogue/src/sources.js`.
2. If it needs a new collector, add `services/finops-exporter/src/collectors/<name>.js` and register
   it in `server.js`.
3. `npm run finops:generate`
4. `npm run check:finops` — it names any remaining gap and the exact file to edit.
5. Commit the regenerated `infra/grafana/` tree.

`npm run check:finops` fails on: an uncatalogued fee service, a catalogued metric nothing emits, a
source with no panel, and a stale committed dashboard.

## Alert response

### prepaid-pools

**Prepaid pool runway under 24h / 72h.**

The paymaster deposit and the executor EOAs are prepaid. When one empties, sponsorship or relaying
**stops** and members see failures. This has happened (2026-07-12).

Alerts fire on projected runway, not a balance floor, because a floor that is right at one burn rate
is wrong at another.

1. Check the **Prepaid pool balances** and **runway** panels for which pool and how fast.
2. Top up:
   - `paymaster-137` — send POL to the paymaster's `deposit()`, or `depositTo` the paymaster at the
     EntryPoint. See `docs/runbooks/paymaster-operations.md`.
   - `relayer-137` / `relayer-63` — fund the gas wallet for that chain
     (`docs/runbooks/relayer-operations.md`).
   - `bundler-137` — fund the alto executor EOA.
3. Confirm the balance panel moves within one collection interval (60s).

**A pool with no runway line is not a healthy pool.** It means burn rate is zero or unmeasured. Check
Source health: if the pool is `unreadable`, you are flying blind and should treat it as urgent.

### source-health

**FinOps source stale: `<source>`.**

A configured source has not been read for more than 4× its interval. Its panels show no data and any
total including it is partial.

1. `/status` on the exporter (from the gateway VM: `curl -s localhost:9464/status | jq`) shows every
   source's state and a redacted reason.
2. Common causes: an expired vendor token, an RPC endpoint down, a rotated secret that the container
   has not picked up (secrets are fetched at boot into tmpfs — restart the stack, do not restart one
   container: `systemctl restart fairwins-stack@gateway`).
3. If the source is genuinely retired, set its `status` to `retired` in the catalogue and
   regenerate. Do not leave a dead source alerting; that is how an alert channel gets muted.

### fees-waived

**Platform fees are being waived (no treasury configured).**

`FeeRouter` emitted `FeeSkippedNoTreasury`: a fee path is live but has no treasury set, so members
are being charged nothing and we are earning nothing. This is invisible in every other view — it
looks exactly like a quiet day.

1. Read the FeeRouter's treasury on the affected chain.
2. Set it via the AdminPanel Fees tab (`FEE_ADMIN_ROLE`), or on-chain.
3. See `docs/runbooks/fee-operations.md`.

The waived amount is the revenue forgone while it was misconfigured. It is never added to any
revenue total.

### revenue-stall

**Revenue stalled on a source that normally earns.**

A source that earned over the last 14 days has earned nothing for 24h. A silently broken fee path
looks identical to a quiet day; only the baseline distinguishes them.

1. Confirm the source is `read` (not stale) — a stale source raises its own alert and this one is
   about a *readable* source reporting nothing.
2. Check the fee rate on chain: a rate set to 0 earns nothing legitimately, and that is a
   configuration change somebody made, not a fault.
3. Check the product surface: is the path reachable? Predict hides off Polygon; Perps hides when
   `PERPS_ENABLED` is false; a mini-app can be un-`launchable`.

### cost-anomaly

**Daily cost above 2× the trailing 7-day mean.**

1. On the **Cost** dashboard, find which `gcp_service` moved (GCP is broken out per service).
2. Common causes: a runaway Cloud Run scale-out, a BigQuery query scanning more than expected, image
   storage growth in Artifact Registry.
3. Remember the **basis** label: only GCP is `billed`. A jump in a `modelled` figure is a jump in
   *usage* or in a plan price somebody edited, not necessarily in an invoice.

### fx-rate

**FX rate is stale — USD figures unavailable.**

The Chainlink feed backing every USD conversion has not updated. USD cost figures **stop being
produced** rather than being converted at a rate we know is old. Native-unit figures are unaffected
and remain exact.

1. Check the feed on chain and the RPC health for the FX chain.
2. Nothing is broken financially; this is a display degradation, and the dashboard says so.

## Per-source notes

### fee-revenue

The 8 `FeeRouter` services. Read from `FeeCharged` events over **finalized** blocks, so a reorg
cannot make a counter go backwards. Several services ship at 0 bps — a genuine zero here is expected
and is not the same as an unread source.

Counters are cumulative **since the exporter started** (cursors are in memory). A restart resets the
window; the dashboard states this rather than implying all-time totals.

### membership-revenue

Two numbers that are **never summed**:

- `membership-received` — withdrawn to treasury (`FeesWithdrawn`). Money that has arrived.
- `membership-accrued` — earned and still in the contract. Money that has not.

Adding them double-counts every fee that has since been withdrawn. This is the spec-071 rule; a
revenue dashboard is exactly where somebody would break it.

### referral-revenue

Mostly `not-configured` today, and correctly so: `OPENSEA_REFERRAL_ADDRESS` is empty and the
Gains/GMX codes are unset in production — no code is registered, so there is nothing to earn.
Polymarket's builder code **is** registered; its weekly rewards need `POLYMARKET_API_KEY`.

To light one up, register the code with the venue and set the corresponding env var. The source
moves from `not-configured` to `read` on the next interval.

### gcp-cost

The **only** `billed` cost source. From the BigQuery `billing_export` dataset.

- It **lags hours**. The lag is exported as `source_lag_seconds` and shown on the panel. Do not
  compare it to a chain read as if equally fresh.
- It is **not retroactive** — it holds nothing from before the export was enabled.
- Querying it is billable, which is why the interval is 6h and `maximumBytesBilled` is capped.

Access is dataset-scoped `roles/bigquery.dataViewer` plus project `roles/bigquery.jobUser`. Project-
level dataViewer is deliberately **not** granted: this is a shared project.

### cloudflare-cost

**Cloudflare publishes no dollar figure.** The GraphQL Analytics API returns requests and bytes; the
dollar figure on the dashboard is `modelled` from `FINOPS_CLOUDFLARE_PLAN_USD`.

The usage is real and is exported separately as `vendor_usage`. Token needs Zone → Analytics: Read.

### quicknode-cost

**QuickNode reports credits, not dollars.** `GET /v0/usage/rpc` returns API-credit consumption.

- On a metered plan set `FINOPS_QUICKNODE_USD_PER_MCREDIT`.
- On Flat Rate RPS set `FINOPS_QUICKNODE_PLAN_USD`; credits are then informational only, because
  spend is decoupled from usage.

If the plan includes the enterprise `/exporter/prometheus` endpoint, set `QUICKNODE_PROMETHEUS_URL`
— it is the vendor's own metrics and is preferred over parsing the usage JSON.

### self-cost

What this system costs: the Grafana Cloud plan plus the BigQuery query spend the exporter incurs.
Catalogued on purpose — a FinOps system that hides its own cost is not credible about anything else.

The free tier really is $0 — but assert it by setting `FINOPS_GRAFANA_PLAN_USD=0`. Left unset, the
source reports `not-configured`, because "we confirmed the free tier" and "nobody ever set this" are
different facts and a defaulted zero renders as the first while meaning the second.

It stops being zero the moment the series budget is exceeded, which is what the cardinality rules
exist to prevent.

### planned-sources

`miniapp-licenses` and `wager-platform-fee` are declared but **not live**: `MiniAppRegistry` has no
fee or `payable` function, and `WagerRegistry` takes no platform cut. They render as *not yet live*,
contribute nothing to any total, and emit no metric.

When one ships, change its `status` to `live`, give it a `metric` and a collector, and regenerate.
The gate already knows its name.

## Rotating a credential

```bash
# 1. Add a new version (payloads are never in Terraform state — guardrail G-04)
printf '%s' "$NEW_TOKEN" | gcloud secrets versions add finops-cloudflare-token \
  --project=chippr-bots-site-wp --data-file=-

# 2. Secrets are fetched into tmpfs at BOOT. Restart the whole stack, never one container —
#    the containers share one network namespace.
gcloud compute ssh fairwins-gateway --tunnel-through-iap --command \
  'sudo systemctl restart fairwins-stack@gateway'

# 3. Confirm
curl -s localhost:9464/status | jq '.config.credentials'
```

`/status` reports credential **presence** only, never any part of a value.

## What this system is not

- Not an accounting system. It is operational telemetry, not an authoritative financial record, and
  nothing here is suitable for tax or revenue recognition.
- Not a spend control. It observes and alerts; a human acts.
- Not member-facing. It is an operator tool with no public surface.
