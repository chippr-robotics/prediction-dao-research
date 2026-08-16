# Feature Specification: FinOps Dashboard & Alerting (Grafana Cloud)

**Feature Branch**: `claude/finops-grafana-dashboard-pjfc8z`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description — "we need to create a finops dashboard / stream so we can appropriately
manage our finances as we scale. We currently have many sources of potential revenue streams from our
app including memberships, mini app licenses, fees on lending, trading etc. we also have several cost
centers to track such as paymasters, GCP, cloudflare, quicknode, etc. This data should all be
viewable in the grafana dashboards. the goal is to have real time finops management and alerting, we
should be quickly be able to see metrics such as total revenue, costs and kpis. **Any time a new cost
or revenue source is added to the platform we MUST update the dashboard.** the access tokens for
external services are stored in the gcp secrets vault."

## Context: what exists today

There is **no financial observability of any kind**. Not a partial one — a zero.

| Surface | Today | Consequence |
|---|---|---|
| Platform fee revenue (8 `FeeRouter` services) | `FeeCharged` events on chain, read by nobody | Nobody knows what any fee has earned |
| Membership revenue | `MembershipPurchased` / `Upgraded` / `Extended` on the membership chain | Not aggregated; accrued-vs-withdrawn not distinguished anywhere |
| Venue-paid referral revenue (OpenSea, Gains, GMX, Polymarket rewards) | Accrues in venue dashboards behind separate logins | Invisible; nobody has ever reconciled it |
| Paymaster gas cost | EntryPoint deposit drains until sponsorship silently stops | The **only** current signal that it ran out is members reporting failures |
| Relayer / bundler gas cost | Executor EOA balances drain | Same |
| GCP spend | BigQuery `billing_export` dataset, queried by hand during the VM migration | Nobody looks between migrations |
| Cloudflare / QuickNode spend | Vendor dashboards | Not attributed to anything |
| Alerting | `monitoring` module: uptime + VM CPU/disk only | **Every alert is about liveness. None is about money.** |

Two properties of the existing estate shape this feature and are not negotiable:

1. **The honest-state rule (constitution III, sharpened by spec 071)** already governs multi-chain
   reads: every read resolves `read` / `not-deployed` / `unreadable`, a value exists only on `read`,
   and an unreachable source must never render as a zero. FinOps is where that rule matters most —
   *a cost that failed to load and a cost of zero are the difference between "we are fine" and "we
   are bleeding and blind".* A dashboard that renders an unreachable source as `$0` is worse than no
   dashboard, because it manufactures false confidence.

2. **"We MUST update the dashboard" cannot be a convention.** Conventions decay. Every comparable
   invariant in this repo that survived was made a CI gate (`check:storage-layout`,
   `check:iac`, `check:deps`, `TypehashParity`). A prose rule in `CLAUDE.md` asking future authors
   to remember the dashboard would be the one rule with no enforcement, and it would be broken
   within two specs.

## Clarifications

### Session 2026-08-16

- **Q: Where does Grafana run?** **A: Grafana Cloud.** Self-hosting would add a VM cost center to
  the very thing measuring cost centers, plus a public ingress, an auth stack, and disk backups.
  Managed Prometheus + `google_monitoring_dashboard` was the cheapest option but was declined —
  the panel library is the point.
- **Q: Which cost sources are wired now?** **A: all four** — GCP BigQuery billing export,
  paymaster + relayer on-chain gas, Cloudflare, QuickNode.
- **Q: "Mini app licenses" — the `MiniAppRegistry` has no fee, price, or `payable` function, and
  `WagerRegistry` takes no platform cut.** **A: catalogue them as `planned`.** They are real
  intentions, so they belong in the catalogue and on the dashboard; they are not live, so they MUST
  render as *"not yet live"* and MUST NOT contribute `0` to any revenue total. A planned source
  showing `$0` is indistinguishable from a shipped source earning nothing — see FR-014.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See the whole financial picture in one place (Priority: P1)

An operator opens the FinOps overview and, without clicking through, reads total revenue, total cost,
net margin, and runway for every prepaid balance, over a selectable window. Each number carries its
own freshness and its own honesty state.

