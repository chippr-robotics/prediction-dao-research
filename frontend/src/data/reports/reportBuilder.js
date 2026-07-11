/**
 * Report builder — orchestrates production of an ActivityReport for a user +
 * period on the active network (spec 016-wager-tax-report;
 * contracts/report-builder.md; extended by spec 051 to read the unified
 * activity ledger).
 *
 * Primary pipeline (spec 051): query the SAME activity ledger the Account tab
 * renders — all activity classes, one read path — filter to the period, and
 * enrich entries that reached the chain with the gas fee from their receipt.
 * Because dashboard and report consume identical entries, their line items
 * and totals can never disagree (FR-014/FR-015).
 *
 * Legacy pipeline (no `ledger` injected): enumerate the user's wagers →
 * derive transfers from lifecycle events → enrich from receipts → value at
 * the $1.00 par baseline. Kept for callers/tests that predate the ledger.
 *
 * All chain/index I/O is behind the injected `dataSource`/`ledger` so the
 * orchestration is deterministic and unit-testable (FR-010).
 */

import { formatUnits } from 'ethers'
import { deriveTransfers } from './transferDerivation'
import { enrichTransfers } from './receiptEnrichment'
import { valueTransfer, PAR_VALUATION_NOTE } from './valuation'
import { resolveTokenMeta } from './tokenMeta'

export const REPORT_DISCLAIMER =
  'This is an informational record of your on-chain wager activity, not tax advice. ' +
  'The platform does not compute tax owed. Consult a qualified professional.'

function eq(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase()
}

function isParty(wager, account) {
  if (eq(wager.creator, account)) return true
  return (wager.participants || []).some((p) => eq(p, account))
}

/** Sum line items into per-ticker + overall totals (must reconcile, SC-004).
 *  Failed entries are listed but NEVER totaled (spec 051 FR-003). */
function computeTotals(lineItems, nativeSymbol) {
  const byTicker = {}
  let overallUsd = 0
  let overallFees = 0
  let failedCount = 0
  for (const it of lineItems) {
    if (it.status === 'failed') {
      failedCount += 1
      continue
    }
    const t = (byTicker[it.tokenTicker] ||= {
      ticker: it.tokenTicker, deposits: 0, payouts: 0, refunds: 0, usdValue: 0, count: 0,
    })
    if (it.direction === 'deposit') t.deposits += it.amountNumber
    else if (it.direction === 'payout') t.payouts += it.amountNumber
    else if (it.direction === 'refund') t.refunds += it.amountNumber
    t.usdValue += it.usdValue
    t.count += 1
    overallUsd += it.usdValue
    if (typeof it.feeNative === 'number') overallFees += it.feeNative
  }
  for (const t of Object.values(byTicker)) {
    t.net = t.payouts + t.refunds - t.deposits
  }
  return {
    byTicker,
    overall: {
      usdValue: overallUsd,
      feesNative: overallFees,
      feesNativeSymbol: nativeSymbol,
      count: lineItems.length,
      failedCount,
    },
  }
}

/** Real 66-char tx hash — the only kind a receipt can be fetched for. */
function isRealTxHash(h) {
  return typeof h === 'string' && h.length === 66
}

/** Ledger kinds that map onto the legacy wager direction vocabulary. */
const WAGER_DIRECTIONS = new Set(['deposit', 'payout', 'refund'])

/**
 * Map one ledger entry to a report line item (contracts/ledger-entry.md CSV
 * mapping). Keeps the legacy wager fields so per-ticker totals reconcile.
 */
