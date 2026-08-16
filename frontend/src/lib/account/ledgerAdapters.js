/**
 * Adapters between the unified activity ledger (spec 051) and the Account
 * dashboard's pure helpers (spec 020).
 *
 * The dashboard's P&L/summary/breakdown math consumes the "valued transfer"
 * shape ({ wagerId, direction: deposit|payout|refund, usdValue, … }). The
 * ledger is now the single source of those rows (FR-015): this adapter maps
 * wager-class ledger entries into that shape, EXCLUDING failed entries so
 * they can never contribute to a total (FR-003) — they remain visible in the
 * activity record itself.
 */
import { getMarketDisplayTitle } from '../wagers/displayTitle'

/** Ledger entries (class 'wager', not failed) → dashboard transfer rows. */
export function wagerTransfersFromLedger(entries = []) {
  const out = []
  for (const e of entries) {
    if (e.class !== 'wager') continue
    if (e.status === 'failed') continue
    out.push({
      wagerId: String(e.refs?.wagerId ?? ''),
      direction: e.kind, // deposit | payout | refund
      tokenAddress: e.tokenAddress || '',
      ticker: e.tokenSymbol || '',
      decimals: e.tokenDecimals ?? null,
      amount: e.amount ?? 0,
      usdValue: e.valueUsd ?? 0, // unvalued entries contribute 0, flagged in UI
      timestamp: e.timestamp, // may be null — series filters non-finite times
      txHash: e.txHash || '',
    })
  }
  return out
}

/**
 * wagerId → display title (the wager's message) from the member's wager
 * records — the same title My Wagers renders, so the activity feed and the
 * wager list can never name the same wager differently. Records without a
 * usable id are skipped; the feed falls back to "Wager #id".
 */
export function wagerTitlesById(wagers = []) {
  const titles = new Map()
  for (const w of wagers) {
    if (w?.id == null) continue
    const title = getMarketDisplayTitle(w)
    if (title) titles.set(String(w.id), title)
  }
  return titles
}

/**
 * Annotate wager-class ledger entries with the wager's message (`wagerTitle`)
 * so the activity feed can say WHICH wager a deposit/payout/refund belongs to.
 * Non-wager entries and entries without a known title pass through untouched;
 * entries are copied, never mutated (the ledger array is shared state).
 */
export function annotateWagerEntries(entries = [], titles = new Map()) {
  return entries.map((e) => {
    if (e.class !== 'wager') return e
    const title = titles.get(String(e.refs?.wagerId ?? ''))
    return title ? { ...e, wagerTitle: title } : e
  })
}

/** tokenMetaByAddress map (breakdowns) from ledger entries. */
export function tokenMetaFromLedger(entries = []) {
  const meta = {}
  for (const e of entries) {
    if (!e.tokenAddress) continue
    const key = String(e.tokenAddress).toLowerCase()
    if (!meta[key]) meta[key] = { ticker: e.tokenSymbol || '', decimals: e.tokenDecimals ?? 18, address: key }
  }
  return meta
}
