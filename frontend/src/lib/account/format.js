/**
 * Display formatting helpers for the Account dashboard (spec 020).
 * Compact, locale-light, and deterministic so they are easy to test.
 */

/** 1500 → "1.5K", 1_200_000 → "1.2M". Keeps a sign for negatives. */
export function formatCompact(n) {
  const num = Number(n) || 0
  const sign = num < 0 ? '-' : ''
  const abs = Math.abs(num)
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}K`
  if (abs >= 100) return `${sign}${Math.round(abs)}`
  return `${sign}${trim(abs)}`
}

function trim(n) {
  return n.toFixed(1).replace(/\.0$/, '')
}

/** Compact USD, e.g. "$1.2K". */
export function formatUsd(n) {
  const num = Number(n) || 0
  const sign = num < 0 ? '-' : ''
  return `${sign}$${formatCompact(Math.abs(num))}`
}

/** Signed compact USD for P&L, e.g. "+$1.2K" / "-$340". */
export function formatSignedUsd(n) {
  const num = Number(n) || 0
  if (num > 0) return `+${formatUsd(num)}`
  if (num < 0) return `-${formatUsd(Math.abs(num))}`
  return formatUsd(0)
}

/** Win rate (0–1 or null) → "62%" / "—". */
export function formatPercent(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return '—'
  return `${Math.round(Number(rate) * 100)}%`
}

/**
 * Relative "Ns/Nm/Nh/Nd ago" from an epoch-ms timestamp — or `null` when no
 * real timestamp exists. A missing/zero/negative input MUST NOT render as
 * time-since-epoch (the "20645d ago" defect, spec 051 FR-006): callers render
 * an explicit "date unavailable" state on `null`.
 */
export function formatRelativeTime(ts, now = Date.now()) {
  const t = Number(ts)
  if (!Number.isFinite(t) || t <= 0) return null
  const diff = Math.max(0, now - t)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

/** 'win'/'loss'/'neutral' sign cue glyph (non-color accessibility cue). */
export function signGlyph(n) {
  const num = Number(n) || 0
  if (num > 0) return '▲'
  if (num < 0) return '▼'
  return '—'
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Calendar-day bucket label for the activity feed's "group by day" view
 * (spec 074 follow-up). Mirrors `formatRelativeTime`'s honesty rule: a
 * missing/invalid timestamp never gets a fabricated date, it gets its own
 * named bucket instead.
 */
export function dayGroupLabel(ts, now = Date.now()) {
  const t = Number(ts)
  if (!Number.isFinite(t) || t <= 0) return 'Undated'
  const d = new Date(t)
  const diffDays = Math.round((startOfDay(new Date(now)) - startOfDay(d)) / DAY_MS)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

function startOfWeek(date) {
  const offset = (date.getDay() + 6) % 7 // days since Monday
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset).getTime()
}

/** Calendar-week bucket label ("This week" / "Last week" / "Week of ...") for the activity feed. */
export function weekGroupLabel(ts, now = Date.now()) {
  const t = Number(ts)
  if (!Number.isFinite(t) || t <= 0) return 'Undated'
  const start = startOfWeek(new Date(t))
  const diffWeeks = Math.round((startOfWeek(new Date(now)) - start) / (7 * DAY_MS))
  if (diffWeeks === 0) return 'This week'
  if (diffWeeks === 1) return 'Last week'
  const sameYear = new Date(start).getFullYear() === new Date(now).getFullYear()
  return `Week of ${new Date(start).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })}`
}