function ledgerEntryToLineItem(entry, { feeNative, feeNativeSymbol, feeUnavailableReason }) {
  const amountNumber = Number(entry.amount) || 0
  return {
    entryId: entry.entryId,
    class: entry.class,
    kind: entry.kind,
    // Legacy direction for wager math; other classes carry their kind.
    direction: WAGER_DIRECTIONS.has(entry.kind) ? entry.kind : entry.kind,
    status: entry.status,
    failureReason: entry.failureReason ?? null,
    timestamp: entry.timestamp, // may be null — flagged, sorted last (FR-006)
    tokenTicker: entry.tokenSymbol || '',
    tokenDecimals: entry.tokenDecimals ?? null,
    tokenAddress: entry.tokenAddress,
    amount: entry.amount != null ? String(entry.amount) : '',
    amountNumber,
    usdValue: entry.valueUsd ?? 0,
    costBasis: entry.valueUsd ?? 0,
    valuationStatus: entry.valuationStatus,
    valuationSource: entry.valuationStatus === 'valued' ? 'ledger' : null,
    feeNative,
    feeNativeSymbol,
    feeUnavailableReason,
    txHash: entry.txHash || '',
    fromAddress: entry.direction === 'in' ? entry.counterparty || '' : entry.account,
    toAddress: entry.direction === 'in' ? entry.account : entry.counterparty || '',
    wagerId: entry.refs?.wagerId ?? '',
  }
}

/**
 * @param {object} params
 * @param {string} params.account
 * @param {number} params.chainId
 * @param {{kind,from,to,label}} params.period - resolved + validated
 * @param {object} params.dataSource - { enumerateWagers, getWagerEvents, getBlock, getTransactionReceipt }
 * @param {object} params.networkMeta - getNetwork(chainId) result
 * @param {object} [params.ledger] - spec-051 ledger repository ({ listEntries }); when present the
 *                                   report enumerates the SAME entries the Account tab renders
 * @param {function} [params.tokenResolver] - (address, chainId) => Promise<{ticker,decimals}>
 * @param {function} [params.onProgress] - (fraction, label) => void
 * @param {number} [params.generatedAt] - epoch ms (defaults to now)
 * @returns {Promise<object>} ActivityReport
 */
