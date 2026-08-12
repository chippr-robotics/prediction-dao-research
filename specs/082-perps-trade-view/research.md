# Research: Perps — Cross-Protocol Perpetual-Futures Markets (Phase 0)

Decisions D1–D10. Protocol facts verified against venue developer docs, 2026-08-11.

## D1 — Which analog to mirror: Predict (057) + Earn (050), not Liquidity (067)

This release is read-only market data + positions + fee governance + attributed
link-outs. That is exactly Predict's launch shape (gateway read proxy + frontend
section + ConfigOnly fee services + honest link-outs) crossed with Earn's
multi-network list/positions conventions (three-state status, network transparency,
null-safe formatters). The 067 wrapper-contract shape (a UUPS PerpsRouter) is only
needed for in-app execution, which is deferred (D9). **No contracts/ changes ship in
this release** beyond registering ConfigOnly fee services via the existing ops
script/launch table — which is config, not code.

## D2 — Venue data sources (all public, no auth)

| Venue | Source | Key reads |
|---|---|---|
| Gains Network (gTrade v10) | `https://backend-<chain>.gains.trade` (arbitrum, base, polygon) | `GET /trading-variables` (pairs, funding/borrowing params, OI, leverage caps); `GET /open-trades/<address>` (positions) |
| GMX v2 | `https://arbitrum-api.gmxinfra.io` (backup `gmxinfra2.io`) | `GET /markets/info` (markets, OI, funding/net rates), `GET /prices/tickers`, positions via Reader contract `eth_call` or `/positions`-shaped reads |
| Hyperliquid | `POST https://api.hyperliquid.xyz/info` | `{"type":"metaAndAssetCtxs"}` (universe + mark/oracle price, funding, OI, premium), `{"type":"clearinghouseState","user":<addr>}` (positions) |

Rate limits: Hyperliquid publishes 1200 weight/min/IP; Gains says "no auth, be
reasonable"; GMX publishes none (cached endpoints). The gateway proxy + cache is
mandatory so N members ≠ N× upstream load (FR-003), and it keeps member IPs/addresses
off venue logs for browse.

## D3 — Revenue rails per venue (and what admins can set)

- **Gains**: on-chain `_referrer` param in `openTrade`; fixed protocol share
  (~1.5–2 bps of referred opening volume, paid in GNS, claimed at
  gains.trade/referrals). Trader pays nothing extra. Link-out attribution: referral
  link. **Not admin-settable.**
- **GMX v2**: `bytes32 referralCode` in `createOrder`, stored in `ReferralStorage`
  (Arbitrum `0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d`); tiered share of GMX's fee
  (T1 5% affiliate + 5% trader discount). Link-out attribution:
  `https://app.gmx.io/#/trade/?ref=<code>` registers the code for the trader.
  **Not admin-settable** (tier assignment is GMX governance).
- **Hyperliquid**: per-order builder fee `{b: builderAddress, f: tenthsOfBps}`, user
  approves `approveBuilderFee` once, **cap 10 bps on perps** (venue-enforced). This is
  the platform-priced rail → FeeRouter `ConfigOnly` service `perps.hyperliquid.builder`
  with `capBps: 10`. Gateway reads live bps via the existing `fees/onchain.js` reader
  pattern; env fallback `PERPS_HL_BUILDER_FEE_BPS` (boot fails loudly above cap,
  mirroring `POLYMARKET_BUILDER_TAKER_FEE_BPS`).

Registered launch services (all start at 0 bps, per fee-ops convention):

```js
{ label: "perps.hyperliquid.builder", capBps: 10, kind: ServiceKind.ConfigOnly }
```

`perps.open` (a Wrapped execution fee) is deliberately NOT registered now —
registration is one-shot and its cap/kind belong to the execution spec.

## D4 — Perps is a VIEW inside Trade, not a nav item

