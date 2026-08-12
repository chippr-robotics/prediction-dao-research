/**
 * Perps formatters (spec 082) — every function here is TOTAL (null/undefined/NaN in → '—' out),
 * because they run during render where a throw takes the whole panel down (the lib/earn/format.js
 * convention). Missing venue data renders as '—', never a fabricated 0 (FR-005).
 */

const DASH = '—'

/** Price with sensible precision across magnitudes (63,412.5 vs 0.06941). */
export function formatPairPrice(price) {
  if (price == null || !Number.isFinite(Number(price)) || Number(price) <= 0) return DASH
  const n = Number(price)
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (n >= 100) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Forex/mid-priced pairs live in the 4th decimal (EUR/USD 1.0841) — 2dp would erase the quote.
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 5 })
}

/**
 * Hourly funding rate as a signed percentage with the interval explicit — e.g. '+0.0013%/1h'.
 * Funding magnitudes live in fractions of a basis point, so four decimals is the honest floor.
 */
export function formatFundingRate(rate, intervalHours = 1) {
  if (rate == null || !Number.isFinite(Number(rate))) return DASH
  const pct = formatFundingPct(rate)
  return pct === DASH ? DASH : `${pct}/${intervalHours}h`
}

/** The bare signed funding percentage ('+0.0013%') — for table cells whose HEADER names the interval. */
export function formatFundingPct(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return DASH
  const pct = Number(rate) * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(4)}%`
}

/** Annualized view of an hourly funding rate for the detail tooltip — e.g. '+11.4%/yr'. */
export function formatFundingAnnualized(rate, intervalHours = 1) {
  if (rate == null || !Number.isFinite(Number(rate)) || !intervalHours) return DASH
  const pct = ((Number(rate) * (24 / intervalHours) * 365)) * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%/yr`
}

/** Compact USD ($182.4M / $45.2K / $912). */
export function formatUsdCompact(usd) {
  if (usd == null || !Number.isFinite(Number(usd)) || Number(usd) < 0) return DASH
  const n = Number(usd)
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

/** Exact USD for position rows ($1,234.56). */
export function formatUsd(usd) {
  if (usd == null || !Number.isFinite(Number(usd))) return DASH
  return Number(usd).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** Signed USD for PnL (+$120.50 / −$34.12) — sign always explicit. */
export function formatSignedUsd(usd) {
  if (usd == null || !Number.isFinite(Number(usd))) return DASH
  const n = Number(usd)
  const abs = Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return n < 0 ? `−${abs}` : `+${abs}`
}

/** Max leverage as '150×'. */
export function formatLeverage(lev) {
  if (lev == null || !Number.isFinite(Number(lev)) || Number(lev) <= 0) return DASH
  const n = Number(lev)
  return `${n % 1 === 0 ? n : n.toFixed(1)}×`
}

/** Basis points as a percentage ('5 bps' → '0.05%'); 0 formats (fee lines hide separately). */
export function bpsToPct(bps) {
  if (bps == null || !Number.isFinite(Number(bps)) || Number(bps) < 0) return DASH
  return `${(Number(bps) / 100).toFixed(2)}%`
}
