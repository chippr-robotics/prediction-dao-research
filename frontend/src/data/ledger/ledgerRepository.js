/**
 * ledgerRepository — assembly of the unified activity ledger (spec 051).
 *
 * Aggregates LedgerSource adapters (contracts/ledger-source.md) into one
 * normalized, deduplicated, enriched, sorted entry stream per (account,
 * chainId). Per-source degradation: a failing source marks its class stale
 * (`staleClasses`) instead of failing the ledger — the UI discloses staleness
 * honestly (constitution III) rather than blanking or fabricating.
 *
 * Failed entries are INCLUDED here; excluding them from financial totals is
 * the summary helpers' job (FR-003), not the repository's.
 */
import { formatUnits } from 'ethers'
import { getNetwork } from '../../config/networks'
import { resolveTokenMeta } from '../reports/tokenMeta'
import { valueTransfer } from '../reports/valuation'
import { normalizeEntry } from './normalize'
import { mergeEntries } from './identity'
import { VALUATION_STATUS } from './constants'

/**
 * Default enrichment: token meta (symbol/decimals), human amount, and USD
 * valuation. Stablecoins value at the par baseline (spec 016 policy); entries
 * that arrive pre-valued (captured at activity time) keep their value; every
 * other asset is honestly flagged `unvalued` — never zeroed (FR-016).
 */
export async function defaultEnrich(entries, { chainId, fetchOnChain } = {}) {
  const net = getNetwork(Number(chainId))
  const stableAddress = String(net?.stablecoin?.address || '').toLowerCase()
  const out = []
  for (const e of entries) {
    let tokenSymbol = e.tokenSymbol
    let tokenDecimals = e.tokenDecimals
    let amount = e.amount

    if (e.tokenAddress) {
      const meta = await resolveTokenMeta(e.tokenAddress, chainId, { fetchOnChain })
      tokenSymbol = tokenSymbol || meta.ticker
      tokenDecimals = tokenDecimals ?? meta.decimals
    } else {
      tokenSymbol = tokenSymbol || net?.nativeCurrency?.symbol || 'NATIVE'
      tokenDecimals = tokenDecimals ?? 18
    }

    if (amount == null && e.amountRaw != null) {
      try {
        amount = Number(formatUnits(BigInt(e.amountRaw), tokenDecimals))
      } catch {
        amount = null
      }
    }

    let valueUsd = e.valueUsd
    let valuationStatus = e.valuationStatus
    if (valuationStatus == null) {
      if (valueUsd != null && Number.isFinite(Number(valueUsd))) {
        valuationStatus = VALUATION_STATUS.VALUED
      } else if (e.tokenAddress && e.tokenAddress === stableAddress && amount != null) {
        valueUsd = valueTransfer(amount).usdValue
        valuationStatus = VALUATION_STATUS.VALUED
      } else {
        valueUsd = null
        valuationStatus = VALUATION_STATUS.UNVALUED
      }
    }

    out.push({ ...e, tokenSymbol, tokenDecimals, amount, valueUsd, valuationStatus })
  }
  return out
}

function matchesFilter(entry, filter) {
  if (!filter) return true
  if (filter.classes?.length && !filter.classes.includes(entry.class)) return false
  if (filter.statuses?.length && !filter.statuses.includes(entry.status)) return false
  if (filter.kinds?.length && !filter.kinds.includes(entry.kind)) return false
  return true
}

function inPeriod(entry, period) {
  if (!period) return true
  // Entries without a real timestamp cannot be placed in a period; keeping
  // them out of period-scoped views is the honest choice — the full ledger
  // (no period) always lists them.
  if (entry.timestamp == null) return false
  if (period.fromMs != null && entry.timestamp < period.fromMs) return false
  if (period.toMs != null && entry.timestamp > period.toMs) return false
  return true
}

/** Newest first; entries with no real timestamp sort after all dated ones. */
function compareEntries(a, b) {
  const at = a.timestamp
  const bt = b.timestamp
  if (at != null && bt != null) return bt - at
  if (at != null) return -1
  if (bt != null) return 1
  return (b.recordedAt || 0) - (a.recordedAt || 0)
}

/**
 * @param {object} deps
 * @param {Array}  deps.sources - LedgerSource adapters
 * @param {Function} [deps.enrich] - (entries, {chainId}) => enriched entries
 * @param {Function} [deps.getPrunedBefore] - ({account, chainId}) => epoch ms | null (FR-013 disclosure)
 */
export function createLedgerRepository({ sources = [], enrich = defaultEnrich, getPrunedBefore } = {}) {
  /**
   * @param {object} q - { account, chainId, filter?, period?, provider?, signal? }
   * @returns {Promise<{entries: Array, staleClasses: string[], prunedBefore: number|null}>}
   */
  async function listEntries(q) {
    const ctx = { account: String(q.account || '').toLowerCase(), chainId: Number(q.chainId) }
    const staleClasses = []
    const settled = await Promise.allSettled(
      sources.map(async (src) => {
        const items = await src.list({ ...ctx, provider: q.provider, signal: q.signal })
        // Normalize inside the per-source boundary so one bad source degrades
        // to stale instead of poisoning the whole ledger.
        return items.map((item) => normalizeEntry(item, ctx))
      }),
    )

    const collected = []
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') collected.push(...res.value)
      else staleClasses.push(sources[i].class)
    })

    const merged = mergeEntries(collected)
    const enriched = await enrich(merged, { chainId: ctx.chainId, provider: q.provider })
    const filtered = enriched.filter((e) => matchesFilter(e, q.filter) && inPeriod(e, q.period))
    filtered.sort(compareEntries)

    return {
      entries: filtered,
      staleClasses,
      prunedBefore: typeof getPrunedBefore === 'function' ? getPrunedBefore(ctx) ?? null : null,
    }
  }

  return { listEntries }
}
