# Predict — Polymarket trading (spec 057)

The **Predict** section lets a connected wallet browse Polymarket prediction markets and buy/sell
outcome shares, routed through FairWins' **builder code** so attributed volume earns revenue. It is
the direct analog of the **Collect** (OpenSea) feature: a frontend section + a relay-gateway proxy,
**no smart-contract changes**, no custody — the member's own wallet is the only order signer.

## How FairWins earns (builder codes)

A `bytes32` **builder code** (`0x6e0316783960e149b53466f0f2c5fdbaf5ce11ba15669491de980f6dedc493a3`)
is attached to every order. Two revenue streams:

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
| Gateway proxy | `services/relay-gateway/src/polymarket/` (client / builderCode / normalize / routes) |
| Builder-code seam | `polymarket/builderCode.js#attachBuilderCode` — the single place attribution + fee live |
| Order builder | `frontend/src/lib/predict/clobOrder.js` (EIP-712 CLOB V2 order + honest cost math) |
| Signing seam | `frontend/src/lib/predict/tradeSigner.js` (EOA `signTypedData` / passkey ERC-1271) |
| State machine | `frontend/src/hooks/usePredictTrade.js` (fee → build → sign → submit) |
| Browse / positions / orders | `usePredictMarkets.js`, `usePredictPortfolio.js` + `components/predict/*` |

### Upstream hosts

Polymarket splits across three public hosts, and the gateway routes each read to the right one:

- **Gamma API** (`gamma-api.polymarket.com`) — market **discovery/browse + search**, volume-ranked live
  markets (the CLOB `/markets` endpoint returns mostly closed historical markets, so it is not used for
  browse). Outcomes/prices/token-ids arrive as stringified JSON arrays that the normalizer zips.
- **Data API** (`data-api.polymarket.com`) — the wallet's **positions** (public, no auth).
- **CLOB** (`clob.polymarket.com`) — fee rate (`base_fee`), open orders (L2-authed), and order
  submit/cancel. This is the only host that uses the operator L2 credentials.

Hosts are configurable via `POLYMARKET_GAMMA_URL` / `POLYMARKET_DATA_URL` / `POLYMARKET_BASE_URL`.

### Fees, honestly

We control and state the **builder fee** exactly. Polymarket's **own taker fee** is computed by their
engine at execution (a curve over price/size); `base_fee` is carried on the signed order's `feeRateBps`
for validity, but we do **not** fabricate a dollar estimate for it — the confirm UI discloses it as a
separate note ("Polymarket also charges its own taker fee, applied at execution"). This keeps
"shown == charged" honest for the one fee we own.

### Signing

The member's wallet signs the CLOB V2 order struct as EIP-712 typed data (domain
`"Polymarket CTF Exchange"` v`2`, chainId 137). The `builder` field carries the code; the gateway
re-validates it on submit so it can't be stripped/altered. The gateway L2-HMAC-signs the API request
with the operator's credentials (server-side only) and forwards the client-signed order — it never
holds an order-signing key.

### Never stranded

Every path degrades to Polymarket directly: no builder code ⇒ orders post unattributed; killswitch or
outage ⇒ honest message + a Polymarket link; fees unconfirmable ⇒ signing is **blocked** (never a
guessed fee).

## Configuration

Server-side, in the relay-gateway (`services/relay-gateway/src/config/index.js` `polymarket` block;
see `.env.example`): `POLYMARKET_API_KEY` + L2 `API_SECRET`/`API_PASSPHRASE`/`API_ADDRESS` (secrets),
`POLYMARKET_BUILDER_CODE` + `_TAKER_FEE_BPS`/`_MAKER_FEE_BPS` (public), quotas. The client learns the
builder code from the gateway's `/fee-rate` response and embeds it in the order it signs.

## Competitive positioning

Total taker cost ≈ Polymarket platform fee (curved, ~0.75%–1.8% by category; makers 0) + 0.5% builder
fee. Comparable to Kalshi (~≤1.75%) and mid-pack among third-party builders (0–1%). See
`specs/057-predict-polymarket/research.md` (D2–D4) for the full analysis.

## Open dependencies (confirm before mainnet)

Tracked in `specs/057-predict-polymarket/checklists/requirements.md`:

- The exact V2 order **typehash** (field set + `builder` placement) and **exchange addresses**
  (`clobOrder.js` `POLYMARKET_EXCHANGE`) against the live "Polymarket CTF Exchange" v2 contract.
- Polymarket's ERC-1271 validation of our passkey account implementation — gated behind
  `PASSKEY_PREDICT_ENABLED = false` until confirmed end-to-end (passkey users see an honest
  "not available yet", never a failed signature).

See also `docs/runbooks/relayer-operations.md` (Predict / Polymarket proxy) for operations.
