# Perps — cross-venue perpetual futures (spec 082)

The **Perps** view inside **Trade** (`/wallet?tab=trade&view=perps`) merges perpetual-futures
market data from three external venues — **Gains Network** (Arbitrum/Base/Polygon), **GMX v2**
(Arbitrum), and **Hyperliquid** (its own L1) — into one searchable insight surface: live price,
hourly funding, open interest, max leverage, plus the connected member's **read-only** open
positions. Trading happens on the venue via **attributed link-outs**; there is **no in-app
execution, no custody, and no contract change** in this release (in-app execution is a follow-up
spec with its own security lifecycle — see research D9).

## Architecture

| Concern | Where |
|---|---|
| Trade view switcher (Swap \| Perps) | `frontend/src/components/fairwins/TradeSection.jsx` (`?view=` idiom; Swap untouched + default) |
| Venue registry / availability / deep link | `frontend/src/config/perps.js` (`PERP_VENUES`, `perpsAvailable()`, `perpsPath()`) |
| Gateway read proxy | `services/relay-gateway/src/perps/` (client / normalize / routes) — `/v1/perps/{pairs,positions,config}` |
| SPA client | `frontend/src/lib/perps/perpsClient.js` (soft-fail, `PerpsUnavailable`) |
| Hooks | `usePerpsMarkets` (3-state + per-venue sources), `usePerpsPositions` (60s poll, account hard-reset) |
| View | `frontend/src/components/perps/` (`PerpsView`, `PerpsPairTable`, `PerpsPositions`, `PerpsVenueBadge`, `Perps.css`) |
| Link-outs + attribution | `frontend/src/lib/perps/linkouts.js` (plain-link fallback — attribution never blocks) |
| Fee governance | FeeRouter `ConfigOnly` service **`perps.hyperliquid.builder`** (cap **10 bps** — Hyperliquid's own perps limit); Fees tab label in `FeesTab.jsx`; gateway reads live bps via `fees/onchain.js` |
| Activity feed | `frontend/src/data/notifications/sources/perpsSource.js` (snapshot-diff of position sets; outage ≠ change) |
| Visual harness | `scripts/ui/capture-perps.mjs` (actor-critic loop; shots in `specs/082-perps-trade-view/screenshots/`) |

## The rules that matter

- **Per-venue isolation (FR-004).** Each venue independently resolves `read | degraded`. A
  degraded venue is named in a banner and its pairs are omitted — never rendered as zeros or
  stale-as-live. Bounded serve-stale: a cached value older than 10× TTL degrades instead.
- **Honest numbers (FR-005).** Normalizers preserve `null` for anything a venue did not report;
  formatters are total functions rendering `—`. Scale provenance is documented in
  `services/relay-gateway/src/perps/normalize.js` (verified against the venues' own SDK/APIs).
- **Hyperliquid is non-EVM (FR-012).** String venue id, `chainId: null`, never passed to
  `getContractAddressForChain`/wagmi/`NETWORKS`. Guard: `isEvmPerpVenue()`.
- **Three revenue rails, one admin-settable.** Gains pays a fixed referral share (trader pays
  nothing extra); GMX pays a tiered fee share **and discounts the trader**; only the
  **Hyperliquid builder fee** is platform-priced — governed on-chain via spec 060, disclosed as a
  named line when non-zero, **no line at zero**, and "could not be confirmed" when unreadable.
  Never hardcode a bps value.
- **Never stranded (FR-011).** Missing attribution config ⇒ plain venue links. Gateway down ⇒ one
  honest unavailable state. Testnet cohort ⇒ mainnet-only notice (FR-017), no cross-cohort data.
- **No execution surface (FR-018).** No order controls anywhere; positions are read-only with
  "Manage on venue ↗". GMX positions are not readable via REST and are honestly disclosed as
  view-on-venue (absent from `sources`, never faked).
- **Value-path independence (FR-016).** The module is optional (`PERPS_ENABLED`, default off ⇒
  503 `perps_unconfigured`); a total outage leaves wagers/pools/transfers untouched.

## Configuration (gateway)

See `services/relay-gateway/.env.example` — `PERPS_ENABLED`, per-venue URLs
(`PERPS_GAINS_URL_*` / `PERPS_GMX_URL` / `PERPS_HL_URL`, empty string disables one Gains chain),
cache/quota/killswitch knobs, and PUBLIC attribution ids (`PERPS_GAINS_REFERRER`,
`PERPS_GMX_REF_CODE`, `PERPS_HL_BUILDER_ADDRESS`). `PERPS_HL_BUILDER_FEE_BPS` is the env
FALLBACK for the FeeRouter rate; boot fails loudly above the 10 bps cap. `GET /status` exposes a
`perps` block. No secrets exist in this module.

## Tests

- Gateway: `services/relay-gateway/test/perps.test.js` (fixture normalization, merge,
  degradation, quotas, killswitch, boot caps, config source).
- Frontend: `frontend/src/test/perps/` (formatters, client, hooks, view states, link-outs,
  activity source, axe light+dark).
- E2E: `frontend/cypress/e2e/fast/24-perps.cy.js` — default CI world asserts honest absence
  (no gateway ⇒ no tab, deep link falls back to Swap); the full stubbed-gateway flow runs with
  `VITE_RELAYER_URL=… CYPRESS_PERPS_GATEWAY=1`.

See `specs/082-perps-trade-view/` for the spec, plan, research (venue scales, revenue rails),
and the visual review record.
