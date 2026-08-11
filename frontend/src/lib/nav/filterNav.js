/**
 * Menu filtering (spec 081 FR-014) — pure, so the matching rule is testable without rendering a
 * drawer, and so the drawer file stays a component module (react-refresh needs that).
 */

function normalize(query) {
  return String(query ?? '').trim().toLowerCase()
}

function matches(item, needle) {
  return String(item?.label ?? '').toLowerCase().includes(needle)
}

/**
 * Narrow grouped nav items to those whose label matches `query`, case-insensitively and ignoring
 * surrounding whitespace. A group left with no matches is dropped along with its heading: a
 * heading over nothing reads as a section that has been emptied rather than one that had no hits.
 * An empty query returns the same array reference, so callers can rely on identity.
 */
export function filterNavGroups(groups, query) {
  const needle = normalize(query)
  if (!needle) return groups
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => matches(item, needle)) }))
    .filter((group) => group.items.length > 0)
}

/** The same rule applied to a flat list (the pinned-apps strip). */
export function filterNavItems(items, query) {
  const needle = normalize(query)
  if (!needle) return items
  return items.filter((item) => matches(item, needle))
}
