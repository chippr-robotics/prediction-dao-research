# Research: source acquisition

Every source below was checked for *how the number is actually obtained* before any code was
written, because two of the four vendors turned out not to expose the number we assumed they did.

## R1 — Neither Cloudflare nor QuickNode exposes spend on our plan

This is the most consequential finding in this document.

| Vendor | What the API actually returns | What it does NOT return |
|---|---|---|
| Cloudflare | `httpRequests1dGroups` via the GraphQL Analytics API: requests, cached requests, bytes, cached bytes, threats, uniques | **Any dollar amount.** Cloudflare billing is a plan subscription; there is no public billing API for it. |
| QuickNode | `GET /v0/usage/rpc` on the Admin API: **API credit** consumption | **Any dollar amount.** Credits convert to dollars via plan-specific pricing, and a Flat Rate RPS plan decouples spend from usage entirely. |

Two ways to be dishonest here, both rejected:

1. Emit no cost for them, so the cost total silently excludes two real vendors.
2. Emit a computed dollar figure alongside GCP's and let the dashboard add them up as if they were
   the same kind of number. They are not: GCP's comes from a billing export of what was actually
   charged; the other two would come from us multiplying usage by a rate we typed into a config file.

**Decision.** Cost metrics carry a mandatory `basis` label with exactly two values:

- `basis="billed"` — sourced from a billing record (GCP only).
- `basis="modelled"` — computed from usage × a declared plan rate, or a declared flat subscription.

Totals are broken out by basis, the dashboard labels modelled figures as modelled, and a modelled
figure is never presented as an invoice. Vendor **usage** is additionally exported raw
(`fairwins_finops_vendor_usage`), because usage is a fact even when the dollar figure is a model.

## R2 — Cloudflare GraphQL

- Endpoint: `https://api.cloudflare.com/client/v4/graphql`
- Auth: `Authorization: Bearer <token>`. A scoped API token needs **Zone → Analytics: Read**
  (and Account/Zone **Logs: Read** for the adaptive datasets). A Global API Key also works and is
  explicitly not used — it is account-wide and cannot be scoped read-only to one zone.
- Query: `viewer.zones(filter:{zoneTag})` → `httpRequests1dGroups(filter:{date_geq,date_leq})` with
  `dimensions{date}` and `sum{requests bytes cachedRequests cachedBytes threats}`.
- Daily granularity. Polling faster than daily gains nothing, so the collector's interval is long and
  the panel states the granularity.

## R3 — QuickNode Admin API

- Base: `https://api.quicknode.com/v0`, auth header `x-api-key`, `accept: application/json`.
- `GET /v0/usage/rpc` returns API-credit consumption.
- QuickNode also documents a `/exporter/prometheus` endpoint for enterprise plans. If our plan has
  it, it is strictly better than parsing the usage JSON, so the collector prefers it when configured
  and falls back to `/v0/usage/rpc`. Neither is assumed present: absent config ⇒ `not-configured`.

## R4 — GCP is the only true billing source

The BigQuery `billing_export` dataset (referenced by `docs/runbooks/vm-migration.md`, which already
queries `billing_export.gcp_billing_export_v1_*`) holds actual charged cost with SKU and service
breakdown. Two properties that must reach the dashboard rather than being smoothed over:

- **It lags.** Rows land hours after the spend. A panel showing it beside an on-chain balance read
  60 seconds ago must say so, or the two look equally fresh.
- **It is not retroactive.** It holds nothing from before it was enabled. There is no backfill to
  write; history starts where the export starts.

Querying it is itself billable, which is why the collector's interval is hours, not seconds, and why
the exporter's own query spend is a catalogued cost source (FR-029).

## R5 — On-chain revenue: events, not balances

Treasury balance is the wrong primitive for revenue. It moves on withdrawal, transfer and airdrop,
so a balance delta attributes nothing and can go down for reasons that are not costs.

Revenue is read from events:

