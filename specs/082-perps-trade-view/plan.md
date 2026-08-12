# Implementation Plan: Perps — Cross-Protocol Perpetual-Futures Markets in Trade

**Branch**: `claude/perpetual-futures-integration-texoyy` | **Date**: 2026-08-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/082-perps-trade-view/spec.md`

## Summary

Add a **Perps** view inside the Trade section (`/wallet?tab=trade&view=perps`) that
merges perpetual-futures pairs from **Gains Network** (Arbitrum/Base/Polygon), **GMX
v2** (Arbitrum), and **Hyperliquid** (non-EVM venue) into one searchable, sortable
insight surface — live price, funding rate (interval-labeled), open interest, max
leverage — plus the connected member's own open positions per venue (read-only). A new
relay-gateway `perps/` module proxies and caches the three venues' public APIs
(mirroring `polymarket/`), isolates per-venue failures, and serves public attribution
config + the live Hyperliquid builder-fee bps. Fee governance rides spec 060: one new
`ConfigOnly` service `perps.hyperliquid.builder` (cap 10 bps — Hyperliquid's own perps
limit) administered from the existing Fees tab; Gains/GMX referral economics are fixed
venue-paid shares, disclosed but not configurable. Outbound "Trade on <venue>" links
carry FairWins attribution (GMX ref code / Gains referrer / Hyperliquid builder) with
plain-link fallback. Reporting: an activity-feed snapshot-diff source for position
changes and a `perps` block in gateway `/status`. **No smart-contract code changes**;
in-app execution is deferred to a follow-up spec (research D9). Decision log:
[research.md](research.md).

## Technical Context

**Language/Version**: JavaScript ESM — Node ≥20 (gateway), Node ≥22 + React 19 (frontend)

**Primary Dependencies**: gateway: Express 4 + native `fetch` (no new npm deps; three
upstream clients with injected `fetchImpl`); frontend: existing stack only (React,
wagmi/ethers untouched — no on-chain reads in this release beyond what fee quoting
already does via the gateway)

**Storage**: none persistent; gateway in-memory read caches (pairs ~15s, positions
~10s, config/fee 30s); frontend transient hook state + spec-031 snapshot store for the
position-diff source

**Testing**: node:test + injected fetch fixtures (gateway); Vitest + Testing Library +
vitest-axe (frontend); Cypress fast-suite spec with `cy.intercept` (e2e); Playwright
capture script (operator-installed, NOT a dependency — spec-081 harness rule) for the
actor-critic visual loop

**Target Platform**: relay-gateway on Cloud Run (existing service); frontend SPA (Vite)

**Project Type**: web application — `services/relay-gateway` + `frontend/`; no
`contracts/`, no subgraph changes

**Performance Goals**: browse renders inside 2s on healthy venues (gateway cache);
venue fan-out is parallel with per-venue isolation — slowest venue never blocks the
others (SC-008); upstream load is O(cache-TTL), not O(members)

**Constraints**: honest state everywhere (degraded ≠ zeros, missing ≠ 0, FR-004/005);
no hardcoded bps (FR-008); HL builder fee capped ≤ 10 bps at registration AND at
gateway boot; Hyperliquid never enters EVM-only seams (FR-012); never-stranded
link-outs (FR-011); wager/pool value path untouched (FR-016); testnet cohort honesty
(FR-017); no dead execution controls (FR-018)

**Scale/Scope**: 1 gateway module (client/normalize/routes + config + status block +
tests); ~10 new frontend modules (config, client, formatters, copy, link-outs, 2
hooks, 3–4 components + CSS) + TradePanel view switcher; 1 fee-service launch-table
entry + Fees-tab label; 1 activity source; 1 Cypress spec; 1 capture script; docs
(developer guide + runbook note + mkdocs)

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` — PASS.*

- **I. Security-First Smart Contracts**: PASS — no `contracts/` changes. The one
  on-chain touch is registering a `ConfigOnly` fee service through the existing
  audited `FeeRouter` via the existing ops script (config, cap-bounded, one-shot).
  The would-be value-bearing surface (PerpsRouter execution wrapper) is explicitly
  deferred to its own spec for exactly this reason (research D9).
- **II. Test-First and Comprehensive Coverage**: PASS — plan carries gateway
  fixture tests, frontend unit/component/axe tests, fee-service table test, and the
  first Finance-section Cypress spec (research D10); failure/edge paths (degraded
  venue, unreadable fee, empty positions, account switch) are first-class scenarios.
- **III. Honest State**: PASS — the spec is largely *about* honest state: three-state
  reads, per-venue isolation, "—" over fabricated zeros, unconfirmed-fee disclosure,
  cohort integrity, no dead buttons. No mocks in shipped paths; fixtures live in
  tests only.
- **IV. Fail Loudly in CI**: PASS — new tests join existing gates; no
  `continue-on-error`; gateway boot fails loudly on a fee config above cap.
- **V. Accessible, Consistent Frontend**: PASS — style-kit tokens + existing
  components, axe tests in both themes (SC-007), InfoTip copy for every specialist
  term; contract addresses (FeeRouter) keep coming from sync artifacts.

## Project Structure

### Documentation (this feature)

```
specs/082-perps-trade-view/
├── spec.md
├── plan.md
├── research.md
├── tasks.md
├── checklists/requirements.md
├── contracts/gateway-perps-api.md      # route + DTO contract
└── screenshots/                        # actor-critic visual loop output
```

### Source Code (repository root)

```
services/relay-gateway/
├── src/perps/client.js                 [NEW] three venue clients, injected fetch
├── src/perps/normalize.js              [NEW] venue payloads → PerpPair/PerpPosition DTOs
├── src/perps/routes.js                 [NEW] /v1/perps/{pairs,positions,config}
├── src/config/index.js                 [MODIFY] perps env block + boot cap check
├── src/server.js                       [MODIFY] mount + /status perps block
├── test/perps.test.js                  [NEW]
└── .env.example                        [MODIFY]

frontend/src/
├── config/perps.js                     [NEW] venue registry, perpsPath(), availability
├── lib/perps/{perpsClient,format,perpsCopy,linkouts}.js   [NEW]
├── hooks/{usePerpsMarkets,usePerpsPositions}.js           [NEW]
├── components/perps/{PerpsView,PerpsPairTable,PerpsPositions,PerpsVenueBadge}.jsx + Perps.css  [NEW]
├── components/fairwins/TradePanel.jsx  [MODIFY] view switcher (swap | perps)
├── components/admin/FeesTab.jsx        [MODIFY] KNOWN_SERVICES label
├── lib/fees/feeQuote.js                [MODIFY] FEE_SERVICES.PERPS_HL_BUILDER
├── data/notifications/sources/perpsSource.js  [NEW] + registration
└── test/perps/*                        [NEW] unit/component/axe suites

scripts/
├── deploy/lib/feeServices.js           [MODIFY] launch-table entry (cap 10, ConfigOnly)
└── ui/capture-perps.mjs                [NEW] Playwright capture for actor-critic loop

frontend/cypress/e2e/fast/23-perps.cy.js  [NEW]
docs/developer-guide/perps.md             [NEW] (+ mkdocs.yml, runbook note)
```

**Structure Decision**: web app layers only (gateway + frontend), mirroring the
Predict integration's placement; Perps is a Trade sub-view per the section/view idiom
(research D4), so no appNav/tenant/nav-drawer surface changes.

## Complexity Tracking

No constitution deviations. New surface count is the minimum for three venues behind
one normalized DTO; everything else reuses existing seams (FeeRouter, Fees tab,
activity engine, style kit, gateway policy stack).
