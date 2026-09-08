/**
 * Coarse, honest age label for a news item (spec 109 FR-004) — the vendor's own freshness varies
 * by asset (research R3), so the age is always shown and always approximate on purpose.
 * Lives in lib/ rather than the component file so the card exports only components
 * (react-refresh/only-export-components).
 */
export function newsAgeLabel(publishedAt, now = Date.now()) {
  const t = Date.parse(publishedAt)
  if (!Number.isFinite(t)) return ''
  const mins = Math.max(0, Math.floor((now - t) / 60_000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 60) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}
