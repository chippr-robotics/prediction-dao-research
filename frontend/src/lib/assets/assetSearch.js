/**
 * Asset-option search, shared by every selector that lists more than one
 * network's assets (spec 067's UniversalAssetSelect, the multi-network Trade
 * ticket's pair pickers).
 *
 * ONE rule, in one place: match on the three fields a member can actually SEE on
 * an option — the symbol, the asset name, and the network name. Matching a hidden
 * field (an address, a category id) would make the list narrow for reasons the
 * member cannot see; matching fewer would make a network name they are staring at
 * un-searchable. Search only ever narrows what is already eligible, so typing
 * can never surface an option the caller's own rules excluded.
 */

/** The visible fields a query is matched against. */
const SEARCHABLE_FIELDS = ['symbol', 'name', 'networkName']

/** Whether `option` matches `query` (empty/blank query matches everything). */
export function matchesAssetQuery(option, query) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (!needle) return true
  return SEARCHABLE_FIELDS.some((field) => {
    const value = option?.[field]
    return typeof value === 'string' && value.toLowerCase().includes(needle)
  })
}

/** `options` narrowed to `query`, preserving the caller's ordering. */
export const filterAssetsByQuery = (options = [], query) =>
  (options || []).filter((option) => matchesAssetQuery(option, query))

export default matchesAssetQuery
