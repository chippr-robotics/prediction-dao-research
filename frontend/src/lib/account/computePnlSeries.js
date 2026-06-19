/**
 * computePnlSeries — build the cumulative realized-net-P&L time series for the
 * hero chart (spec 020, data-model.md PnlSeries). Pure & deterministic.
 *
 * Input transfers are the member's valued, SETTLED-wager transfers (deposit /
 * payout / refund), so the running total is realized P&L and the ALL-range end
 * value equals AccountSummary.netPnlUsd.
 *
 *  - Cumulative value at a point = Σ(+payout +refund −deposit) up to and
 *    including that point, across the member's whole history.
 *  - A windowed range (7D/30D/90D) seeds its first rendered point with the
 *    cumulative value as of the range start, so the line is continuous rather
 *    than reset to 0.
 *  - Dense histories collapse to one point per UTC day (last value) once the
 *    in-range point count would exceed BUCKET_THRESHOLD.
 */

export const RANGES = Object.freeze(['7D', '30D', '90D', 'ALL'])
export const DEFAULT_RANGE = '30D'
export const BUCKET_THRESHOLD = 180

const RANGE_DAYS = { '7D': 7, '30D': 30, '90D': 90 }
const DAY_MS = 24 * 60 * 60 * 1000

function signedDelta(t) {
  const usd = Number(t.usdValue) || 0
  if (t.direction === 'payout' || t.direction === 'refund') return usd
  if (t.direction === 'deposit') return -usd
  return 0
}

function rangeStart(range, now) {
  const days = RANGE_DAYS[range]
  if (!days) return -Infinity // ALL
  return now - days * DAY_MS
}

/**
 * @param {Array} transfers - valued, settled-wager transfers
 * @param {'7D'|'30D'|'90D'|'ALL'} range
 * @param {number} now - epoch ms (injectable for tests)
 * @returns {import('./types').PnlSeries}
 */
export function computePnlSeries(transfers = [], range = DEFAULT_RANGE, now = Date.now()) {
  const safeRange = RANGES.includes(range) ? range : DEFAULT_RANGE
  const sorted = [...transfers]
    .filter((t) => Number.isFinite(Number(t.timestamp)))
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))

  if (sorted.length === 0) {
    return { range: safeRange, points: [], isEmpty: true, isLowData: true, endValueUsd: 0 }
  }

  const start = rangeStart(safeRange, now)

  // Walk the full history so the cumulative total is correct; capture points
  // that fall within the range, seeding the first in-range point with the
  // pre-range cumulative value.
  let cumulative = 0
  let seed = 0
  const inRange = []
  for (const t of sorted) {
    const ts = Number(t.timestamp)
    const delta = signedDelta(t)
    cumulative += delta
    if (ts < start) {
      seed = cumulative
      continue
    }
    inRange.push({
      timestamp: ts,
      cumulativeUsd: cumulative,
      deltaUsd: delta,
      kind: t.direction || 'bucket',
    })
  }

  const endValueUsd = cumulative

  // If the window excludes all events but history exists, show a flat seed line.
  let points = inRange
  if (points.length === 0) {
    points = [{ timestamp: Math.max(start, Number(sorted[0].timestamp)), cumulativeUsd: seed, deltaUsd: 0, kind: 'bucket' }]
    return { range: safeRange, points, isEmpty: false, isLowData: true, endValueUsd }
  }

  // Daily bucketing guard for dense ranges.
  if (points.length > BUCKET_THRESHOLD) {
    const byDay = new Map()
    for (const p of points) {
      const day = Math.floor(p.timestamp / DAY_MS)
      byDay.set(day, { timestamp: day * DAY_MS, cumulativeUsd: p.cumulativeUsd, deltaUsd: p.deltaUsd, kind: 'bucket' })
    }
    points = [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp)
  }

  return {
    range: safeRange,
    points,
    isEmpty: false,
    isLowData: points.length < 2,
    endValueUsd,
  }
}