**Why P1**: this is the ask. Nothing else has value without it.

**Acceptance**:

1. **Given** every source is reachable, **When** the overview loads, **Then** total revenue, total
   cost and net are shown, each broken down by source, and each panel shows the age of its data.
2. **Given** the Cloudflare API is down, **When** the overview loads, **Then** the Cloudflare cost
   panel reads `unreadable` and names the failure, the cost total is **labelled partial and names
   the missing source**, and no panel anywhere shows `$0` for Cloudflare.
3. **Given** a source is `planned` (mini-app licenses), **When** the overview loads, **Then** it is
   listed as *not yet live*, is excluded from totals, and is visually distinct from a live source
   earning zero.

### User Story 2 — Be told before money runs out (Priority: P1)

The paymaster deposit, the relayer executor balances and the bundler executor balance are prepaid
pools. When one drains, sponsorship or relaying stops and members see failures. The operator is
alerted on **projected runway**, not on the raw balance, because a balance threshold that is right at
one burn rate is wrong at another.

**Why P1**: this is the single most expensive failure the estate currently has no signal for. It has
already happened once (2026-07-12).

**Acceptance**:

1. **Given** the paymaster deposit will be exhausted in under 72h at the trailing 24h burn rate,
   **When** the rule evaluates, **Then** a warning alert fires naming the pool, the balance, the burn
   rate and the projected exhaustion time.
2. **Given** the balance is unchanged but burn rate **doubles**, **When** the rule evaluates, **Then**
   runway halves and the alert fires earlier — with no threshold edit.
3. **Given** the balance cannot be read, **When** the rule evaluates, **Then** a *staleness* alert
   fires. It **MUST NOT** resolve the runway alert: an unread balance is not a healthy balance.

### User Story 3 — A new revenue or cost source cannot be forgotten (Priority: P1)

A developer registers a new `FeeRouter` service, or the estate gains a new paid vendor. CI fails until
the catalogue and the dashboard cover it.

**Why P1**: the user stated it as a MUST, and it is the requirement that decides whether the dashboard
is still true in six months.

**Acceptance**:

1. **Given** a new service id exists in the contract or the frontend `FEE_SERVICES` table but not in
   the catalogue, **When** `npm run check:finops` runs, **Then** it fails and names the missing id.
2. **Given** a catalogue entry exists with no dashboard panel binding to its metric, **When** the gate
   runs, **Then** it fails and names the entry.
3. **Given** a catalogue entry names a metric the exporter never emits, **When** the gate runs,
   **Then** it fails — a panel querying a metric that does not exist renders as "No data", which on a
   revenue dashboard is indistinguishable from "no revenue".

### User Story 4 — Attribute cost to what caused it (Priority: P2)

The operator asks "what does a sponsored transaction actually cost us?" and reads unit economics:
cost per sponsored UserOp, cost per relayed intent, infrastructure cost per active member, and gross
margin per revenue line.

**Acceptance**:

1. **Given** paymaster gas spend and sponsored-op count over the same window, **When** the KPI panel
   renders, **Then** cost-per-sponsored-op is shown with its window.
2. **Given** either input is `unreadable`, **When** the panel renders, **Then** the ratio is **not**
   computed — a ratio built on a missing denominator is a fabricated number, not an estimate.

### User Story 5 — Spend and revenue anomalies surface on their own (Priority: P2)

**Acceptance**:

1. **Given** daily GCP spend exceeds its trailing 7-day mean by a configured factor, **Then** an
   anomaly alert fires naming the GCP service that moved.
2. **Given** a fee service earned revenue every day for 14 days and earns nothing for 24h, **Then** a
   *revenue stall* alert fires — a fee path that silently broke looks exactly like a quiet day, and
   only the history distinguishes them.

### Edge Cases

- **A chain is unreachable.** Per-chain isolation: other chains still report, the total is labelled
  partial and names the missing chain. Never a zero.
- **Multiple units.** Revenue arrives in USDC, native gas tokens, and vendor invoices in USD.
  Subtotals are per-unit; a USD roll-up exists only where a price is available, is labelled as
  converted, and names its rate source and age. A missing price yields a per-unit subtotal, not a
  guessed USD figure.
