/**
 * Statement view model — turns an ActivityReport into the figures, series and
 * rows the statement document prints (issue #1026).
 *
 * One rule runs through all of it: a scoped or sectioned statement must never
 * be readable as a complete one. So scoping RE-DERIVES every total from the
 * entries actually in scope (never re-labels the full report's totals), and
 * anything the figures cannot account for — an entry with no usable date, a
 * class that failed to load, a fee nobody reported — comes back as an explicit
 * count for the document to disclose rather than being dropped.
 *
 * Pure and provider-free: report in, plain data out.
 */

import { computeTotals } from '../reportBuilder'
import { classLabel, isNeutralDirection, isSelfTransfer, PLATFORM_FEE_STATUS } from '../activityClassification'
import { resolveStatementOptions, scopeNote } from './reportTypes'

const DAY = 24 * 60 * 60 * 1000

/** Categorical classes a chart may show before the tail folds into "Other". */
const MAX_CHART_CATEGORIES = 6

// ------------------------------------------------------------------ formatting

const USD = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * `$1,234.50`. Amounts are always rendered through these helpers, never with an
 * ad-hoc template: jsPDF's standard fonts are WinAnsi-encoded, so a typographic
 * minus (U+2212) or an arrow does not render as itself — it comes out as a
 * different character entirely. On a financial document that is not a cosmetic
 * bug, it is a corrupted figure, so every sign here is ASCII by construction.
 */
export function formatUsd(n) {
  const v = Number(n) || 0
  return `$${USD.format(Math.abs(v) < 0.005 ? 0 : Math.abs(v))}`
}

/** Signed money with the sign OUTSIDE the currency symbol: `-$1,204.00`. */
export function formatUsdSigned(n) {
  const v = Number(n) || 0
  if (Math.abs(v) < 0.005) return formatUsd(0)
  return `${v < 0 ? '-' : '+'}${formatUsd(v)}`
}

/**
 * Token amounts keep their significant digits: a statement that rounds 0.000512
 * ETH to 0.00 has printed a false zero. Trailing zeros are trimmed so the
 * common case (whole stablecoin units) stays clean.
 */
