# Predict: Monetizing Polymarket Order Flow Without Ever Touching an Order

*How FairWins added prediction-market trading with zero contract changes, zero custody, and one honestly disclosed fee line*

---

| | |
|---|---|
| **Series** | Finance Surfaces (part 3) |
| **Part** | 24 of 34 |
| **Audience** | DeFi / trading integrators |
| **Tags** | `polymarket`, `clob`, `trading`, `builder-codes`, `non-custodial` |
| **Reading time** | ~8 minutes |

---

> **Important Note**: This article describes trading on prediction markets based on publicly available information and legitimate forecasting. Nothing here is a mechanism for trading on material non-public information or circumventing securities regulations. All participants remain fully subject to applicable laws, compliance requirements, and Polymarket's own regional restrictions, which FairWins surfaces and never bypasses.

---

## The 401 That Redesigned the Feature

The first design for Predict looked like every other relayer pattern in the FairWins codebase: the member builds an order, the relay gateway holds one shared operator credential, and the gateway submits the order to Polymarket's central limit order book (CLOB) on the member's behalf. Clean, familiar, one secret to manage.

It failed against the live API with a 401: `Invalid api key`.

The reason is a deliberate property of Polymarket's CLOB V2: **every order is bound to its signer**. An API credential is registered under a specific wallet address, and the exchange rejects any order whose signer doesn't match the address that credential was derived for. A single shared key cannot submit trades for other people's wallets — which is exactly the property you want from a non-custodial exchange, and exactly the property that kills the "gateway submits for you" architecture.

That rejection forced the design that shipped, and it turned out to be the better one: the member's own wallet is the only order signer, orders go from the browser straight to `clob.polymarket.com`, and FairWins earns revenue not by intermediating the trade but by *attributing* it — a `bytes32` builder code attached to every order via signed headers. This post walks through how that works, and why the resulting fee had to be disclosed differently from every other integration in the app.

## What Predict Is (and Is Not)

Predict (spec 057) is a frontend section plus a thin relay-gateway proxy, structured exactly like the Collect (OpenSea) feature that preceded it: **no smart-contract changes, no custody, nothing routed through `wagerRegistry`**. There is no FairWins contract in the trade path at all. The pieces:

- **Browse** goes through the gateway proxy (`services/relay-gateway/src/polymarket/`), which fronts Polymarket's Gamma API for market discovery and the Data API for a wallet's positions — both public, read-only, cached, and rate-limited.
- **Trading** is client-direct. The browser talks to the CLOB itself using credentials only the member holds.
- **Revenue** is Polymarket's builder-code program: attributed volume earns a builder fee plus a share of the weekly USDC rewards pool.

It is also **Polygon-only**, because Polymarket runs nowhere else. The capability is a one-line set in `frontend/src/config/networks.js`:

```js
// Predict (spec 057): Polymarket prediction-market trading is available ONLY on
// Polygon (137) — Polymarket runs nowhere else. Everywhere else the capability
// is false and the Predict tab hides entirely (FR-018 soft-fail).
const PREDICT_CHAIN_IDS = new Set([137])
```

On any other chain the Predict tab doesn't render at all. No greyed-out button, no "coming soon" — the surface simply isn't there.

## Per-User Credentials, Client-Direct Orders

Since the CLOB binds orders to their signer, each member derives their own API credentials. `frontend/src/lib/predict/clobSession.js` wraps the official `@polymarket/clob-client`: `createOrDeriveApiKey()` is deterministic per wallet and costs one gasless L1 EIP-712 signature — a wallet prompt, no transaction. The resulting `{ key, secret, passphrase }` is cached in `sessionStorage` per address, so the member signs at most once per session, and the credentials are **never sent to a FairWins server**. The CLOB serves `Access-Control-Allow-Origin: *`, so the SPA calls it directly; the member's L2 credentials never transit the gateway.

The order itself — the EIP-712 struct, amount rounding, salt, signature, submission — is owned entirely by the SDK. An early attempt to hand-roll the struct produced subtly wrong orders: the real CTF Exchange order is 12 fields under domain `"Polymarket CTF Exchange"` version `"1"`, and notably it contains **no builder field**. Attribution is not part of the signed order at all. It rides on request headers.

## The Attribution Seam: Signing Headers Without Shipping Secrets

FairWins' builder code is a public `bytes32` (`0x6e0316783960e149b53466f0f2c5fdbaf5ce11ba15669491de980f6dedc493a3`). Attribution works by attaching four `POLY_BUILDER_*` headers — key, passphrase, signature, timestamp — to each order submission, HMAC-signed with FairWins' registered builder credentials. Those credentials *are* a shared secret, so they live only in the gateway's environment (`POLYMARKET_API_KEY` / secret / passphrase — server-side configuration, never exposed to the browser).

The bridge between "SDK in the browser" and "secret on the server" is a duck-typed remote signer in `clobSession.js`. The CLOB client only ever calls `isValid()` and `generateBuilderHeaders(method, path, body)`, so `makeBuilderConfig` returns a shim that forwards those three values to the gateway's `POST /v1/polymarket/:chainId/builder-sign` endpoint (`services/relay-gateway/src/polymarket/routes.js`). The gateway — Polygon-gated, origin-locked, killswitched, and write-quota'd like every other write route — computes the HMAC with `@polymarket/builder-signing-sdk` and returns the four headers, which the SDK stacks on top of the member's own L2 auth headers.