export async function buildReport({
  account,
  chainId,
  period,
  dataSource,
  networkMeta,
  ledger,
  tokenResolver,
  onProgress = () => {},
  generatedAt = Date.now(),
}) {
  const nativeSymbol = networkMeta?.nativeCurrency?.symbol || 'NATIVE'
  const registryAddress = networkMeta?.contracts?.wagerRegistry || networkMeta?.wagerRegistry
  const resolveToken = tokenResolver || ((addr) => resolveTokenMeta(addr, chainId))

  // ---- Spec 051 primary path: the unified activity ledger ----
  if (ledger && typeof ledger.listEntries === 'function') {
    onProgress(0.05, 'Loading your activity ledger…')
    const { entries, staleClasses, prunedBefore } = await ledger.listEntries({
      account,
      chainId,
      period: { fromMs: period.from, toMs: period.to },
    })

    onProgress(0.5, 'Fetching transaction fees…')
    const receiptCache = new Map()
    const getReceipt = async (h) => {
      if (!receiptCache.has(h)) receiptCache.set(h, await dataSource.getTransactionReceipt(h))
      return receiptCache.get(h)
    }

    const lineItems = []
    for (const entry of entries) {
      let feeNative = null
      let feeUnavailableReason = null
      if (isRealTxHash(entry.txHash) && typeof dataSource?.getTransactionReceipt === 'function') {
        try {
          const receipt = await getReceipt(entry.txHash)
          if (receipt && String(receipt.from).toLowerCase() === String(account).toLowerCase()) {
            const gasUsed = receipt.gasUsed
            const price = receipt.effectiveGasPrice ?? receipt.gasPrice
            feeNative = gasUsed != null && price != null ? Number(BigInt(gasUsed) * BigInt(price)) / 1e18 : null
            if (feeNative == null) feeUnavailableReason = 'Fee data unavailable for this transaction.'
          } else {
            feeUnavailableReason = 'Not sent by you — no gas fee paid.'
          }
        } catch {
          feeUnavailableReason = 'Fee data unavailable for this transaction.'
        }
      } else {
        feeUnavailableReason =
          entry.status === 'failed' ? 'Never reached the chain — no fee.' : 'No transaction reference.'
      }
      lineItems.push(ledgerEntryToLineItem(entry, { feeNative, feeNativeSymbol: nativeSymbol, feeUnavailableReason }))
    }

    // Chronological, entries with no real timestamp last (contract G2/FR-006).
    lineItems.sort((a, b) => {
      if (a.timestamp != null && b.timestamp != null) return a.timestamp - b.timestamp
      if (a.timestamp != null) return -1
      if (b.timestamp != null) return 1
      return 0
    })
    onProgress(1, 'Done')

    return {
      account,
      chainId: Number(chainId),
      networkName: networkMeta?.name || `Chain ${chainId}`,
      isTestnet: Boolean(networkMeta?.isTestnet),
      period,
      generatedAt,
      source: 'ledger',
      lineItems,
      totals: computeTotals(lineItems, nativeSymbol),
      staleClasses,
      prunedBefore,
      valuationNote: PAR_VALUATION_NOTE,
      disclaimer: REPORT_DISCLAIMER,
    }
  }

  onProgress(0.05, 'Loading your wager activity…')

  // Primary path (spec 017): one indexed query returns every transfer with its
  // txHash/timestamp/from/to — NO per-wager log scans. Falls back to the bounded
  // enumerate + scan path (#703) only when the index has no WagerTransfer data
  // (older index, or none configured for this network — FR-016).
  let preItems = null
  if (typeof dataSource.listTransfers === 'function') {
    try {
      preItems = await dataSource.listTransfers({ account })
    } catch (err) {
      console.warn('[reportBuilder] listTransfers unavailable, falling back to bounded scan:', err?.message)
      preItems = null
    }
  }

  if (preItems == null) {
    const wagers = (await dataSource.enumerateWagers({ account })).filter((w) => isParty(w, account))
    preItems = []
    for (let i = 0; i < wagers.length; i++) {
      const wager = wagers[i]
      const events = await dataSource.getWagerEvents(wager.id)
      preItems.push(...deriveTransfers({ wager, events, userAddress: account, registryAddress }))
      onProgress(0.05 + 0.5 * ((i + 1) / Math.max(wagers.length, 1)), 'Reading wager activity…')
    }
  }

  onProgress(0.6, 'Fetching transaction details…')
  const enriched = await enrichTransfers(preItems, { reader: dataSource, userAddress: account, nativeSymbol })

  // Filter to the inclusive reporting period (FR-003).
  const inPeriod = enriched.filter(
    (it) => it.timestamp != null && it.timestamp >= period.from && it.timestamp <= period.to,
  )

  onProgress(0.8, 'Valuing transfers…')
  const lineItems = []
  for (const it of inPeriod) {
    const meta = await resolveToken(it.tokenAddress, chainId)
    const amount = formatUnits(BigInt(it.amountRaw), meta.decimals)
    const amountNumber = Number(amount)
    const valued = valueTransfer(amountNumber)
    lineItems.push({
      wagerId: it.wagerId,
      direction: it.direction,
      timestamp: it.timestamp,
      tokenTicker: meta.ticker,
      tokenDecimals: meta.decimals,
      tokenAddress: it.tokenAddress,
      amount,
      amountNumber,
      usdValue: valued.usdValue,
      costBasis: valued.costBasis,
      valuationSource: valued.valuationSource,
      feeNative: it.feeNative,
      feeNativeSymbol: it.feeNativeSymbol,
      feeUnavailableReason: it.feeUnavailableReason,
      txHash: it.txHash,
      fromAddress: it.fromAddress,
      toAddress: it.toAddress,
    })
  }

  lineItems.sort((a, b) => a.timestamp - b.timestamp)
  onProgress(1, 'Done')

  return {
    account,
    chainId: Number(chainId),
    networkName: networkMeta?.name || `Chain ${chainId}`,
    isTestnet: Boolean(networkMeta?.isTestnet),
    period,
    generatedAt,
    lineItems,
    totals: computeTotals(lineItems, nativeSymbol),
    valuationNote: PAR_VALUATION_NOTE,
    disclaimer: REPORT_DISCLAIMER,
  }
}
