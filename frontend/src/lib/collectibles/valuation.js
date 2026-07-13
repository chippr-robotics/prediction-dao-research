/**
 * Collectibles valuation (spec 055 US3 / FR-006) — the floor-price estimate shown as its own
 * labeled line in the Portfolio view.
 *
 * Honest-state rules (research D8, constitution III):
 *   - floor prices are ESTIMATES: the result is never merged into the portfolio's verifiable
 *     totalUsd headline — callers render it as a separate, labeled line;
 *   - items whose collection has no floor, or whose floor currency has no resolvable USD
 *     price, count as UNPRICED and are excluded (never silently valued);
 *   - a bounded collection scan reports `truncated` so a huge wallet's partial estimate
 *     says so instead of posing as complete.
 */

// Floors are quoted per collection; scanning every collection of a whale wallet would burn the
// shared gateway quota for marginal precision. 20 collections ≫ typical holdings.
export const MAX_VALUATION_COLLECTIONS = 20

/** Floor currencies -> the underlying symbols the portfolio price map actually quotes. */
const CURRENCY_ALIASES = { WETH: 'ETH', WMATIC: 'POL', WPOL: 'POL', MATIC: 'POL' }

export function underlyingCurrency(symbol) {
  const s = String(symbol || '').toUpperCase()
  return CURRENCY_ALIASES[s] || s
}

/** The distinct collection slugs to price, oldest-first, capped at the scan bound. */
export function collectionSlugsForValuation(items, max = MAX_VALUATION_COLLECTIONS) {
  const slugs = []
  for (const item of items) {
    if (!item?.collectionSlug || slugs.includes(item.collectionSlug)) continue
    slugs.push(item.collectionSlug)
  }
  return { slugs: slugs.slice(0, max), truncatedCollections: slugs.length > max }
}

/**
 * Compute the CollectiblesValuation aggregate (data-model.md).
 *
 * @param {object[]} items                          loaded CollectibleItems (one network only)
 * @param {Map<string, {floorPrice: {amount: string, currency: string}|null, stale?: boolean}>} statsBySlug
 * @param {(symbol: string) => number|null} usdFor  USD price for a floor currency (e.g. from the
 *                                                  portfolio's on-chain price map); null = unpriced
 * @param {{hasMoreItems?: boolean, truncatedCollections?: boolean}} [bounds]
 */
export function computeCollectiblesValuation(items, statsBySlug, usdFor, bounds = {}) {
  let estimatedUsd = 0
  let pricedItems = 0
  let unpricedItems = 0
  let anyPriced = false
  let stale = false

  for (const item of items) {
    const stats = item.collectionSlug ? statsBySlug.get(item.collectionSlug) : null
    if (stats?.stale) stale = true
    const floor = stats?.floorPrice
    const usdPrice = floor ? usdFor(underlyingCurrency(floor.currency)) : null
    const amount = floor ? Number(floor.amount) : NaN
    if (floor && usdPrice != null && Number.isFinite(amount)) {
      estimatedUsd += amount * usdPrice * (item.quantity || 1)
      pricedItems += item.quantity || 1
      anyPriced = true
    } else {
      unpricedItems += item.quantity || 1
    }
  }

  return {
    estimatedUsd: anyPriced ? estimatedUsd : null,
    pricedItems,
    unpricedItems,
    truncated: Boolean(bounds.hasMoreItems || bounds.truncatedCollections),
    stale,
  }
}
