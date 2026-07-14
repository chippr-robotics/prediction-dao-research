# Predict — Polymarket trading (spec 057)

The **Predict** section lets a connected wallet browse Polymarket prediction markets and buy/sell
outcome shares, routed through FairWins' **builder code** so attributed volume earns revenue. It is
the direct analog of the **Collect** (OpenSea) feature: a frontend section + a relay-gateway proxy,
**no smart-contract changes**, no custody — the member's own wallet is the only order signer.

> **Architecture note (Option A, per-user CLOB creds).** The original plan had the member hand-build a
> CLOB order struct and relay it through a gateway that held one shared operator L2 credential. That does
> not work: **CLOB V2 binds every order to its signer** and rejects any order whose `signer` != the address
> its API key was registered under (401 "Invalid api key"), so a single shared key cannot submit trades for
> other wallets (verified against live CLOB). The shipped design instead has **each member derive their own
> CLOB API creds** (one gasless L1 wallet signature) and post orders **client-direct** to
> `clob.polymarket.com` via the official [`@polymarket/clob-client`](https://www.npmjs.com/package/@polymarket/clob-client).
> The gateway keeps the **public read feed** and gains a **builder-sign attribution endpoint** (below).

## How FairWins earns (builder codes)

A `bytes32` **builder code** (`0x6e0316783960e149b53466f0f2c5fdbaf5ce11ba15669491de980f6dedc493a3`)
attributes volume via the four `POLY_BUILDER_*` request headers. Two revenue streams:

1. **Builder fee** — a flat % of notional charged on attributed **taker** volume, accrued to the
   builder's registered wallet. Default **50 bps taker / 0 maker** (config, capped at 100/50 bps).
2. **Weekly rewards** — a share of Polymarket's weekly USDC builder-rewards pool on attributed volume,
   earned even at a zero explicit fee.

### The honesty difference from Collect

OpenSea's affiliate reward comes out of OpenSea's own fee → **no user cost** → Collect attributes it
silently. Polymarket's builder fee is **additive** — it stacks on top of the platform taker fee and is
a **real cost to the taker**. So Predict **always discloses the builder fee** as its own labelled line
in the confirm UI, never hidden and never described as free (`TradeConfirm.jsx`). Makers pay no fee.

## Architecture

| Concern | Where |
|---|---|
| Capability flag (Polygon-only) | `frontend/src/config/networks.js` `PREDICT_CHAIN_IDS = {137}` |
| Nav item | `frontend/src/config/appNav.js` `{ id: 'predict', label: 'Predict' }` |
| Gateway proxy (public reads) | `services/relay-gateway/src/polymarket/` (client / normalize / routes) |
| Gateway **builder-sign** (attribution) | `POST /v1/polymarket/:chainId/builder-sign` — signs `POLY_BUILDER_*` headers with the shared builder creds (server-side only) |
| **Per-user CLOB session** | `frontend/src/lib/predict/clobSession.js` — derive creds + build/sign/post orders via `@polymarket/clob-client` |
| Region gate | `frontend/src/lib/predict/geoblock.js` — geoblock check + Polymarket link-out for restricted regions |
| Cost math (honest fee lines) | `frontend/src/lib/predict/clobOrder.js` `computeCost` (additive builder fee; **not** the order struct) |
| Signer capability | `frontend/src/lib/predict/tradeSigner.js` — EOA can sign; passkey deferred (`PASSKEY_PREDICT_ENABLED = false`) |
| State machine | `frontend/src/hooks/usePredictTrade.js` (region → fee → derive creds → submit) |
| Browse / positions / orders | `usePredictMarkets.js`, `usePredictPortfolio.js` + `components/predict/*` |

### Upstream hosts

Polymarket splits across public hosts. Reads go through the gateway; authed trading is client-direct:

- **Gamma API** (`gamma-api.polymarket.com`) — market **discovery/browse + search**, volume-ranked live
  markets (the CLOB `/markets` endpoint returns mostly closed historical markets, so it is not used for
  browse). Outcomes/prices/token-ids arrive as stringified JSON arrays that the normalizer zips.
- **Data API** (`data-api.polymarket.com`) — the wallet's **positions** (public, no auth).
- **CLOB** (`clob.polymarket.com`) — fee rate (`base_fee`) via the gateway, and **directly from the
  browser** for cred derivation, order submit/cancel, and open orders. CLOB serves
  `Access-Control-Allow-Origin: *`, so the SPA calls it straight; the member's L2 creds never transit
  our gateway (consistent with the no-backend rule).

Read hosts are configurable via `POLYMARKET_GAMMA_URL` / `POLYMARKET_DATA_URL` / `POLYMARKET_BASE_URL`.

### Per-user credentials (`clobSession.js`)

- `ensureClobCreds(walletClient, { address })` — `createOrDeriveApiKey()` is deterministic per wallet:
  one **L1 EIP-712 signature** (a wallet prompt, no gas). Result `{ key, secret, passphrase }` is cached
  in `sessionStorage` per address, so the member signs at most once per session. Creds are session-local
  and **never** sent to a FairWins server.
- `makeClobClient(walletClient, creds, { builderConfig })` — an authed client bound to the member's
  wallet + their creds, signatureType **0 (EOA)** (maker == signer == funder). Passkey/Safe types stay
  deferred behind `PASSKEY_PREDICT_ENABLED`.
- `submitOrder` / `cancelOrder` / `fetchOpenOrders` — `createAndPostOrder` builds, signs, and posts in
  one call (the SDK resolves tick size, fee rate, and negRisk). **The order struct and its EIP-712
  signing are owned by the SDK** — we don't hand-roll it (the real struct is 12 fields, domain
  `"Polymarket CTF Exchange"` v`1`, with **no** `builder` field; attribution rides on headers, below).

