# FinOps: revenue and cost observability

Spec 089. Real-time financial telemetry for the platform — every revenue stream and every cost
centre, in Grafana Cloud, with alerting on the things that cost money when they break.

## The shape of it

```
packages/finops-catalogue     THE list of every revenue and cost source
        │
        ├─→ services/finops-exporter    polls each source, emits Prometheus metrics on loopback
        │        └─→ Grafana Alloy (sidecar) ─→ Grafana Cloud
        │
        ├─→ scripts/finops/generate-dashboards.js  →  infra/grafana/  (committed)
        │
        └─→ scripts/finops/check-finops-coverage.js  →  npm run check:finops  (CI gate)
```

The service is not the interesting part. **The catalogue is.** One file declares every source, and
the exporter, the dashboards and a CI gate all derive from it — which is what turns "remember to
update the dashboard" into a build failure.

## Four rules

### 1. A value exists only in state `read`

Every source resolves to exactly one of `read` / `not-configured` / `unreadable`, and
`services/finops-exporter/src/reading.js` is where that is enforced: three constructors, and only one
of them accepts a number. There is no code path that produces "zero because the read failed".

This matters more here than anywhere else in the codebase. On a cost dashboard, a source that failed
to load and a source that cost nothing are the difference between *"we are fine"* and *"we are
bleeding and blind"* — and they render identically the moment a zero is allowed to stand in for an
absence.

The metrics express it in PromQL alone:

```
read            source_configured == 1  and  source_up == 1
unreadable      source_configured == 1  and  source_up == 0
not-configured  source_configured == 0
```

`not-configured` is a first-class state, not a soft failure. It says "we have not wired this up",
which somebody can act on. `$0` says "we wired it up and it earns nothing", which would be false.
Three of the four referral sources are `not-configured` in production today, correctly.

### 2. `billed` and `modelled` are different kinds of number

**Neither Cloudflare nor QuickNode publishes a dollar figure on our plan** (research R1). Cloudflare's
GraphQL API returns requests and bytes; QuickNode's Admin API returns API credits. Only GCP's
BigQuery billing export says what we were actually charged.

So every cost metric carries a mandatory `basis` label:

- `basis="billed"` — from a billing record. GCP only.
- `basis="modelled"` — usage × a rate we typed into config, or a declared flat subscription.

Panels label modelled figures as modelled, totals break out by basis, and vendor **usage** is
exported separately as `vendor_usage` because usage is a fact even when the dollar figure is a model.

Never collapse the two. Presenting our own arithmetic as an invoice is the specific dishonesty this
label exists to prevent.

### 3. Alert on runway, not on balance

The paymaster deposit and the executor EOAs are prepaid pools. When one empties, sponsorship or
relaying **stops**. A static balance floor is only correct at the burn rate it was chosen for — at
10× traffic a "safe" floor is minutes of warning — so alerts fire on `balance / burn_rate`.

Two subtleties in `burnRate.js`, both of which fail toward *looking healthy*:

- Only **decreases** count as burn. A top-up inside the window would otherwise produce negative burn,
  which divides into infinite runway.
- When burn is zero or unknown, runway is **`null` and the metric is absent** — never `+Inf`, which
  every alert rule reads as a pool in perfect health.

Staleness alerts are separate and never resolve a runway alert. A balance that cannot be read is not
a healthy balance.

### 4. Labels come from bounded enumerations

`source`, `kind`, `status`, `unit`, `chain`, `basis`, `pool`, `gcp_service` — all declared in
`packages/finops-catalogue/src/schema.js`. Roughly 250 active series, and that number is a constant
rather than a function of member count.

Never label by member address, wager id, or transaction hash. Any of them exhausts the Grafana Cloud
tier within days and turns the observability system into a cost centre bigger than what it observes.
Alloy carries a relabel rule that drops address-shaped label values as a last line of defence; the
primary defence is that the exporter never emits one.

## Adding a source — the rule the brief made a MUST

```bash
# 1. declare it
$EDITOR packages/finops-catalogue/src/sources.js

# 2. collect it (skip if an existing collector covers it)
$EDITOR services/finops-exporter/src/collectors/<name>.js

# 3. regenerate + verify
npm run finops:generate
npm run check:finops
```

`check:finops` runs in CI and fails on:

| Check | Fails when |
|---|---|
| C1 | a catalogue entry is malformed |
| C2 | a `FeeRouter` service exists in the platform with no catalogue entry (or vice versa) |
| C3 | a catalogued metric is one no collector emits |
| C4 | a catalogued source has no dashboard panel |
| C5 | the committed `infra/grafana/` tree is stale |

Every failure names the file and the edit that resolves it. C2 reads the fee services out of
`frontend/src/lib/fees/feeQuote.js` and `services/relay-gateway/src/fees/onchain.js`, both of which
are themselves checked against the contracts by the spec-060 suite — so the loop closes at the chain.

**Never hand-edit `infra/grafana/`.** It is generated, and C5 will tell you so.

## What is deliberately not live

`miniapp-licenses` and `wager-platform-fee` are catalogued with `status: 'planned'`. Both were named
in the brief as revenue streams and neither exists on chain: `MiniAppRegistry` has no fee, price or
`payable` function, and `WagerRegistry` takes no platform cut.

A planned source declares **no metric**, emits no value, and is excluded from every total. It renders
as *NOT YET LIVE*. The alternative — showing `$0` — is indistinguishable from a shipped source
earning nothing, and would quietly close a question that is still open.

## Deployment

The exporter and Alloy run as two more containers in the **gateway VM's network namespace**
(`infra/vm/gateway/docker-compose.yml`), the same pattern the engine and redis use — so Alloy reaches
`localhost:9464` verbatim.

- The exporter binds **127.0.0.1** and declares no `ports:`. nginx does not proxy it; it has no
  member-facing surface.
- It holds **read-only vendor credentials only**, in their own tmpfs env file.
  `fetch-secrets.sh` refuses to boot if key material lands there — it reports on money and must never
  be able to move any.
- Secrets are fetched at boot. After rotating one, restart the **whole stack**
  (`systemctl restart fairwins-stack@gateway`), never a single container.

GCP access is `roles/bigquery.jobUser` at project level plus **dataset-scoped**
`roles/bigquery.dataViewer` on the billing export. Project-level dataViewer is deliberately not
granted: `chippr-bots-site-wp` is shared with unrelated Chippr workloads.

## Local development

```bash
npm test --workspace fairwins-finops-exporter   # 46 tests; the honesty suite is the load-bearing one
node services/finops-exporter/src/server.js     # boots with everything not-configured, honestly
curl -s localhost:9464/metrics
curl -s localhost:9464/status | jq              # per-source states, credential PRESENCE only
curl -s localhost:9464/v1/finops/summary | jq   # totals with completeness verdicts
```

With no configuration at all the exporter starts and reports every source as `not-configured`. That
is the correct output, and it is worth looking at once — it is the shape every panel takes before a
credential lands.

See also `docs/runbooks/finops-operations.md` and `specs/089-finops-dashboard/`.