| Source | Event | Contract |
|---|---|---|
| 8 fee services | `FeeCharged(serviceId, payer, asset, grossAmount, feeAmount, vault, receiver)` | `FeeRouter` |
| Membership | `MembershipPurchased` / `MembershipUpgraded` / `MembershipExtended` | `MembershipManager` |
| Membership withdrawal | `FeesWithdrawn(to, amount)` | `MembershipManager` |

`FeeSkippedNoTreasury` is deliberately also collected: a fee that was *waived because no treasury was
set* is revenue we did not earn for a fixable reason, and it is invisible in every other view.

**Accrued vs received.** Membership fees accrue in the contract until `FeesWithdrawn`. Spec 071
already established these are two numbers that are never summed; a revenue dashboard is precisely
where someone would add them, so they are separate metrics with separate panels.

**Reorg safety.** Counters are computed only over blocks at or below `head - confirmations(chain)`.
A monotonic counter that could rewind would corrupt every `increase()` query built on it, and the
corruption would render as a revenue drop.

## R6 — Prepaid pools and why the alert is on runway

| Pool | Read | Drains because |
|---|---|---|
| Paymaster deposit | `FairWinsVerifyingPaymaster.getDeposit()` (EntryPoint v0.6, Polygon) | Every sponsored UserOp |
| Relayer executors | Native balance of `GAS_WALLET_63`, `GAS_WALLET_137` | Every relayed intent |
| Bundler executor | Native balance of the alto executor EOA | Every bundle |

A static balance floor is wrong at any burn rate other than the one it was chosen for: at 10× traffic
a "safe" floor is minutes of runway. Alerts therefore fire on `balance / burn_rate` using a trailing
window, so the threshold stays meaningful without anyone editing it (FR-015).

A balance that cannot be read is **not** a healthy balance — staleness alerts are separate and never
resolve the runway alert (FR-016).

## R7 — Venue-paid referral revenue

OpenSea (spec 055), Gains and GMX (spec 082) pay referral/fee shares at the venue; Polymarket pays a
builder fee plus weekly rewards (spec 057). Two facts from the live config matter:

- `OPENSEA_REFERRAL_ADDRESS` is empty and `PERPS_GAINS_REFERRER` / `PERPS_GMX_REF_CODE` are
  deliberately unset in `infra/vm/gateway/docker-compose.yml` — no code is registered, so these earn
  **nothing** today, on purpose.
- Polymarket's builder code *is* set, with taker 50 bps / maker 0.

An unset attribution id is a `not-configured` source, not a failure and not zero revenue. The
distinction is the point: `not-configured` says "we have not wired this up", which is actionable,
where `$0` says "we wired it up and it earns nothing", which is not true.

Where a venue exposes an earnings API it is polled; where it does not, the *attributable volume* we
routed is exported and the earnings figure is `modelled` per R1. Venue earnings are never presented
as billed revenue.

## R8 — Mini-app licenses and wager fees do not exist

`contracts/apps/MiniAppRegistry.sol` has no fee, no price, and no `payable` function.
`WagerRegistry` takes no platform cut. Both were named in the brief as revenue streams.

They are catalogued with `status: 'planned'` so they appear on the dashboard as *not yet live*, are
excluded from totals, and emit no zero-valued revenue metric (FR-014). Cataloguing them now also
means the day one ships, the gate already knows its name.

## R9 — Cardinality budget

Grafana Cloud's free tier bounds active series. Every label value comes from a catalogue enumeration:
`source` (~20), `chain` (≤6), `unit` (~5), `basis` (2), `gcp_service` (~15). Estimated ~250 active
series with headroom.

Rejected: labelling by member address, wager id, or transaction hash. Any of them makes series count
a function of usage, which exhausts the tier in days and turns the observability system into a cost
center that outgrows what it observes.

## R10 — Why Alloy scrapes rather than the exporter pushing

Prometheus `remote_write` is snappy-compressed protobuf. Implementing it in the exporter means owning
a wire format, a WAL, and retry/backoff. Grafana Alloy is the vendor's agent, is one config file, and
keeps the exporter's contract at "expose `/metrics` on loopback" — which is also exactly what a unit
test can assert.
