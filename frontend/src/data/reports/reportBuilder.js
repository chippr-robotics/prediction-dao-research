/**
 * Report builder — orchestrates production of an ActivityReport for a user +
 * period on the active network (spec 016-wager-tax-report;
 * contracts/report-builder.md).
 *
 * Pipeline: enumerate the user's wagers → derive transfers from lifecycle
 * events → enrich with txHash/timestamp/fee from receipts → filter to the
 * period → value at the $1.00 par baseline → compute reconciling totals.
 *
 * All chain/index I/O is behind the injected `dataSource` so the orchestration
 * is deterministic and unit-testable. Deterministic for a fixed
 * (account, chainId, period) against immutable chain data (FR-010).
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

/** Sum line items into per-ticker + overall totals (must reconcile, SC-004). */
function computeTotals(lineItems, nativeSymbol) {
  const byTicker = {}
  let overallUsd = 0
  let overallFees = 0
  for (const it of lineItems) {
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
    },
  }
}

/**
 * @param {object} params
 * @param {string} params.account
 * @param {number} params.chainId
 * @param {{kind,from,to,label}} params.period - resolved + validated
 * @param {object} params.dataSource - { enumerateWagers, getWagerEvents, getBlock, getTransactionReceipt }
 * @param {object} params.networkMeta - getNetwork(chainId) result
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
  tokenResolver,
  onProgress = () => {},
  generatedAt = Date.now(),
}) {
  const nativeSymbol = networkMeta?.nativeCurrency?.symbol || 'NATIVE'
  const registryAddress = networkMeta?.contracts?.wagerRegistry || networkMeta?.wagerRegistry
  const resolveToken = tokenResolver || ((addr) => resolveTokenMeta(addr, chainId))

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
