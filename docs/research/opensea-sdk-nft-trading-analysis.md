# OpenSea SDK Integration Analysis — NFT Collectibles in FairWins

**Research Date**: July 13, 2026
**Research Focus**: Evaluating the OpenSea SDK family for in-app digital-collectible (NFT) trading with a minimal display surface
**Status**: Research Phase — no implementation decision yet
**Primary Source**: <https://docs.opensea.io/reference/sdks-overview>

## Executive Summary

OpenSea ships a family of developer tools — a TypeScript trading SDK
(`@opensea/sdk`, formerly `opensea-js`), a WebSocket event stream
(`@opensea/stream-js`), a CLI, a REST API (v2), and a hosted MCP server — all
keyed by a single OpenSea API key. Together they cover everything FairWins
would need for collectibles: portfolio display, collection/floor data,
creating and accepting listings and offers, order fulfillment, transfers, and
real-time marketplace events.

### Key Findings

1. **The SDK is a full-coverage fit for the stack we already run.** It supports
   both ethers v6 and viem initialization; the FairWins frontend already ships
   ethers v6, viem, and wagmi. Orders are Seaport EIP-712 typed-data
   signatures — the same signing primitive our gasless-intent rails (specs
   035/036/054) already put in front of users. Listings and offers are
   **gas-free signatures**; only fulfillment (buying/accepting) is an on-chain
   transaction.
2. **The API key cannot live in the frontend.** OpenSea's docs are explicit:
   do not use the SDK client-side. The natural home is our existing
   `services/relay-gateway` (it already does screening, quotas, killswitch,
   and KMS signing), acting as a read/orderbook proxy. This also matches the
   "never commit secrets" guardrail.
3. **Chain support constrains scope.** OpenSea supports Ethereum, Polygon,
   Base, Arbitrum, Optimism, and ~20 other chains — **Polygon is fully
   supported**, but **Ethereum Classic / Mordor is not**. An NFT feature would
   be Polygon-first and simply absent on Mordor (soft-fail to hidden, the same
   pattern the callsign registry uses when undeployed).
4. **A minimal display gets disproportionate coverage.** Four read endpoints
   (NFTs by account, collection metadata, best listing, best offer) power a
   complete "My Collectibles" view; two SDK calls (`createListing`,
   `fulfillOrder`) plus their cancel/accept twins cover the entire sell/buy
   loop. Everything else (auctions, bundles, drops, swaps, analytics) can be
   deliberately left out.
5. **Recommendation**: if the feature is pursued, phase it —
   read-only portfolio display first (API proxy only, no signatures), then
   sell/accept-offer, then buy. Defer streaming, auctions, and token swaps.

---

## Table of Contents

