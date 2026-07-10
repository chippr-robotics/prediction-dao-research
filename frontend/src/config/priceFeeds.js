/**
 * Verifiable on-chain price sources for the portfolio (spec 044 v1.2, FR-022).
 *
 * Layered per underlying asset symbol:
 *   1. Chainlink AggregatorV3 feeds — decentralized oracle network, the
 *      highest-trust source. Canonical Polygon mainnet feed addresses from
 *      https://docs.chain.link/data-feeds/price-feeds/addresses (network:
 *      Polygon). Override per feed via env if a feed migrates.
 *   2. DEX pool spot — Uniswap V3 (or ETCswap V3) pool of the asset vs the
 *      network's configured stablecoin, read from slot0 (see
 *      lib/portfolio/prices.js). Used where no Chainlink feed exists
 *      (e.g. the ETC family).
 *
 * Stablecoins are valued at par $1 (app-wide convention) and are not listed
 * here. Assets with neither source stay honestly unpriced.
 */

// chainId → underlying symbol → AggregatorV3 address (all */USD, 8 decimals).
export const CHAINLINK_FEEDS = {
  137: {
    MATIC: import.meta.env?.VITE_FEED_POLYGON_MATIC_USD || '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
    ETH: import.meta.env?.VITE_FEED_POLYGON_ETH_USD || '0xF9680D99D6C9589e2a93a78A04A279e509205945',
    BTC: import.meta.env?.VITE_FEED_POLYGON_BTC_USD || '0xc907E116054Ad103354f2D350FD2514433D57F6f',
    LINK: import.meta.env?.VITE_FEED_POLYGON_LINK_USD || '0xd9FFdb71EbE7496cC440152d43986Aae0AB76665',
  },
}

// A feed answer older than this is treated as unavailable rather than
// presented as current (honest-state rule).
export const FEED_MAX_AGE_SECONDS = 24 * 60 * 60

// Uniswap V3 fee tiers probed (most-liquid-first) when resolving a DEX spot
// pool for an asset vs the network stablecoin.
export const DEX_SPOT_FEE_TIERS = [500, 3000, 10000]
