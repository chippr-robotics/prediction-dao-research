/**
 * Menu filtering (spec 081 FR-014) — pure, so the matching rule is testable without rendering a
 * drawer, and so the drawer file stays a component module (react-refresh needs that).
 *
 * Originally this matched nav labels and nothing else. It now ALSO consults the nav search index
 * (config/navSearchIndex.js) so a member can type the name of a protocol or a preference card —
 * "morpho", "opensea", "rpc" — and reach the section that holds it. The index is passed in rather
 * than imported here: this module stays a pure matcher, and the drawer decides which items are
 * even eligible (chain- and tenant-hidden sections never reach it).
 *
 * An item survives the filter when its OWN terms match, or when any destination inside it does.
 * The matching destinations ride along on the returned item as `matches`, so the drawer can offer
 * them as direct shortcuts under the section that owns them — which is the whole point: "morpho"
 * should not merely reveal the Earn icon, it should offer Earn ▸ Lend.
 */

import { queryTerms, scoreEntry, rankEntries } from './navSearch'

// How many sub-surface shortcuts one section may contribute. The drawer's height is bounded by
// design (spec 081), and a broad term like "vault" hits several sections at once; beyond this the
// parent row is the way in, and the count of what was left out is shown rather than swallowed.
export const MATCH_LIMIT = 4

function normalize(query) {
  return String(query ?? '').trim().toLowerCase()
}

/**
 * Narrow grouped nav items to those matching `query`, case-insensitively and ignoring surrounding
 * whitespace. A group left with no matches is dropped along with its heading: a heading over
 * nothing reads as a section that has been emptied rather than one that had no hits. An empty
 * query returns the same array reference, so callers can rely on identity.
 *
 * @param {Array} groups
 * @param {string} query
 * @param {{ termsFor?: (item) => string[], destinationsFor?: (item) => Array }} [options]
 *   `termsFor` supplies an item's synonyms; `destinationsFor` supplies its sub-surfaces. Both are
 *   optional — with neither, this is exactly the label-only filter it has always been.
 */
export function filterNavGroups(groups, query, options = {}) {
  const needle = normalize(query)
  if (!needle) return groups
  const terms = queryTerms(needle)
  return groups
    .map((group) => ({ ...group, items: matchItems(group.items, terms, options) }))
    .filter((group) => group.items.length > 0)
}

/** The same rule applied to a flat list (the pinned-apps strip). */
export function filterNavItems(items, query, options = {}) {
  const needle = normalize(query)
  if (!needle) return items
  return matchItems(items, queryTerms(needle), options)
}

function matchItems(items, terms, { termsFor, destinationsFor } = {}) {
  const out = []
  for (const item of items) {
    const ownScore = scoreEntry({ ...item, keywords: termsFor?.(item) }, terms)
    const destinations = destinationsFor ? rankEntries(destinationsFor(item), terms) : []
    if (!ownScore && destinations.length === 0) continue
    if (destinations.length === 0) {
      out.push({ ...item })
      continue
    }
    out.push({
      ...item,
      matches: destinations.slice(0, MATCH_LIMIT),
      matchOverflow: Math.max(0, destinations.length - MATCH_LIMIT),
    })
  }
  return out
}
