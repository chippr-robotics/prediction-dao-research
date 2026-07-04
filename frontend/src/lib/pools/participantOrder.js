/**
 * Participant ordering for the pool roster (spec 034, address-based).
 * Alphabetical by alias (then suffix) by default; the creator's arranged wallet-address order wins when
 * present, with unknown addresses appended alphabetically. Roster items are { address, nickname:{label,
 * suffix} } (nickname derived deterministically from the public wallet address).
 */
export function sortParticipants(participants, order) {
  const alphabetical = [...participants].sort(
    (a, b) =>
      a.nickname.label.localeCompare(b.nickname.label) ||
      a.nickname.suffix.localeCompare(b.nickname.suffix)
  )
  if (!order || !order.length) return alphabetical
  const rank = new Map(order.map((addr, i) => [String(addr).toLowerCase(), i]))
  const rankOf = (p) =>
    rank.has(String(p.address).toLowerCase())
      ? rank.get(String(p.address).toLowerCase())
      : Number.MAX_SAFE_INTEGER
  return [...alphabetical].sort((a, b) => rankOf(a) - rankOf(b))
}
