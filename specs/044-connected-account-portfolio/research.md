# Research: Connected Account Portfolio

**Feature**: 044-connected-account-portfolio | **Date**: 2026-07-10

## R1 — Asset discovery strategy (registry scan vs. indexer)

**Decision**: Registry-driven discovery. The portfolio scans a bundled, per-network
asset registry (`config/assetTaxonomy.js`) and reads the connected account's balance for
each entry; it does not enumerate token transfers.

**Rationale**: Matches the feature's stated industry-standard approach (SEC baseline +
curated token lists), the app's no-backend architecture, and the constitution's honesty
rules — the UI explicitly discloses that only registry-listed assets are scanned
(FR-013). Full discovery needs an indexer (covalent-style API or subgraph per chain);
Mordor/ETC have no hosted Graph indexer at all, so an indexer path could not even be
uniform across supported networks.

**Alternatives considered**: (a) The Graph token subgraphs — not available on the ETC
family, adds per-chain infra; (b) explorer APIs (Polygonscan/Blockscout) — API keys,
rate limits, and a second source of truth; (c) log-scanning `Transfer` events over RPC —
unbounded reads on public endpoints. All rejected for v1.

## R2 — Registry layering, sources, and precedence

**Decision**: Three classification sources merged per chain, with precedence
**SEC baseline > curated registry > app configuration** (FR-006):

1. **SEC baseline** (`sec-baseline`): a hardcoded symbol-level list derived from the
   SEC's public statements on commodity-classified assets (BTC, ETH, SOL, XRP, plus the
   networks' own native coins MATIC/POL and ETC as majors functioning as L1 gas assets).
   Applies to native coins and their canonical wrapped forms → **Digital Commodities**.
2. **Curated registry** (`curated-registry`): per-chain canonical token entries bundled
   with the app (Tokenlists-style data reduced to what the app supports), each mapped to
   a category by known issuer status / contract behavior. Initial curation: Polygon
   WETH + WBTC (wrapped baseline commodities), LINK (protocol utility → Digital Tools),
   USDT (transactional stablecoin → Payment Stablecoins).
3. **App configuration** (`app-config`): assets the app already knows from sync
   artifacts/config — the per-network `stablecoin` (→ Payment Stablecoins),
   `dex.wnative` / `wmatic` (→ Digital Commodities via baseline), and the
   `membershipVoucher` ERC-721 (membership credential → **Digital Tools**, rendered as
   an item count per FR-011).

**Rationale**: Mirrors the requested implementation tip exactly; precedence gives the
regulator-published baseline the last word and makes conflicts deterministic and
testable. The voucher NFT gives the Collectibles/count rendering path a real, app-owned
asset without inventing NFT data (constitution III).

**Alternatives considered**: Runtime ingestion of remote token lists (Tokenlists.org
URLs) — rejected for v1: network dependency, list-integrity questions, and the spec
assumption that the registry ships with app releases.

## R3 — Digital Securities and Digital Collectibles population in v1

**Decision**: Both categories always render with their regulatory description; on
networks where the curated registry has no entry for them they show the explicit empty
state ("No assets in this category"). No tokenized-security or third-party NFT
collection is listed at launch.

**Rationale**: The app's supported chains have no security tokens the app can vouch for,
and honest-empty beats fabricated coverage (constitution III). The mockup's BUIDL/BITO
rows are visual reference only (spec Assumptions). Registry structure supports adding
them later as pure config data.

## R4 — USD pricing and "partial totals" semantics

**Decision**: Prices resolve per asset kind:
- **Stablecoins** (Payment Stablecoins category): par $1 — the existing
  `useAccountStats` convention.
- **Native / wrapped-native**: `usePriceConversion().nativeUsdRate` (PriceContext) —
  applied **only** on chains whose native symbol the feed actually quotes (MATIC chains
  137/80002). When the feed errored (CoinGecko down → hardcoded fallback rate) the rate
  is treated as unavailable for portfolio purposes.
- **Everything else** (WETH, WBTC, LINK, vouchers, unclassified): no price → balance
  shown, `usd: null`.

Any `usd: null` holding flips the grand total and its category subtotal to a labeled
**partial** state; unpriced assets are excluded from sums and never shown as $0.00
(FR-010, SC-005).

**Rationale**: The app has exactly one price feed (MATIC/USD). Constitution III forbids
presenting the fallback rate or a cross-asset guess as real value. Extending the price
service (multi-asset CoinGecko queries) is deliberately out of scope — the partial-total
mechanics make the limitation visible instead of hidden.

**Alternatives considered**: multi-id CoinGecko batch quote — viable later, but adds
rate-limit exposure and scope; DEX pool spot prices — manipulable, wrong tool for a
compliance-flavored view.

## R5 — Balance reading and refresh cadence

**Decision**: One `provider.getBalance(address)` for the native entry and one
`balanceOf(address)` (minimal ERC-20/721 ABI, `['function balanceOf(address) view returns (uint256)']`)
per token entry, issued concurrently via `Promise.allSettled` against the wallet
context's read provider. Per-asset failures mark the snapshot **partial** (with the
failed assets skipped and named), an all-assets failure surfaces the FR-014 error state
with retry. Poll every 60s (`useAccountStats` precedent) plus a manual refresh action;
a request-id ref guards against out-of-order responses; state resets on
`address`/`chainId` change (SC-004).

**Rationale**: Registries are ≤ ~8 entries per chain — a multicall batch (Multicall3 ABI
exists but is unused in `src/`) would introduce a new pattern for no measurable win
(constitution: simplicity/YAGNI).

## R6 — Navigation and rendering surface

**Decision**: Add `{ id: 'portfolio', label: 'Portfolio' }` to the **Finance** group of
`WALLET_TAB_GROUPS` in `WalletPage.jsx` and a matching
`{activeTab === 'portfolio' && <div className="portfolio-section" role="tabpanel"><PortfolioPanel /></div>}`
block. Deep-linking (`/wallet?tab=portfolio`) works through the existing
`searchParams` resolution with no extra code.

**Rationale**: Exact repeat of how Trade / Pay & Transfer / Custody are wired; zero new
navigation machinery.

## R7 — Collapsible category sections (accessibility)

**Decision**: Each category header is a `<button aria-expanded aria-controls>` toggling
a `role="region"`-labeled body; all five categories (plus Unclassified when non-empty)
render expanded by default with subtotal visible when collapsed. Keyboard operability
and name/role/value come from native button semantics; vitest-axe audits the populated
and collapsed states.

**Rationale**: WCAG 2.1 AA via native elements (constitution V); matches the disclosure
pattern rather than importing an accordion dependency.