1. [The OpenSea Tool Family](#the-opensea-tool-family)
2. [Capability Inventory](#capability-inventory)
3. [Chain Support and FairWins Deployment Targets](#chain-support-and-fairwins-deployment-targets)
4. [Architecture Fit](#architecture-fit)
5. [Minimal-Display Feature Mapping](#minimal-display-feature-mapping)
6. [What to Deliberately Exclude](#what-to-deliberately-exclude)
7. [Risks and Limitations](#risks-and-limitations)
8. [Suggested Phasing](#suggested-phasing)
9. [Open Questions for a Future Spec](#open-questions-for-a-future-spec)

---

## The OpenSea Tool Family

All tools authenticate with one OpenSea API key (`x-api-key`). A rate-limited
free key can be minted instantly (`POST https://api.opensea.io/api/v2/auth/keys`,
30-day validity); production keys come from the developer portal at
`opensea.io/settings/developer`.

| Tool | Package / Endpoint | Role |
|---|---|---|
| Trading SDK | `@opensea/sdk` (npm; formerly `opensea-js`, now at v11.x) | Create/fulfill/cancel listings & offers, fetch NFTs/collections/orders, transfers, balances. Ethers v6 **and** viem entry points (`@opensea/sdk/viem`). |
| Stream SDK | `@opensea/stream-js` | WebSocket push of marketplace events per collection: listed, sold, transferred, metadata updated, cancelled, received offer, received bid. Best-effort delivery (may drop/reorder). |
| CLI | `@opensea/cli` | Same API surface for scripts/ops; usable programmatically. |
| REST API v2 | `api.opensea.io/api/v2` | Raw endpoints behind the SDK: data & discovery, marketplace & trading, analytics & events. Wallet-scoped endpoints need an additional scoped bearer token. |
| MCP server | `https://mcp.opensea.io/mcp` | Hosted Model Context Protocol server (40+ tools: search, floor prices, portfolio valuation, swap quotes). Relevant to our agent tooling, not the product UI. |

The trading SDK is a wrapper over **Seaport** (OpenSea's open-source
settlement protocol). Orders are EIP-712 typed-data signatures stored in
OpenSea's off-chain orderbook; settlement happens on-chain through the
canonical Seaport contract, which is deployed at the same address on every
supported chain. Platform fees and creator royalties are encoded as
consideration items inside the order itself — the SDK computes them, so a
thin UI never has to.

## Capability Inventory

What `@opensea/sdk` + API v2 give us, grouped by what a wallet-style app
actually needs:

**Read / display (API key only, no wallet needed)**
- NFTs owned by an address (per chain), with metadata + image URLs
- Single NFT detail, collection metadata, collection stats (floor price, volume, sales)
- Best listing / best offer for an item; full listings/offers lists
- Account profile lookup, payment-token info
- Metadata refresh requests
- Historical events (sales, transfers, listings) per item/collection/account

**Write — signature only (gas-free for the user)**
- `createListing` — fixed-price sale of an owned NFT (expiration, payment token configurable; ERC-20 listings supported, so USDC-denominated pricing is possible)
- `createOffer` / `createCollectionOffer` — WETH/ERC-20 bids on an item or a whole collection
- `cancelOrder` — off-chain cancel is free; hard on-chain cancel costs gas

**Write — on-chain transaction**
- `fulfillOrder` — buy a listing or accept an offer (the one place a buyer pays gas + price)
- Asset transfer (send an NFT to another address)
- WETH wrap/unwrap helpers (only needed if we support offers in native-token markets)
- Token balance queries and (v11) cross-chain token swaps — out of scope for us

**Push (stream-js, server-side)**
- Per-collection event subscriptions — useful later for "your item sold" notifications through the gateway, not needed for an MVP

## Chain Support and FairWins Deployment Targets

OpenSea currently supports Ethereum, Polygon, Base, Arbitrum, Optimism,
Avalanche, Zora, Blast, Sei, ApeChain, Ronin, Abstract, Solana, and more —
**but not Ethereum Classic or Mordor**.

Consequences for us:

- **Polygon (our production target for pools and gasless rails) is fully
  supported** — reads, orderbook writes, and Seaport settlement.
- **Mordor/ETC users cannot get this feature at all.** The UI must soft-fail
  to hidden on unsupported chains, exactly like the callsign registry
  soft-fails when undeployed. No wager or pool flow may depend on NFT
  functionality (it's display/portfolio-adjacent, never on the value path).
- Testnet development story: OpenSea's testnet support is limited and shifts
  over time (Sepolia-family testnets, not Mordor). Integration tests should
  mock the API; end-to-end testing realistically happens against Polygon
  mainnet with a throwaway collection.

## Architecture Fit

### The API key forces a gateway proxy

OpenSea explicitly warns against embedding the SDK (and therefore the API
key) in client-side code. Two viable shapes:

1. **Gateway proxy (recommended).** `services/relay-gateway` grows a small
   `/v1/opensea/*` surface: read endpoints proxied with caching +
   per-user quotas (it already has screening, quotas, and killswitch
   plumbing), and a "post order" endpoint that forwards a client-signed
   Seaport order to OpenSea's orderbook. The OpenSea API key lives only in
   gateway config/KMS, same as the paymaster and relayer secrets.
2. **Frontend-direct (rejected).** Shipping the key in the SPA bundle is a
   guardrail violation and gets the key revoked/abused.

### Signing stays with the user's wallet

The split mirrors our gasless-intent architecture:

- **Frontend**: builds the Seaport order and asks the connected wallet
  (wagmi/ethers signer) for the EIP-712 signature. Users already see this
  exact interaction pattern for `…WithSig` intents, so the confirm UI
  conventions (honest fee disclosure, human-readable summary) carry over.
- **Gateway**: holds the API key, posts/reads orderbook data, never holds
  user keys, never signs orders.
- **Fulfillment** (buying / accepting an offer) is a normal on-chain
  transaction against canonical Seaport. Self-submit always works — the
  never-stranded rule holds because Seaport settlement does not require our
  gateway, only order *discovery* does.

Practical wrinkle: `@opensea/sdk` bundles signing + API into one object
designed for server-side use where the server holds the signer. For our
split, the cleanest decomposition is **gateway uses `@opensea/sdk` (or raw
API v2) for all API traffic**, while the **frontend uses `seaport-js` (the
underlying open-source order builder) with the user's wagmi signer** to
construct and sign orders, then POSTs them through the gateway. A future
spec/plan should prototype both this split and a simpler
"gateway-builds-unsigned-order, frontend signs" flow before committing.

### Passkey accounts (spec 050)

Passkey smart accounts complicate things: Seaport EIP-712 order signatures
from a contract account validate via ERC-1271, which OpenSea supports, but
this needs explicit verification with our account implementation.
Fulfillment from a passkey account is just another UserOp and could in
principle be sponsored by the spec-050 paymaster — a policy decision
(sponsoring NFT purchases burns FairWins deposit on non-core actions) that
should default to **user-pays** with honest fee disclosure.

## Minimal-Display Feature Mapping

The stated goal is "minimal display with good coverage." The smallest UI that
still feels complete:

| UI element | Backing calls | Signature/tx? |
|---|---|---|
| **Collectibles tab** — grid of owned NFTs (image, name, collection) | NFTs-by-account + collection metadata (proxied, cached) | None |
| Item detail sheet — image, traits, floor price, best offer | NFT detail, collection stats, best offer | None |
| **Sell** button — fixed price in USDC/native, pick expiry | `createListing` | EIP-712 signature (gas-free) |
| **Accept offer** button on detail sheet | `fulfillOrder` against best offer | On-chain tx |
| Cancel listing | `cancelOrder` (off-chain) | Signature |
| **Buy** (optional, phase 3) — enter a collection/item, buy at ask | best listing + `fulfillOrder` | On-chain tx |
| Send NFT to a friend (nice-to-have) | SDK transfer (or plain `safeTransferFrom`) | On-chain tx |
| "View on OpenSea" deep link | none — URL scheme | None |

Identity primitives compose for free: the recipient/counterparty fields reuse
the existing resolution priority (address book > `%callsign` > ENS >
generated), and pool/wager screens are untouched.

The true minimum viable slice is rows 1, 2, and the deep link: a read-only
portfolio with "trade on OpenSea" handoff. That ships with zero new
signatures, zero custody questions, and one proxied API surface — and still
covers the majority of user value (seeing your stuff, jumping to a liquid
market).

## What to Deliberately Exclude

To keep the display minimal, explicitly out of scope:

- English/Dutch auctions, bundles, sweeping, and trait offers
- Minting/drops (OpenSea drop tooling is a separate surface)
- Cross-chain token swaps (v11 SDK feature; we have our own swap paths)
- Collection analytics dashboards (a floor-price number on the detail sheet is enough)
- Real-time streaming in the UI (poll-on-open is fine at our scale; stream-js is a later notifications enhancement on the gateway)
- Any on-chain FairWins contract changes — this feature is **pure
  frontend + gateway**; no registry/pool involvement, nothing on the value
  path, no new upgradeable contracts

## Risks and Limitations

1. **Centralized dependency.** The orderbook, metadata, and images come from
   OpenSea's API. Outages degrade the tab; the UI must soft-fail (cached
   data, deep link still works). Settlement-layer decentralization (Seaport)
   limits worst-case harm to *discovery*, not funds.
2. **Rate limits.** Free keys are tight; production throughput requires a
   granted key. Gateway caching (collection metadata, images) is mandatory,
   and quotas per user prevent one wallet from exhausting the key.
3. **Terms of service.** Embedding OpenSea orderbook data and charging any
   FairWins-side fee on top needs a ToS review before implementation.
4. **Sanctions/compliance.** Trading counterparties are arbitrary. Gateway
   proxying lets us reuse the existing screening stack
   (`ISanctionsGuard`-equivalent checks live server-side in relay-gateway) at
   least for our own users' actions; we cannot screen the anonymous
   counterparty of an orderbook fill.
5. **ERC-1271/passkey unknowns.** Contract-account listing signatures need a
   spike before promising sell support to passkey users.
6. **Scope creep.** NFT marketplaces are a product rabbit hole; the
   exclusions list above is the guardrail. Nothing here should touch wager or
   pool escrow logic.
7. **API churn.** The package was renamed (`opensea-js` → `@opensea/sdk`) and
   majors land frequently (v8 → v11 in ~a year). Pin versions in the gateway;
   the frontend's exposure is limited if it only depends on `seaport-js` +
   our own proxy contract (API shape), not on OpenSea's SDK directly.

## Suggested Phasing

- **Phase 1 — Read-only portfolio (low risk, high value).** Gateway proxy
  (`/v1/opensea/*`, key in KMS, caching, quotas) + Collectibles tab + item
  detail + "View on OpenSea" deep link. Polygon only; hidden on Mordor. No
  signatures, no custody, no ToS exposure beyond data display.
- **Phase 2 — Sell-side.** `createListing` (USDC or POL denominated),
  cancel, accept best offer. Client-side Seaport signing via wagmi; orders
  posted through the gateway. Confirm UI discloses OpenSea platform fee +
  creator royalties (read from the order's consideration items, not
  hardcoded).
- **Phase 3 — Buy-side + notifications.** `fulfillOrder` for buying, optional
  stream-js consumer on the gateway feeding "listed/sold" pushes.

Each phase is independently shippable and independently abandonable; if this
proceeds, Phase 1 should go through `/speckit-specify` as its own feature.

## Open Questions for a Future Spec

1. Does the feature charge any FairWins fee, or is it pure utility? (Drives ToS review depth.)
2. Is Phase 1 gated by membership tier (like callsigns) or open to all connected wallets?
3. ERC-1271 listing signatures from passkey accounts — supported by OpenSea's orderbook validation for our account implementation?
4. Should the gateway's OpenSea surface be a new route group on relay-gateway or a separate small service (blast-radius isolation vs. operational simplicity)?
5. Image/metadata proxying: serve OpenSea CDN URLs directly or re-proxy for privacy (user IP leakage to OpenSea's CDN)?

## Sources

- [OpenSea SDKs overview](https://docs.opensea.io/reference/sdks-overview)
- [OpenSea API overview](https://docs.opensea.io/reference/api-overview)
- [`opensea-js` / `@opensea/sdk` repository](https://github.com/ProjectOpenSea/opensea-js)
- [`stream-js` repository](https://github.com/ProjectOpenSea/stream-js)
- [OpenSea MCP](https://docs.opensea.io/reference/mcp)
- [Supported blockchains (help center)](https://support.opensea.io/en/articles/8867082-which-blockchains-are-compatible-with-opensea)
