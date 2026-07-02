/**
 * Participant ordering for the pool roster (pool-manager tester feedback, items 3–4).
 * Alphabetical by alias (then suffix) by default; the creator's arranged commitment order wins when
 * present, with unknown commitments appended alphabetically.
 */
export function sortParticipants(participants, order) {
  const alphabetical = [...participants].sort(
    (a, b) => a.label.localeCompare(b.label) || a.suffix.localeCompare(b.suffix)
  )
  if (!order || !order.length) return alphabetical
  const rank = new Map(order.map((c, i) => [String(c), i]))
  return [...alphabetical].sort((a, b) => {
    const ra = rank.has(a.commitment) ? rank.get(a.commitment) : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b.commitment) ? rank.get(b.commitment) : Number.MAX_SAFE_INTEGER
    return ra - rb
  })
}