- **Accrued vs received.** Membership fees accrue in the contract until `FeesWithdrawn`. These are
  **two different numbers** and are never summed (spec 071 established this; it is restated because
  a revenue dashboard is exactly where someone would add them).
- **Backfill vs real time.** BigQuery billing export lags by hours and is not retroactive. Its
  panels state the lag. A lagging source is never presented at the same freshness as an on-chain read.
- **A vendor token is absent.** The source resolves `not-configured` — distinct from `unreadable`.
  Nothing is broken; that source is simply not wired. It does not alert and does not count as an
  outage.
- **Reorgs.** On-chain revenue counters are computed from finalized blocks with a per-chain
  confirmation lag, so a reorg cannot make a monotonic revenue counter go backwards.
- **Cardinality.** Metric labels are bounded to the catalogue's own enumerations. A per-member or
  per-wager label would exceed the Grafana Cloud free-tier series budget within days.

## Requirements *(mandatory)*

### Functional Requirements

**The catalogue**

- **FR-001**: A single machine-readable catalogue MUST enumerate every revenue and cost source. It is
  the only place a source is declared, and the exporter, the dashboard generator and the CI gate all
  read it.
- **FR-002**: Each entry MUST carry: stable `id`, `kind` (`revenue` | `cost`), `status`
  (`live` | `planned` | `retired`), human `label`, the `metric` name the exporter emits, its `unit`,
  the collector that produces it, and prose saying what the number means.
- **FR-003**: The catalogue MUST NOT contain credentials, endpoints or account identifiers. Those are
  configuration; the catalogue is a description and is world-readable in the repo.

**Collection**

- **FR-004**: Revenue MUST be collected for: all 8 `FeeRouter` services (`earn.lend`,
  `polymarket.taker`, `polymarket.maker`, `stake.lido`, `stake.polygon`, `bridge.transfer`,
  `liquidity.deposit`, `perps.hyperliquid.builder`); membership purchases/upgrades/extensions;
  venue-paid referral (OpenSea, Gains, GMX, Polymarket builder + weekly rewards).
- **FR-005**: Cost MUST be collected for: GCP (per service, from the BigQuery billing export),
  Cloudflare, QuickNode, paymaster EntryPoint deposit burn, relayer executor gas, bundler executor gas.
- **FR-006**: Every collector MUST resolve to exactly one of `read` / `not-configured` /
  `unreadable`, and a value MUST exist only on `read`.
- **FR-007**: A collector failure MUST be isolated: one failing source never prevents another from
  reporting, and never fails the exporter's scrape.
- **FR-008**: On-chain reads MUST go through the existing provider seam and MUST respect the
  cohort boundary — a mainnet build never reads testnet financial data into the same series
  (constitution III).
- **FR-009**: Collection intervals MUST be per-source and matched to how fast the source actually
  changes. On-chain balances poll fast; the BigQuery billing export does not become fresher by being
  queried more often, and querying it is itself billable.

**Honesty on the surface**

- **FR-010**: Every source MUST emit a companion `..._source_up` gauge (`1` read, `0` unreadable) and
  a `..._last_success_timestamp`. A panel MUST be able to distinguish "zero" from "unknown" using only
  metrics, without consulting logs.
- **FR-011**: A total that is missing a contributing source MUST be labelled partial and MUST name the
  missing source. It MUST NOT be silently understated.
- **FR-012**: A derived KPI MUST NOT be computed when any input is unavailable.
- **FR-013**: Any USD conversion MUST name its rate source and the rate's age, and MUST be visually
  distinguished from a natively-USD figure.
- **FR-014**: A `planned` source MUST render as *not yet live*, MUST be excluded from every total,
  and MUST NOT emit a zero-valued revenue metric.

**Alerting**

- **FR-015**: Prepaid-pool alerts MUST fire on projected runway derived from the trailing burn rate,
  not on a static balance floor.
- **FR-016**: A staleness alert MUST exist for every source, and MUST NOT resolve or suppress that
  source's value alerts.
