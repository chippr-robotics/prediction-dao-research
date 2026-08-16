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

/** Ledger entries (class 'wager', not failed) → dashboard transfer rows.
 * Rows keep their chainId (spec 092): wager #12 exists independently on two
 * chains, so every id-keyed lookup downstream is scoped by chain. */
export function wagerTransfersFromLedger(entries = []) {
  const out = []
  for (const e of entries) {
    if (e.class !== 'wager') continue
    if (e.status === 'failed') continue
    out.push({
      chainId: e.chainId ?? null,
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
 * chainId → (wagerId → title), from wager records that carry their chainId
 * (spec 092). A title lookup never crosses chains: wager #12 on Polygon and
 * wager #12 on Mordor are different wagers with different messages.
 */
export function wagerTitlesByChain(wagers = []) {
  const byChain = new Map()
  for (const w of wagers) {
    if (w?.id == null || w.chainId == null) continue
    const title = getMarketDisplayTitle(w)
    if (!title) continue
    const chainId = Number(w.chainId)
    if (!byChain.has(chainId)) byChain.set(chainId, new Map())
    byChain.get(chainId).set(String(w.id), title)
  }
  return byChain
}

/**
 * Annotate wager-class ledger entries with the wager's message (`wagerTitle`)
 * so the activity feed can say WHICH wager a deposit/payout/refund belongs to.
 * Accepts either a flat Map (single-chain callers/tests) or the per-chain
 * Map-of-Maps from `wagerTitlesByChain` — with the nested form an entry only
 * ever resolves against its OWN chain's titles. Non-wager entries and entries
 * without a known title pass through untouched; entries are copied, never
 * mutated (the ledger array is shared state).
 */
export function annotateWagerEntries(entries = [], titles = new Map()) {
  // Duck-typed: a Map whose first value is itself a Map is the per-chain form.
  const nested = titles.values().next().value instanceof Map
  const titlesFor = (e) => (nested ? titles.get(Number(e.chainId)) || new Map() : titles)
  return entries.map((e) => {
    if (e.class !== 'wager') return e
    const title = titlesFor(e).get(String(e.refs?.wagerId ?? ''))
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