Two properties matter here. First, the gateway signs *attribution headers only* — it never sees an order, a credential, or a position. Second, attribution is **best-effort**: if the gateway is down, unconfigured, or the fetch fails, the shim returns `undefined` and the SDK posts the order *unattributed* rather than blocking it. The never-stranded rule (FR-015) applies to revenue too — FairWins losing a fee is never a reason a member can't trade.

## Fees, Honestly

This is where Predict diverges from Collect, and the divergence is the most instructive part of the design. OpenSea's affiliate reward comes out of OpenSea's own fee — zero user cost — so Collect attributes silently. Polymarket's builder fee is **additive**: it stacks on top of Polymarket's own platform taker fee and is a real cost to the taker. The single source for that distinction is `services/relay-gateway/src/polymarket/builderCode.js`:

```js
/**
 * KEY DIFFERENCE from the OpenSea `attachReferral` seam: OpenSea's referral
 * reward comes out of OpenSea's own fee (no user cost), so that seam is a
 * silent no-op. Polymarket's builder fee is ADDITIVE — it stacks on top of
 * the platform taker fee and is a REAL cost to the taker — so the fee bps
 * returned here feed a VISIBLE fee line in the client's cost breakdown.
 */
export function attachBuilderCode(config, { chainId, isMaker = false }) { /* … */ }
```

So the confirm UI treats the fee the way the platform's honest-disclosure doctrine demands: `computeCost` in `frontend/src/lib/predict/clobOrder.js` computes the notional and the builder fee in floored bigint math (no float drift) and emits `"FairWins builder fee"` as its own labelled line — never folded into a total, never described as free. Polymarket's *own* taker fee is a curve over price and size computed by their engine at execution; rather than fabricate a dollar estimate FairWins can't guarantee, the confirm UI discloses it as a separate note. The rule is "shown == charged" for the one fee FairWins controls, and honest uncertainty for the one it doesn't. Makers pay no builder fee at all.

The rates are configuration, not code: default **50 bps taker / 0 maker**, hard-capped at Polymarket's program limits of 100/50. The cap is enforced at the gateway's boot, loudly:

```js
// services/relay-gateway/src/config/index.js
const bps = int(env, 'POLYMARKET_BUILDER_TAKER_FEE_BPS', 50)
if (bps > 100) throw new Error(
  `[relay-gateway] POLYMARKET_BUILDER_TAKER_FEE_BPS=${bps} exceeds the 100 bps cap`)
```

A misconfigured fee doesn't silently clamp or quietly overcharge — the gateway refuses to start. For context, total taker cost lands around Polymarket's curved platform fee (~0.75%–1.8% by category) plus the 0.5% builder fee: comparable to Kalshi and mid-pack among third-party Polymarket builders (see `specs/057-predict-polymarket/research.md`, D2–D4).

## The Region Gate

Polymarket blocks order placement from restricted regions as a matter of its own policy. `frontend/src/lib/predict/geoblock.js` checks `polymarket.com/api/geoblock` before fee load and before submit. A blocked member gets an honest region notice and a "Trade on Polymarket ↗" link-out — FairWins never bypasses the block, and never renders a trade button that's going to fail. The same degrade-honestly pattern covers every failure mode: fees unconfirmable ⇒ signing is blocked rather than guessed; killswitch or outage ⇒ message plus a Polymarket link; passkey wallets ⇒ an honest "not available yet" (`PASSKEY_PREDICT_ENABLED = false` until ERC-1271 order binding is verified end-to-end).

## Design Decisions

**Attribution over intermediation.** The CLOB's signer binding made a submitting relayer impossible, but even without that constraint, header-based attribution is the better trade: FairWins earns on volume without holding credentials, orders, or funds — no custody, no broker posture, and the smallest possible secret surface (one builder credential set, used only for HMACs).

**Client-direct trading, gateway reads.** Splitting the paths means the latency- and trust-sensitive leg (signed orders) has no FairWins hop, while the cacheable leg (market browse, positions) gets quotas and a killswitch. The gateway can die and members can still trade.

**Fee as config with a boot-time cap.** Rates in environment config keep bps out of client code; the boot failure turns a fat-fingered `500` into an outage you notice in seconds instead of a fee incident you discover in a support ticket.

**Disclose what you control, admit what you don't.** The additive builder fee gets an exact labelled line; Polymarket's execution-time fee gets an honest note instead of a made-up estimate. The alternative — one blended "total" — would be tidier and less truthful.

The open trade-off is the deferred passkey path: EOA wallets trade today, smart-account signatures wait for verified ERC-1271 support, and the honest answer shipped ahead of the complete one.

## Sources

- `specs/057-predict-polymarket/` — spec, plan, and research (D2–D4 fee benchmarking, D9 builder seam)
- `docs/developer-guide/predict-polymarket.md` — architecture and operations overview
- `services/relay-gateway/src/polymarket/` — `builderCode.js`, `routes.js` (builder-sign endpoint), `client.js`, `normalize.js`
- `services/relay-gateway/src/config/index.js` — fee caps and boot-time validation
- `frontend/src/lib/predict/` — `clobSession.js`, `clobOrder.js`, `builderFee.js`, `geoblock.js`, `tradeSigner.js`
- `frontend/src/config/networks.js` — `PREDICT_CHAIN_IDS` Polygon-only capability
- Polymarket CLOB documentation — https://docs.polymarket.com/
- `@polymarket/clob-client` — https://www.npmjs.com/package/@polymarket/clob-client
- EIP-712: Typed structured data hashing and signing — https://eips.ethereum.org/EIPS/eip-712