`appNav.js`'s own comment: "a nav ITEM is a section, and a section owns a `?tab=`."
The Perps requirement names "a tab in the Trade section" → the `?view=` idiom
(`/wallet?tab=trade&view=perps`), like Wagers under Transfer and Lend/Stake/Supply
under Earn. `TradePanel` gains a view switcher (`swap` default | `perps`);
`constants/dex.js` already carries the perps seam (`getPerpsVenue`). Benefits: no new
tenant feature id gymnastics (rides Trade's `swap` feature id), no third copy of a
`predictEnabled` boolean, no nav-drawer churn (spec 081 constraints untouched).
A `perpsPath()` helper (config/perps.js) owns the deep link.

## D5 — Venue model: EVM chains + one non-EVM venue

Gains/GMX pairs carry real EVM `chainId`s (42161, 8453, 137) for badges only — no
contract resolution happens in this release. Hyperliquid follows the spec-061
precedent: a **string venue id** (`'hyperliquid'`), never a numeric chainId, never
passed to `getContractAddressForChain`/wagmi/NETWORKS. The frontend venue registry
(`config/perps.js`) is the boundary guard: `isEvmPerpVenue(v)`.

## D6 — Gateway module shape (`services/relay-gateway/src/perps/`)

Mirrors `polymarket/` exactly: `client.js` (three upstream clients, injected
`fetchImpl`, timeouts/retries on reads only), `normalize.js` (venue payload → one
`PerpPair`/`PerpPosition` DTO; the only module that knows upstream shapes),
`routes.js` (factory `(config, deps)`; pipeline killswitch → config check → param
validation → quota → cached fetch). Routes:

- `GET /v1/perps/pairs` — merged normalized pairs, per-venue `sources` block
  (`read | degraded`), cache ~15s.
- `GET /v1/perps/positions?address=0x…` — per-venue positions, `Promise.allSettled`,
  per-venue status; cache ~10s keyed by address (quota per address).
- `GET /v1/perps/config` — public attribution config + live HL builder bps
  (`source: 'chain' | 'env-fallback'`), mirroring `/fee-rate`.

`GET /status` gains a `perps` block (FR-014). Env: `PERPS_ENABLED`,
`PERPS_GAINS_URL_{ARBITRUM,BASE,POLYGON}`, `PERPS_GMX_URL`, `PERPS_HL_URL`,
`PERPS_CACHE_TTL_MS`, `PERPS_QUOTA_*`, `PERPS_KILLSWITCH`,
`PERPS_GMX_REF_CODE`, `PERPS_GAINS_REFERRER`, `PERPS_HL_BUILDER_ADDRESS`,
`PERPS_HL_BUILDER_FEE_BPS` (fallback; boot-capped at 10). All attribution values are
public config, not secrets. Unset module ⇒ routes answer 503 `perps_unconfigured`
(mounted unconditionally, honest-state).

## D7 — Frontend module set

```
config/perps.js                 venue registry, PERPS feature helpers, perpsPath()
lib/perps/perpsClient.js        gateway client (mirror predictClient: PerpsUnavailable,
                                12s abort, perpsAvailable() = gateway URL configured)
lib/perps/format.js             null-safe formatters (price, funding %/interval,
                                compact OI, leverage, PnL) — total functions
lib/perps/perpsCopy.js          PERPS_TIPS (funding, OI, leverage, liquidation,
                                builder fee) + PERPS_DISCLOSURE + risk copy
lib/perps/linkouts.js           per-venue outbound URL builders with attribution,
                                plain-link fallback (FR-011)
hooks/usePerpsMarkets.js        3-state (loading|ready|unavailable) + per-venue
                                sources; search/filter/sort state
hooks/usePerpsPositions.js      poll 60s, reqIdRef stale-guard, hard reset on account
                                change, per-venue isolation
components/perps/PerpsView.jsx  the view: header, filters, table, positions, notices
components/perps/PerpsPairTable.jsx / PerpsPositions.jsx / PerpsVenueBadge.jsx
components/perps/Perps.css      flat BEM-ish classes, var(--token, fallback) only
data/notifications/sources/perpsSource.js  snapshot-diff position backstop (spec 031)
```

TradePanel hosts the view switcher; PerpsView renders standalone under it (Trade's
existing swap UI untouched at `view=swap`/default). Testnet build: `perpsAvailable()`
additionally requires a mainnet cohort (`import.meta.env` cohort check) → honest
mainnet-only notice (FR-017).

## D8 — Reporting/ledger integration

- **Activity feed (spec 031)**: `perpsSource.js` snapshot-diffs the connected
  account's per-venue position keys each engine cycle (reads via the gateway, cheap
  and cached); a detected open/close/size-change emits a "position changed on
  <venue>" entry. No venue API keys, no write path.