export function formatAmount(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  const dp = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8
  return v
    .toFixed(dp)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

/**
 * Token amount for a TABLE column: grouped thousands and a decimal count fixed
 * for the whole column. Trimming trailing zeros per cell — fine for a sentence
 * — puts `5,859.68`, `4,717.5` and `0.85` in one column, where the decimal
 * points no longer line up and magnitude stops being scannable.
 *
 * @param {number} n
 * @param {number} dp decimal places for the column (see decimalsFor)
 */
export function formatTokenAmount(n, dp = 2) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

/**
 * Decimal places that show the smallest non-zero value in a set without
 * printing a false zero: a 0.0004 WETH fee needs more places than a USDC
 * balance, and rounding it to "0.00" would report a movement as nothing.
 */
export function decimalsFor(values) {
  const nonZero = values.map(Number).filter((v) => Number.isFinite(v) && v !== 0).map(Math.abs)
  if (!nonZero.length) return 2
  const smallest = Math.min(...nonZero)
  if (smallest >= 1) return 2
  if (smallest >= 0.01) return 4
  return 6
}

/**
 * `A`, `A and B`, `A, B and C`. The statement names lists of activity types in
 * running prose, and "Earn, Staking could not be read" is not a sentence.
 */
export function formatList(items) {
  const list = items.filter(Boolean).map(String)
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/**
 * A 66-character hash split at a FIXED midpoint. Left to wrap on its own it
 * broke wherever the column ran out, producing ragged unequal lines and — for a
 * bridge, which carries two — a row of double height. Both halves are equal and
 * the break is always in the same place, so two hashes can be compared by eye.
 */
export function splitHash(hash) {
  const value = String(hash || '')
  if (value.length < 40) return value
  const half = Math.ceil(value.length / 2)
  return `${value.slice(0, half)}\n${value.slice(half)}`
}

/** `12 Jun 2026` — unambiguous across locales, unlike a numeric date. */
export function formatDate(ms) {
  if (ms == null) return 'Date unavailable'
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDateTime(ms) {
  if (ms == null) return 'Date unavailable'
  const d = new Date(ms)
  return `${formatDate(ms)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}

// -------------------------------------------------------------------- bucketing

/**
 * Bucket width for the flow chart. Chosen from the period length so a month
 * reads day-by-day and a year reads month-by-month — the same statement layout
 * has to work for both without producing 365 unreadable columns.
 */
export function chooseBucket(fromMs, toMs) {
  const days = Math.max(1, (toMs - fromMs) / DAY)
  if (days <= 32) return 'day'
  if (days <= 130) return 'week'
  if (days <= 800) return 'month'
  return 'quarter'
}

function bucketStart(ms, unit) {
  const d = new Date(ms)
  if (unit === 'day') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  if (unit === 'week') {
    const dow = (d.getUTCDay() + 6) % 7 // Monday-based
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)
  }
  if (unit === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1)
}

function nextBucket(ms, unit) {
  const d = new Date(ms)
  if (unit === 'day') return ms + DAY
  if (unit === 'week') return ms + 7 * DAY
  if (unit === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function bucketLabel(ms, unit) {
  const d = new Date(ms)
  if (unit === 'day') return `${d.getUTCDate()}`
  if (unit === 'week') return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  if (unit === 'month') return MONTHS[d.getUTCMonth()]
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${String(d.getUTCFullYear()).slice(2)}`
}

/** Sub-label carrying the unit the bare tick omits (month for a day axis). */
function bucketSubLabel(ms, unit) {
  const d = new Date(ms)
  if (unit === 'day') return MONTHS[d.getUTCMonth()]
  if (unit === 'month') return String(d.getUTCFullYear())
  return ''
}

/**
 * In/out USD per time bucket across the whole period — including empty ones, so
 * a quiet fortnight reads as a gap rather than being compressed away.
 */
export function buildFlowSeries(items, period) {
  const unit = chooseBucket(period.from, period.to)
  const buckets = []
  const index = new Map()
  for (let t = bucketStart(period.from, unit); t <= period.to; t = nextBucket(t, unit)) {
    index.set(t, buckets.length)
    buckets.push({ start: t, label: bucketLabel(t, unit), subLabel: bucketSubLabel(t, unit), inUsd: 0, outUsd: 0 })
  }
  let undated = 0
  for (const it of items) {
    if (it.timestamp == null) {
      undated += 1
      continue
    }
    const at = index.get(bucketStart(it.timestamp, unit))
    if (at == null) continue
    // Neutral value (a bridge between the member's own networks) is neither a
    // receipt nor a payment, so it is absent from the flow chart by design —
    // plotting it on either side would draw money that never moved in or out.
    if (isNeutralDirection(it.valueDirection ?? null)) continue
    const inward = it.valueDirection != null
      ? it.valueDirection === 'in'
      : it.direction === 'payout' || it.direction === 'refund'
    if (inward) buckets[at].inUsd += it.usdValue || 0
    else buckets[at].outUsd += it.usdValue || 0
  }
  return { unit, buckets, undated }
}

/**
 * Per-asset movement, derived from each entry's own VALUE direction.
 *
 * Deliberately not the report's `byTicker` block: that one is keyed on the
 * wager vocabulary (deposit / payout / refund), so a staking deposit or an LP
 * supply — which carry no such kind — land in none of its columns and an asset
 * reads as "0 in, 0 out" beside a non-zero value. On a statement that is not a
 * rounding difference, it is a row that contradicts itself.
 *
 * Value that is neither in nor out is kept apart: `moved` for a bridge between
 * the member's own networks, `neutral` for everything else neutral (a staking
 * unstake request, a mini-app attribution record). Neither is netted.
 */
export function buildTokenRows(items) {
  const rows = new Map()
  for (const it of items) {
    const ticker = it.tokenTicker || 'Unknown asset'
    const row = rows.get(ticker) || {
      ticker,
      count: 0,
      inAmount: 0, outAmount: 0, movedAmount: 0, neutralAmount: 0,
      inUsd: 0, outUsd: 0, movedUsd: 0, neutralUsd: 0,
      unvalued: 0,
    }
    row.count += 1
    if (it.valuationStatus === 'unvalued') row.unvalued += 1
    const amount = it.amountNumber || 0
    const usd = it.usdValue || 0
    const vd = it.valueDirection ?? null
    if (isNeutralDirection(vd)) {
      if (isSelfTransfer(it)) {
        row.movedAmount += amount
        row.movedUsd += usd
      } else {
        row.neutralAmount += amount
        row.neutralUsd += usd
      }
    } else {
      const inward = vd != null ? vd === 'in' : it.direction === 'payout' || it.direction === 'refund'
      if (inward) {
        row.inAmount += amount
        row.inUsd += usd
      } else {
        row.outAmount += amount
        row.outUsd += usd
      }
    }
    rows.set(ticker, row)
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      netAmount: r.inAmount - r.outAmount,
      netUsd: r.inUsd - r.outUsd,
      // One decimal count per asset, wide enough for that asset's smallest
      // real movement — so a column of amounts aligns on its decimal point.
      decimals: decimalsFor([r.inAmount, r.outAmount, r.movedAmount, r.neutralAmount]),
    }))
    .sort((a, b) => Math.abs(b.netUsd) - Math.abs(a.netUsd) || b.count - a.count)
}

/**
 * Activity-type totals for the breakdown chart, biggest first, with the tail
 * folded into a single "Other" row. Past about six categories adjacent bars
 * stop being distinguishable, and the full list is in the table below anyway.
 */
export function buildActivityBreakdown(byClass, items = [], staleClasses = []) {
  const stale = new Set(staleClasses)
  // `byClass.movedUsd` is EVERY neutral entry, which conflates a bridge between
  // the member's own networks with value that simply moved neither way. The
  // statement reports those in different columns, so the split is re-derived
  // here from the entries rather than taken from a figure that cannot express
  // it. Likewise an unreported platform fee is counted per class: rendered as a
  // dash it is indistinguishable from "no fee charged".
  const extra = {}
  for (const it of items) {
    const key = it.class || 'wager'
    const e = (extra[key] ||= { bridgeUsd: 0, neutralUsd: 0, neutralUnvalued: 0, feeUnknown: 0 })
    if (isNeutralDirection(it.valueDirection ?? null)) {
      if (isSelfTransfer(it)) e.bridgeUsd += it.usdValue || 0
      else if (it.valuationStatus === 'unvalued') e.neutralUnvalued += 1
      else e.neutralUsd += it.usdValue || 0
    }
    if (it.platformFee?.status === PLATFORM_FEE_STATUS.UNKNOWN) e.feeUnknown += 1
  }

  const rows = Object.values(byClass || {})
    .map((c) => ({
      key: c.class,
      // A class the sources could not fully read is marked wherever it appears.
      // A page-one banner alone let a reader reconcile an incomplete row with
      // no signal that it was incomplete.
      label: `${c.label || classLabel(c.class)}${stale.has(c.class) ? ' (partial)' : ''}`,
      partial: stale.has(c.class),
      count: c.count,
      inUsd: c.inUsd,
      outUsd: c.outUsd,
      movedUsd: extra[c.class]?.bridgeUsd || 0,
      neutralUsd: extra[c.class]?.neutralUsd || 0,
      neutralUnvalued: extra[c.class]?.neutralUnvalued || 0,
      platformFeesUsd: c.platformFeesUsd,
      platformFeeUnknownCount: extra[c.class]?.feeUnknown || 0,
      volumeUsd: c.inUsd + c.outUsd + c.movedUsd,
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
  if (rows.length <= MAX_CHART_CATEGORIES) return { rows, chartRows: rows, folded: 0 }

  const head = rows.slice(0, MAX_CHART_CATEGORIES - 1)
  const tail = rows.slice(MAX_CHART_CATEGORIES - 1)
  const other = tail.reduce(
    (acc, r) => ({
      ...acc,
      count: acc.count + r.count,
      inUsd: acc.inUsd + r.inUsd,
      outUsd: acc.outUsd + r.outUsd,
      movedUsd: acc.movedUsd + r.movedUsd,
      neutralUsd: acc.neutralUsd + r.neutralUsd,
      neutralUnvalued: acc.neutralUnvalued + r.neutralUnvalued,
      platformFeesUsd: acc.platformFeesUsd + r.platformFeesUsd,
      platformFeeUnknownCount: acc.platformFeeUnknownCount + r.platformFeeUnknownCount,
      volumeUsd: acc.volumeUsd + r.volumeUsd,
    }),
    {
      key: '__other__', label: `Other (${tail.length} types)`, count: 0,
      inUsd: 0, outUsd: 0, movedUsd: 0, neutralUsd: 0, neutralUnvalued: 0,
      platformFeesUsd: 0, platformFeeUnknownCount: 0, volumeUsd: 0,
    },
  )
  return { rows, chartRows: [...head, other], folded: tail.length }
}

// ---------------------------------------------------------------- the view model

/**
 * @param {object} report   ActivityReport from buildReport
 * @param {object} [options] { type, classes, sections, title } — see reportTypes
 * @returns {object} statement view model
 */
export function buildStatementModel(report, options = {}) {
  const opts = resolveStatementOptions(options)
  const inScope = opts.classes
    ? report.lineItems.filter((it) => opts.classes.includes(it.class || 'wager'))
    : report.lineItems

  const excludedByScope = report.lineItems.length - inScope.length
  // "Not failed" is not the same as "settled": a pending entry has not
  // confirmed. It is still recorded and still counted, but a caption calling
  // the whole set settled asserts a confirmation that has not happened.
  const settled = inScope.filter((it) => it.status !== 'failed')
  const failed = inScope.filter((it) => it.status === 'failed')
  const pendingCount = settled.filter((it) => it.status === 'pending').length

  // Re-derived, never re-labelled: a wagering statement's "net" is the net of
  // wagers, and reusing the account-wide figure under a narrower heading would
  // be a wrong number in a document people reconcile against.
  const totals = opts.classes
    ? computeTotals(inScope, report.totals?.overall?.feesNativeSymbol || '')
    : report.totals

  const byClass = totals.byClass || {}
  const moneyIn = Object.values(byClass).reduce((s, c) => s + c.inUsd, 0)
  const moneyOut = Object.values(byClass).reduce((s, c) => s + c.outUsd, 0)
  const overall = totals.overall

  const undatedCount = settled.filter((it) => it.timestamp == null).length
  const unvaluedCount = settled.filter((it) => it.valuationStatus === 'unvalued').length
  const feeUnknownCount = settled.filter(
    (it) => it.platformFee?.status === PLATFORM_FEE_STATUS.UNKNOWN,
  ).length

  // Two different quantities that the report's `overall.movedUsd` conflates:
  // a bridge is value the member moved between their OWN networks, while an
  // unstake request is simply value that is neither a receipt nor a payment.
  // Labelling the second as the first would tell a member they bridged money
  // they never bridged, so the statement counts them separately.
  const bridges = settled.filter((it) => isSelfTransfer(it))
  const movedUsd = bridges
    .filter((it) => it.valuationStatus !== 'unvalued')
    .reduce((s, it) => s + (it.usdValue || 0), 0)
  const movedUnvalued = bridges.filter((it) => it.valuationStatus === 'unvalued').length
  const neutralOther = settled.filter(
    (it) => isNeutralDirection(it.valueDirection ?? null) && !isSelfTransfer(it),
  )
  const neutralOtherUsd = neutralOther.reduce((s, it) => s + (it.usdValue || 0), 0)
  const neutralOtherUnvalued = neutralOther.filter((it) => it.valuationStatus === 'unvalued').length

  // computeTotals skips failed entries wholesale, so their gas never reaches
  // `overall.feesNative`. But a transaction that reverts still burns gas — that
  // is real money out of the member's wallet, and a fee total that omits it
  // under-reports what the period cost them.
  const failedFeesNative = failed.reduce(
    (s, it) => s + (typeof it.feeNative === 'number' ? it.feeNative : 0),
    0,
  )

  const tokens = buildTokenRows(settled)
  // Shared by the register so one asset reads with one precision document-wide.
  const amountDecimals = Object.fromEntries(tokens.map((t) => [t.ticker, t.decimals]))
  const breakdown = buildActivityBreakdown(byClass, settled, report.staleClasses || [])
  const flow = buildFlowSeries(settled, report.period)

  return {
    // ---- identity ----
    type: opts.type,
    title: opts.title,
    sections: opts.sections,
    scopeClasses: opts.classes,
    scopeNote: scopeNote(opts.classes),
    excludedByScope,

    account: report.account,
    chainId: report.chainId,
    networkName: report.networkName,
    isTestnet: report.isTestnet,
    period: report.period,
    generatedAt: report.generatedAt,

    // ---- figures ----
    summary: {
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut,
      movedUsd,
      movedCount: bridges.length,
      movedUnvalued,
      neutralOtherUsd,
      neutralOtherCount: neutralOther.length,
      neutralOtherUnvalued,
      entryCount: settled.length,
      pendingCount,
      recordedCount: inScope.length,
      failedCount: failed.length,
      networkFees: (overall.feesNative || 0) + failedFeesNative,
      networkFeesFailed: failedFeesNative,
      networkFeeSymbol: overall.feesNativeSymbol || '',
      platformFeesUsd: overall.platformFeesUsd || 0,
      platformFeeUnknownCount: feeUnknownCount,
      undatedCount,
      unvaluedCount,
    },

    tokens,
    amountDecimals,
    activity: breakdown,
    flow,

    settled,
    failed,

    // ---- disclosures the document is obliged to print ----
    staleClasses: report.staleClasses || [],
    // The raw class ids are internal vocabulary; a member reads "Earn",
    // not "earn", everywhere else on the document.
    staleClassLabels: (report.staleClasses || []).map((c) => classLabel(c)),
    prunedBefore: report.prunedBefore ?? null,
    valuationNote: report.valuationNote,
    selfTransferNote: report.selfTransferNote,
    disclaimer: report.disclaimer,
  }
}