### Builder attribution (`makeBuilderConfig` + gateway `builder-sign`)

The builder creds are a **shared secret**, so they stay server-side. The SDK's `BuilderConfig` is pointed
at the gateway's remote signer:

- Client: `makeBuilderConfig(gatewayBaseUrl, chainId)` → `BuilderConfig({ remoteBuilderConfig: { url:
  `${base}/v1/polymarket/${chainId}/builder-sign` } })`. Returns `undefined` when no gateway is configured
  → trades post **unattributed** rather than being blocked (never-stranded, FR-015).
- Gateway: `POST /v1/polymarket/:chainId/builder-sign` (Polygon-only, killswitch + write-quota) takes
  `{ method, path, body, timestamp }`, calls `builderConfig.generateBuilderHeaders(...)` with the shared
  `POLYMARKET_API_*` creds, and returns the four `POLY_BUILDER_API_KEY` / `_PASSPHRASE` / `_SIGNATURE` /
  `_TIMESTAMP` headers. The SDK adds them **on top of** the member's own L2 headers.

### Region gate (`geoblock.js`)

Polymarket blocks order placement for restricted regions (e.g. US persons) as a matter of their policy.
`checkGeoblock()` (`GET polymarket.com/api/geoblock`, CORS `*`, fail-open) runs **before** fee load and
before submit. A blocked member sees an honest region notice and a **"Trade on Polymarket ↗" link-out**
to the market on polymarket.com — we never bypass the block, and never present a dead trade button.

### Fees, honestly

We control and state the **builder fee** exactly (`computeCost`). Polymarket's **own taker fee** is
computed by their engine at execution (a curve over price/size); `base_fee` is carried on the signed
order's `feeRateBps` for validity, but we do **not** fabricate a dollar estimate for it — the confirm UI
discloses it as a separate note. This keeps "shown == charged" honest for the one fee we own. Makers pay
no builder fee.

### Never stranded

Every path degrades gracefully: no builder code / gateway ⇒ orders post **unattributed**; killswitch or
outage ⇒ honest message + a Polymarket link; fees unconfirmable ⇒ signing is **blocked** (never a guessed
fee); restricted region ⇒ honest notice + link-out; passkey session ⇒ honest "not available yet".

## Configuration

Server-side, in the relay-gateway (`services/relay-gateway/src/config/index.js` `polymarket` block; see
`.env.example`): `POLYMARKET_API_KEY` + `API_SECRET`/`API_PASSPHRASE`/`API_ADDRESS` — these are the
**shared builder credentials** used only to sign `POLY_BUILDER_*` attribution headers (they are **not**
per-user order creds). `POLYMARKET_BUILDER_CODE` + `_TAKER_FEE_BPS`/`_MAKER_FEE_BPS` (public), quotas.
The SPA connects directly to `clob.polymarket.com` + `polymarket.com` — both are in the frontend CSP
`connect-src` (`nginx.conf` / `nginx.conf.template`).

## Competitive positioning

Total taker cost ≈ Polymarket platform fee (curved, ~0.75%–1.8% by category; makers 0) + 0.5% builder
fee. Comparable to Kalshi (~≤1.75%) and mid-pack among third-party builders (0–1%). See
`specs/057-predict-polymarket/research.md` (D2–D4) for the full analysis.

## Open dependencies (confirm before mainnet)

- **Allowed-region E2E**: a live end-to-end trade (derive creds → submit → fill) must be verified from a
  **non-restricted** region — the sandbox/dev region is geoblocked, so live submit currently reaches the
  region gate. Everything up to that point is validated live.
- **Passkey path**: Polymarket's ERC-1271 validation of our passkey (smart-account) signatures is **not**
  wired — `PASSKEY_PREDICT_ENABLED = false`. Passkey users see an honest "not available yet". Enabling it
  needs signatureType 1/2 order binding confirmed end-to-end.
- **Deploys**: the feature needs a **gateway redeploy** (builder-sign endpoint) and an **SPA
  rebuild/redeploy** (trade code + CSP). Merging main does not auto-deploy.

See also `docs/runbooks/relayer-operations.md` (Predict / Polymarket proxy) for operations.
