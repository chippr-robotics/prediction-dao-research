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
