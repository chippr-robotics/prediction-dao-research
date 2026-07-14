# Phase 0 Research: Predict — Polymarket Trading

Decision log for the Predict feature. Each entry: **Decision**, **Rationale**,
**Alternatives considered**. Sources are Polymarket's official docs plus market
analyses (July 2026).

---

## D1 — Revenue mechanism: Polymarket builder codes

**Decision**: Earn via Polymarket's **builder-code program**. A `bytes32` builder code
(FairWins': `0x6e0316783960e149b53466f0f2c5fdbaf5ce11ba15669491de980f6dedc493a3`) is
attached to every order the app posts. This is the direct analog of the Collect
feature's OpenSea referral attribution.

**Rationale**: Builder codes are Polymarket's official, self-serve, first-class
attribution + monetization primitive (set up at `polymarket.com/settings?tab=builder`,
no approval). Two revenue streams:
1. **Builder fee** — a flat % of notional charged on attributed trades, accrued to the
   builder's registered wallet. `builder_fee = notional × builder_fee_bps / 10000`.
2. **Weekly USDC builder-rewards pool** — Polymarket distributes rewards weekly by share
   of total builder volume, earned even at a zero explicit fee (PolyTrack back-estimates
   ~0.5–1% of routed volume for top builders; one top-10 builder reported ~$1M ARR from
   rewards alone).

**Alternatives considered**: (a) Scraping/aggregating without a builder code — earns
nothing, no attribution. (b) A FairWins surcharge collected by our own contract — adds
custody/contract surface, violates the no-custody / no-contract-change constraint, and
duplicates what the builder program already does natively. Rejected.

---

## D2 — Builder fee rate: 50 bps taker / 0 bps maker

**Decision**: Default **50 bps (0.50%) taker, 0 bps maker**, as tunable server-side
config (not hardcoded), validated ≤ Polymarket's caps at boot.

**Rationale**:
- Polymarket's builder-fee **caps** are **100 bps (1%) taker, 50 bps (0.5%) maker**,
  granularity 1 bp. 50/0 is half the taker cap — meaningful revenue without being
  uncompetitive.
- Polymarket charges makers **0%** platform fee and pays maker rebates; charging a
  builder maker fee would break that maker-friendly expectation and discourage the
  liquidity our order flow benefits from. Keep makers whole.
- The builder fee is **additive** on top of Polymarket's platform taker fee (see D3), so
  it is a real user cost; a low rate protects UX while the weekly rewards pool (D1)
  provides a second, frictionless stream.
- Fee changes are **rate-limited by Polymarket**: one change per 7 days with 3-day
  advance notice. So the rate must be config (easy to tune deliberately), and we should
  pick a defensible starting value rather than iterate rapidly.

**Alternatives considered**: 25 bps taker (more aggressive on adoption, leans harder on
the rewards pool); 0 bps rewards-only (best UX, least predictable revenue); 100/50 max
(highest per-trade take, worst UX, risks users routing around us). 50/0 chosen as the
balance; the config makes any of these a one-line change (subject to Polymarket's
7-day rate-change policy).

---

## D3 — Fee model & honesty: builder fee is ADDITIVE (unlike OpenSea referral)

**Decision**: Treat and disclose the builder fee as a **real, additive cost to the
taker**, shown as its own labeled line in every cost/proceeds breakdown before signing.

**Rationale**: This is the key divergence from Collect. OpenSea's affiliate/referral
reward comes out of OpenSea's own fee → **no user cost** → Collect can attribute it
silently. Polymarket's builder fee **stacks on top of** Polymarket's platform fee → the
CLOB validates the user can cover **both** platform and builder fees → it **is** a user
cost. Hiding it would violate the constitution's honest-state principle and CLAUDE.md's
"confirm UI must disclose the fee honestly" rule. So the `attachBuilderCode` seam is
NOT a silent no-op like `attachReferral`; it contributes a visible fee line.

**Polymarket platform fee for context** (what the builder fee stacks on): only **takers**
pay; **makers pay 0**. Curved: `fee = C × feeRate × p × (1−p)`, symmetric, peaks at 50¢.
Effective taker cost by category (current docs): Crypto ~1.80%, Economics/Culture/Weather
~1.25–1.50%, Finance/Politics/Tech/Mentions ~1.00%, Sports ~0.75%, Geopolitics 0%.
Clients MUST read the live fee schedule per market (`/fee-rate?token_id=…`, or the market
info `fd`/`feeSchedule` object) — Polymarket explicitly deprecated hardcoded rates as of
2026-03-31.

**Alternatives considered**: Presenting builder fee as free / bundling into price →
rejected (dishonest, breaks constitution III). Absorbing the builder fee ourselves →
defeats the revenue purpose.

---

## D4 — Competitive positioning

**Decision**: 50 bps builder fee on top of Polymarket's platform fee keeps total cost
competitive; rely on the rewards pool as a second stream.

**Rationale**: Total taker cost ≈ platform (0.75%–1.8% by category) + 0.5% builder.
Comparators: **Kalshi** up to ~1.75% (0.30% flat + rebate on US regulated). Polymarket is
currently the cheapest venue for most categories, so even +0.5% keeps us at or below
competitor levels for many markets while monetizing. Typical third-party builders charge
0–1%; 0.5% sits mid-pack. Revisit if analytics show flow routing away.

---

## D5 — Network scope: Polygon only

**Decision**: Polygon (chain 137) only; hide Predict on all other networks.

**Rationale**: Polymarket operates exclusively on Polygon. A `PREDICT_CHAIN_IDS =
new Set([137])` capability gate mirrors Collect's `COLLECTIBLES_CHAIN_IDS` and the
`visibleNavGroups` hide-when-absent pattern (FR-018). No mainnet, no testnets. (The repo
already treats Polygon as `PRIMARY_CHAIN_ID`.)

**Alternatives considered**: None viable — Polymarket has no other production network.

---

## D6 — Order signing: EIP-712 CLOB V2 order struct via the existing signer seam

**Decision**: Hand-build Polymarket's V2 order struct as EIP-712 typed data and sign it
through the repo's single `signTypedData` seam (EOA) / `passkeyIntentSigner` (ERC-1271),
exactly as Collect signs Seaport orders.

**Rationale**: The member's wallet signature over the order struct is what authorizes the
trade and cannot be delegated server-side. Fields to sign: `salt, maker, signer,
tokenId, makerAmount, takerAmount, side, expiration, signatureType, timestamp (ms),
metadata, builder`. Domain: name `"Polymarket CTF Exchange"`, version `"2"`, chainId
137, verifyingContract = standard or neg-risk variant (read `neg_risk` from `/book`).
The **`builder` bytes32 field carries our builder code** and is recorded in
`OrderFilled` events — this is the on-chain attribution. `signatureType`: use `3`
(POLY_1271 deposit-wallet) for new API users / `2` for Gnosis Safe / `0` EOA; passkey
smart accounts validate via ERC-1271, matching the Collect passkey path.

**Alternatives considered**: The official `@polymarket/clob-client-v2` SDK does the
order-building + posting for you and exposes a `builderCode` option on
`createAndPostOrder`/`createAndPostMarketOrder`. Attractive, BUT it wants the signing
key. In our model the **client** signs (wallet/passkey) and the **gateway** posts the
already-signed order — so the gateway uses the CLOB REST endpoints directly (like
Collect's hand-built path) rather than the SDK's create-and-post. The SDK's order-struct
construction and typehashes are the reference we mirror. `clob-client-v2` remains a
documented fallback for order-building helpers if hand-building proves brittle.

---

## D7 — Server-side auth: L1 → L2 HMAC, credentials in the gateway

**Decision**: The gateway holds the Polymarket API key and derived L2 credentials; the
SPA never sees a Polymarket credential (FR-016). Config mirrors the `opensea` block.

**Rationale**: Polymarket auth is two-layer: **L1** = a one-time EIP-712 wallet signature
to `POST /auth/api-key` → returns `{apiKey, secret, passphrase}`; **L2** = every
authenticated request carries HMAC-SHA256 headers (`POLY_API_KEY`, `POLY_PASSPHRASE`,
`POLY_TIMESTAMP` (unix **seconds**), `POLY_SIGNATURE` over `{ts}{method}{path}{body}`).
This is a shared operator credential for reads/quoting and for posting client-signed
orders; it belongs server-side with the same fail-closed (503 when unset), quota, and
killswitch guards as the OpenSea proxy. Rate limits to respect: ~9,000 req/10s CLOB
general, `POST /order` burst 5,000/10s — our per-address + global quotas sit well under.

**Alternatives considered**: Client-side auth → leaks the operator credential, rejected.

---

## D8 — Gateway API surface: extend the proxy pattern, no new service

**Decision**: New `services/relay-gateway/src/polymarket/` module (client / routes /
normalize / builderCode seam), a `polymarket` config block, and write-quota wiring in
`server.js` — mirroring `opensea/`. No new service, no contracts, no subgraph.

**Rationale**: Reuses the Cloud Run service, origin-lock, killswitch, quota, and
fail-closed-key machinery already proven by the OpenSea proxy. Routes (all under
`/v1/polymarket/*`, chain-scoped to 137): market list/search + market detail + fee
schedule (cached reads); positions + open orders (per-address reads); `POST` order
(submit client-signed order with builder code attached), `POST` cancel. Reads use the
TTL cache + single-flight; the `POST` order/cancel paths bypass cache and use a separate
tighter write quota keyed by the trader's address (like `osWriteQuotas`).

**Alternatives considered**: A standalone Polymarket microservice → unjustified
operational overhead for a proxy that fits the existing gateway's shape.

---

## D9 — Builder-code seam: `attachBuilderCode` (not a silent no-op)

**Decision**: A `services/relay-gateway/src/polymarket/builderCode.js` seam resolves the
configured builder code + fee rates for a chain and returns `{ builderCode, takerFeeBps,
makerFeeBps, source }`. Unlike `attachReferral`, it feeds a **visible fee line** and is
injected into the order the client signs (the `builder` field) — the single place
attribution + fee live.

**Rationale**: Keeps the builder code and fee in one auditable place, mirrors the
Collect referral seam's "wire it HERE and nowhere else" discipline, and makes the
"trade even if unconfigured (never stranded), just unattributed" rule (FR-015) trivial:
`source: 'none'` ⇒ zero-code, zero-fee order still posts. The fee bps feed the
frontend's cost breakdown so shown == signed == charged (FR-011).

**Alternatives considered**: Hardcoding the code/fee in routes or the client → violates
"never hardcode fees" (D3) and scatters attribution. Rejected.

---

## D10 — Testing strategy

**Decision**: Vitest + Supertest with injected `fetchImpl` (gateway) and Vitest +
Testing Library + vitest-axe + injected passkey-signer deps (frontend), test-first per
constitution II, mirroring the Collect suites.

**Rationale**: Gateway tests cover: order/cancel routes incl. failure/edge (no-5xx-retry
on POST, quota 429, killswitch/fail-closed 503, fee-fetch failure blocks, `attachBuilderCode`
attributed vs `source:'none'` unattributed, out-of-cap fee rejected at boot). Frontend
tests cover: order-build + total-cost equality (shown == cost incl. builder fee), maker
shows-no-fee, confirm-UI honest builder-fee disclosure, passkey ERC-1271 path,
fee-fetch-blocks-signing, network-switch prompt, stale-price re-confirm, axe. Reuses the
ERC-1271 `magic` provider mock and injected-deps conventions from Collect.
