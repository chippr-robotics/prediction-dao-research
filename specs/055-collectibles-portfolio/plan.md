# Implementation Plan: Collectibles Portfolio (Read-Only NFT Display)

**Branch**: `claude/opensea-nft-trading-14m4kj` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/055-collectibles-portfolio/spec.md`

## Summary

Add a read-only, OpenSea-backed **Collectibles** tab to the Finance section
(Ethereum mainnet + Polygon only) showing a wallet's owned NFTs, an item detail
sheet (traits, collection floor price, best offer) with a "View on OpenSea" deep
link, and a clearly-labeled floor-price estimate line in the Portfolio holdings
view. Technical approach: a new read-only `/v1/opensea/*` proxy route group in
`services/relay-gateway` (holds `OPENSEA_API_KEY`, in-process TTL cache with
serve-stale, per-address + global quotas, killswitch/origin-lock inherited)
calling OpenSea REST API v2 directly with no new dependencies; frontend follows
existing patterns — `WalletPage` tab + `appNav` entry with a chain-capability
visibility filter, `usePortfolio`-style `useCollectibles` hook, and an
`AssetDetailSheet`-style detail sheet. No smart-contract changes. Full decision
log in [research.md](research.md).

## Technical Context

**Language/Version**: JavaScript ESM — Node ≥ 20 (gateway), Node ≥ 22 + React 19 (frontend)

**Primary Dependencies**: gateway: Express 4 + native `fetch` (zero new deps; mirrors `src/engine/client.js`); frontend: React + existing wagmi/`networks.js` config (no new deps; TanStack Query deliberately not used for app data — research D6)

**Storage**: none persistent; in-process TTL + single-flight cache in the gateway (research D5), transient hook state in the frontend

**Testing**: Vitest + Supertest with injected mock `fetchImpl` (gateway, `test/opensea.test.js`); Vitest + Testing Library + vitest-axe (frontend)

**Target Platform**: gateway on Cloud Run behind Cloudflare (`--max-instances=1`, in-process state by design); frontend SPA (Vite)

**Project Type**: web application — existing `services/relay-gateway` backend + `frontend/` SPA; no contracts/, no subgraph changes

**Performance Goals**: first grid screen < 3 s on broadband (SC-001); gateway cache keeps OpenSea calls ≪ quota (60 s list/detail TTL, 300 s stats TTL); 200+ item wallets scroll without freezing (SC-007, progressive cursor loading)

**Constraints**: OpenSea API key never client-side (FR-009 — origin-locked gateway only, fail-closed 503 when unset); Ethereum(1) + Polygon(137) only, hidden elsewhere (FR-007); strictly read-only — no signatures/transactions (FR-005); estimate never merged into `totalUsd` (honest state, research D8); no wager/pool path dependency (FR-011)

**Scale/Scope**: ~6 new frontend files + 4 touched, ~4 new gateway files + 3 touched; 3 gateway endpoints; wallets up to hundreds of items (bounded page scan, `truncated` flag)

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.0.0 — PASS (pre-Phase-0 and re-checked post-Phase-1). No Complexity Tracking entries needed.*

- **I. Security-First Smart Contracts**: PASS (N/A) — zero `contracts/` changes. No
  funds, custody, access-control, or oracle surface touched. The only security
  surface is the gateway route group: read-only GETs, origin-locked, fail-closed
  without its key, param-validated, quota- and killswitch-guarded (contract doc).
- **II. Test-First & Coverage**: PASS — Vitest suites specified alongside every
  behavior (research D11): gateway route tests incl. failure/edge paths (cache,
  stale, quotas, killswitch, bad params, unsupported chain); frontend hook/panel/
  sheet/deep-link/portfolio tests incl. degraded and empty states. No contract
  interfaces altered.
- **III. Honest State, No Mocks in Shipped Paths**: PASS — mocks confined to test
  scopes; every response carries `fetchedAt` + `stale` and the UI must surface
  staleness (FR-013); floor-price value is labeled an estimate and excluded from
  the verifiable `totalUsd` headline (research D8); data scoped per network/wallet
  with full state reset on switch (FR-010).
- **IV. Fail Loudly in CI**: PASS — no `continue-on-error` anywhere; new tests run
  under existing gateway/frontend suites. (Verify during implementation that CI
  runs `services/relay-gateway` tests; if not, wiring them into the existing test
  workflow is in scope for this feature.)
- **V. Accessible, Consistent Frontend**: PASS — WCAG 2.1 AA is FR-014; reuses
  the audited sheet/empty-state/nav patterns (focus trap + Escape + scroll-lock
  copied from `AssetDetailSheet`), vitest-axe assertions included; no hardcoded
  addresses/ABIs (feature consumes no contract artifacts at all).
- **Additional Constraints**: PASS — no new core technology (native fetch, no
  `@opensea/sdk` — research D1); secret lives in Cloud Run Secret Manager and
  `.env` stays local (`.env.example` documents it); archives untouched;
  `deployments/` untouched.

## Project Structure

### Documentation (this feature)

```text
specs/055-collectibles-portfolio/
├── spec.md
├── plan.md                          # This file
├── research.md                      # Phase 0 (decisions D1–D12)
├── data-model.md                    # Phase 1 DTOs + state machine
├── quickstart.md                    # Phase 1 validation guide
├── contracts/
│   └── gateway-opensea-api.md       # /v1/opensea/* endpoint contract
├── checklists/
│   └── requirements.md
└── tasks.md                         # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
services/relay-gateway/
├── src/
│   ├── server.js                    # [MODIFY] register /v1/opensea routes + osQuotas instance
│   ├── config/index.js              # [MODIFY] opensea config block (key, TTLs, quotas)
│   └── opensea/
│       ├── client.js                # [NEW] upstream fetch, X-API-KEY, timeout/retry (mirrors engine/client.js)
│       ├── cache.js                 # [NEW] keyed TTL + single-flight + serve-stale (generalizes health cache)
│       ├── routes.js                # [NEW] handlers: account nfts / item detail (composed) / collection stats
│       └── normalize.js             # [NEW] OpenSea v2 → DTO mapping, param validation, chain slugs
├── test/opensea.test.js             # [NEW] Supertest suite (mock fetchImpl)
├── .env.example                     # [MODIFY] OPENSEA_* vars
└── README.md                        # [MODIFY] env table + route docs

frontend/src/
├── config/
│   ├── networks.js                  # [MODIFY] `collectibles` capability (chains 1, 137)
│   └── appNav.js                    # [MODIFY] Collectibles item + chain-aware visibility filter
├── lib/collectibles/
│   ├── gatewayClient.js             # [NEW] VITE_RELAYER_URL client, soft-fail null, bounded fetch
│   └── valuation.js                 # [NEW] floor-estimate aggregation (priced/unpriced/truncated)
├── hooks/useCollectibles.js         # [NEW] usePortfolio-style hook (status machine per data-model)
├── components/collectibles/
│   ├── CollectiblesPanel.jsx        # [NEW] grid, empty/degraded states, hidden-items toggle (+ CSS)
│   └── CollectibleDetailSheet.jsx   # [NEW] AssetDetailSheet-pattern sheet + OpenSea deep link (+ CSS)
├── components/wallet/PortfolioPanel.jsx  # [MODIFY] estimate line (outside totalUsd)
└── pages/WalletPage.jsx             # [MODIFY] tab entry + panel block + unsupported-chain fallback

frontend/src/test/
├── collectibles/                    # [NEW] hook, panel, sheet, valuation tests
├── WalletPage.test.jsx              # [MODIFY] ?tab=collectibles deep-link cases
└── portfolio/ (estimate-line test)  # [MODIFY/NEW]

docs/runbooks/relayer-operations.md  # [MODIFY] OPENSEA_API_KEY provisioning/rotation note
```

**Structure Decision**: extend the two existing projects (`services/relay-gateway`,
`frontend/`) in place — no new service, no contracts/subgraph work. Gateway code
follows its established `src/<domain>/` layout (like `src/engine/`,
`src/paymaster/`); frontend follows the `config → lib → hooks → components →
pages` layering used by Portfolio/Earn, with tests mirroring existing
`frontend/src/test/` conventions.

## Complexity Tracking

No constitution violations — table intentionally empty.
