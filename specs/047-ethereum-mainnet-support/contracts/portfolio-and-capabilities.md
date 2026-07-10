# Contract: Portfolio Inclusion, Pricing & Transfer Reuse

Observable behavior of the portfolio and send/receive surfaces for the Ethereum family
after the change. Backed by `config/assetTaxonomy.js`, `config/priceFeeds.js`,
`lib/portfolio/prices.js`, `hooks/usePortfolio.js`, and the reused transfer/QR surfaces.

## C6 — Portfolio chain scope (config/assetTaxonomy.js `getPortfolioChainIds`)

**Given** `getPortfolioChainIds({ includeTestnets })`
**Then**:
- with `includeTestnets: false` → includes `1` (Ethereum mainnet), excludes `11155111`
  and `560048`;
- with `includeTestnets: true` → additionally includes `11155111` and `560048`;
- never includes local `1337`;
- mainnets sorted before testnets.

This satisfies FR-006 (mainnet always in portfolio) and FR-007 (testnets gated by the
opt-in) with no change to the function itself — it derives from `NETWORKS` + `isTestnet`.

## C7 — Curated registry (config/assetTaxonomy.js `getPortfolioRegistry`)

**Given** `getPortfolioRegistry(1)`
**Then** the entries include exactly these ids (native + canonical tokens), each carrying
`chainId: 1`:

| id | symbol | kind | categoryId |
|----|--------|------|------------|
| `native` | ETH | native | digital-commodities (via baseline) |
| `0xc02a…6cc2` | WETH | erc20 | digital-commodities |
| `0xa0b8…eb48` | USDC | erc20 | payment-stablecoins |
| `0xdac1…1ec7` | USDT | erc20 | payment-stablecoins |
| `0x6b17…1d0f` | DAI | erc20 | payment-stablecoins |

- No entry has a null/empty `address` except the `native` entry.
- `getPortfolioRegistry(560048)` with no configured stablecoin yields the `native` entry
  (and any real curated token), never an empty-address stablecoin entry.

## C8 — Honest pricing (lib/portfolio/prices.js + config/priceFeeds.js)

**Given** a portfolio holding on chainId 1
**Then**:
- ETH and WETH resolve a USD price from `CHAINLINK_FEEDS[1].ETH` (WETH via
  `underlyingSymbolOf → ETH`);
- USDC/USDT/DAI value at par $1 (payment-stablecoins convention);
- an asset with neither a feed nor par status → `usd: null`, excluded from the USD sum
  (never rendered as $0 for a non-zero balance);
- a feed answer older than `FEED_MAX_AGE_SECONDS` → treated as unavailable, not shown.

**And** a failed balance read for an Ethereum asset is reported in `failedAssets`, never
coerced to a zero holding (FR-008, honest-state).

## C9 — Send reuse (components/wallet/TransferForm.jsx — no code change expected)

**Given** the active chain is an Ethereum network with the member holding balance
**Then** the transfer surface:
- offers the native coin (ETH) and, where configured, the network stablecoin;
- discloses fee treatment before confirm — gasless where the stablecoin + relay support it,
  otherwise a native-fee self-submit (on mainnet USDC: self-submit with ETH fee, disclosed);
- blocks a send to a sanctions-flagged recipient (`screenOne`, FR-013);
- never leaves the member without a working send path (FR-010).

If a token has no address on the active Ethereum network, the picker still offers native
ETH (FR-009 edge case) — existing `TransferForm` behavior when `stableUnavailable`.

## C10 — Receive reuse (components/ui/AddressQRCode.jsx — no code change expected)

**Given** the active chain is an Ethereum network
**Then** the member's address renders as a scannable QR (FR-012). The address is identical
across EVM chains, so no per-chain logic is needed.

## C11 — Passkey-only selection (FR-003a)

**Given** a passkey member with no linked external wallet on an Ethereum network
**Then** portfolio and receive render (view-only); the send surface discloses that a
connected wallet is required on this network (the network's `passkeyAccounts` capability is
`false`) rather than presenting a dead action. No new gating code — existing capability
disclosure covers it.

## Test coverage map (for /speckit-tasks)

| Contract | Primary test file |
|----------|-------------------|
| C1, C2, C3, C4 | `test/networks.test.js`, `test/networks.mainnet.test.js`, new `test/networks.ethereum.test.js` |
| C5 | new/updated `test/blockExplorer.test.js` |
| C6, C7 | `test/networks.test.js` / `test/portfolio/usePortfolio.test.jsx` |
| C8 | `test/portfolio/usePortfolio.test.jsx` (pricing + failedAssets) |
| C9, C10, C11 | existing transfer/QR tests remain green; add an Ethereum-active assertion where cheap |
