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