- **Ledger (spec 051)**: deliberately NOT capturing link-outs — the client ledger
  records value events with chain-verifiable tx hashes; a link-out has none. Position
  changes detected by snapshot-diff lack local tx hashes too (they happen on the
  venue), so they stay in the activity feed as disclosed-gap entries, per the
  earnSource precedent. Ledger capture lands with in-app execution.
- **Ops reporting**: gateway `/status.perps` (venue health, cache stats, attribution
  configured y/n) + FeeRouter `FeeBpsChanged` history on the Fees tab.

## D9 — In-app execution is a follow-up spec (out of scope here)

All three venues are async-execution (keepers / off-chain book): open ≠ filled, and
UX needs pending/timeout states (`cancelOrderAfterTimeout` on Gains, keeper
execution on GMX, API fills on Hyperliquid). A fee-charging wrapper would be a
value-bearing UUPS contract (constitution I: full security lifecycle) and must first
answer, per venue, the two LiquidityRouter questions: (1) does the open call take an
owner/recipient param (Gains `openTrade` trades carry the trader in the struct; GMX
orders carry an account; wrapping either wrongly makes the router the position
owner); (2) no router may ever sit in a close/withdraw path. Hyperliquid execution
additionally needs a non-EVM signing rail (msgpack action hashing) — its own risk
review. Deferring keeps this release contract-free and never blocks a member exit.

## D10 — Testing strategy

- **Gateway** (`services/relay-gateway/test/perps.test.js`, node:test + injected
  fetch): normalization per venue from recorded fixture payloads; merged pairs;
  per-venue degradation; quota/killswitch/unconfigured 503s; HL builder bps cap at
  boot; config endpoint chain-vs-fallback.
- **Frontend unit/component** (Vitest + Testing Library + vitest-axe,
  `frontend/src/test/perps/`): formatters (null-safety), client error mapping, hooks
  (3-state, stale-guard, account-switch reset, venue isolation), view states (ready/
  degraded/unavailable/empty/testnet), link-out builders (attribution + fallback),
  fee disclosure line (zero ⇒ absent), axe on the view in both themes.
- **Fee services** (`test/fees` + `scripts/deploy/lib/feeServices.js` test): the new
  launch-table entry's id/cap/kind asserted against `keccakId('perps.hyperliquid.builder')`.
- **E2E** (Cypress `frontend/cypress/e2e/fast/`): first Finance-section e2e spec —
  stubbed gateway (`cy.intercept`), assert view loads via deep link, pairs render,
  search filters, degraded venue notice, link-out href carries attribution, a11y pass.
- **Visual (actor-critic)**: a Playwright capture script
  (`scripts/ui/capture-perps.mjs`, NODE_PATH resolution + `/opt/pw-browsers`
  Chromium per the spec-081 harness constraint — Playwright is NOT added as a
  dependency) renders the view in light/dark + mobile/desktop against a stubbed
  gateway; screenshots are then critiqued against the style kit (tokens, spacing,
  badge conventions) and the loop iterates until visual issues are cleared;
  final screenshots land in `specs/082-perps-trade-view/screenshots/`.