- **FR-017**: Alert rules MUST be declared as code in the repo and provisioned from it; a rule created
  in the Grafana UI is drift and the provisioner MUST surface it.
- **FR-018**: Every alert MUST name the source, the observed value, the threshold, and the runbook
  section that resolves it.

**The gate (the user's MUST)**

- **FR-019**: `npm run check:finops` MUST fail when a fee service id exists in the contracts or the
  frontend fee table with no catalogue entry.
- **FR-020**: It MUST fail when a catalogue entry has no dashboard panel bound to its metric.
- **FR-021**: It MUST fail when a catalogue entry names a metric no collector emits.
- **FR-022**: It MUST run in CI and MUST NOT carry `continue-on-error` (constitution IV).
- **FR-023**: Its failure message MUST state the exact file and edit that resolves it. A gate that
  fails without saying how to satisfy it gets disabled.

**Secrets and access**

- **FR-024**: Every external credential MUST be read from GCP Secret Manager at runtime. None is ever
  committed, logged, or written into Terraform state (guardrail G-04).
- **FR-025**: Credentials MUST be redacted at every display and log boundary.
- **FR-026**: The exporter MUST hold read-only credentials only. It reports on money; it must never be
  able to move any.
- **FR-027**: The exporter MUST NOT be publicly reachable. It exposes no member-facing surface.

**Cardinality and cost**

- **FR-028**: Metric labels MUST be drawn from bounded enumerations declared in the catalogue. No
  member address, wager id, or transaction hash may ever become a label.
- **FR-029**: The exporter's own operating cost (including billing-export query spend) MUST itself be
  a catalogued cost source. A FinOps system that hides its own cost is not credible.

### Key Entities

- **Source** — a revenue or cost stream. Identity, status, unit, collector, metric, meaning.
- **Reading** — one collection attempt: state, value (only when `read`), unit, timestamp, and on
  failure a reason.
- **Pool** — a prepaid balance with a burn rate and a derived runway (paymaster deposit, executor EOAs).
- **Panel binding** — the link from a catalogue entry to the dashboard panel that displays it. The
  gate's subject.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Total revenue, total cost and net are readable within 10 seconds of opening the
  overview, for any window from 1 hour to 90 days.
- **SC-002**: Every one of the 8 fee services, both membership revenue lines, all 4 referral venues
  and all 6 cost centers appears on the dashboard with a live value or an explicit honest state.
- **SC-003**: Killing any single source's credential produces `unreadable` on exactly that panel, a
  partial-total label naming it, and zero `$0` renderings — verified by test.
- **SC-004**: Adding a fee service without touching the catalogue fails CI, and the failure message
  names the file to edit — verified by test.
- **SC-005**: On-chain revenue and pool balances are no more than 60s stale; vendor cost sources no
  more than one collection interval plus the vendor's own documented lag, which is displayed.
- **SC-006**: A prepaid pool crossing its runway threshold alerts within one evaluation interval, and
  the alert names the pool, burn rate and projected exhaustion.
- **SC-007**: Total metric series stay within the Grafana Cloud free-tier budget with headroom for
  growth in every bounded enumeration.

## Assumptions

- Grafana Cloud free tier is sufficient at current scale; the design does not depend on paid features.
- The BigQuery `billing_export` dataset exists and is populated (referenced by `docs/runbooks/vm-migration.md`).
- Vendor API tokens will be provisioned into Secret Manager during this session; until each lands, its
  source reports `not-configured`, which is a first-class state and not a failure.
- Reading financial data does not require any new on-chain contract. No `contracts/` change is in
  scope, and therefore no smart-contract security review is triggered.
- "Real time" means seconds-to-minutes for on-chain sources and vendor-lag-bound for billing sources.
  The dashboard states which it is showing rather than implying uniform freshness.

## Out of Scope

- Any member-facing financial surface. This is an operator tool.
- Accounting, tax treatment, revenue recognition, or anything presented as an authoritative
  financial record. This is operational telemetry.
- Automated spend controls. The dashboard observes and alerts; a human acts.
- Backfill of history predating the exporter, except what the BigQuery billing export already holds.
