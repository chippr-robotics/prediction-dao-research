/**
 * StoreView (spec 077, US2) — the Apps tab's sub-view vocabulary, resolved from `?view=`.
 *
 * One resolver so the panel and the store bar cannot disagree about what a view string means.
 * Unknown values fall back to the market rather than erroring: a stale bookmark should land a
 * member in the store, not on a blank surface. `submit` is NOT in this vocabulary — the developer
 * submission surface keeps its pre-existing exclusive rendering in `CatalogPanel`'s wrapper.
 */
export const STORE_VIEWS = Object.freeze({
  MARKET: 'market',
  MINE: 'mine',
  SEARCH: 'search',
})

/** `?view=` string (or null) → one of STORE_VIEWS. Total: anything unknown is the market. */
export function resolveStoreView(raw) {
  return raw === STORE_VIEWS.MINE || raw === STORE_VIEWS.SEARCH ? raw : STORE_VIEWS.MARKET
}
