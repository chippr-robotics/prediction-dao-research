/**
 * computeSummary — derive the Account dashboard's headline tile values
 * (spec 020, data-model.md AccountSummary). Pure & deterministic.
 *
 * Definitions follow the recorded clarifications:
 *  - Net P&L (USD): REALIZED only — Σ(payout+refund) − Σ(deposit) over the
 *    member's *settled* wagers. Active stakes are excluded and surfaced
 *    separately as `atStakeUsd`. (Clarification 1)
 *  - Win Rate: wins ÷ (wins + losses); draws/refunds/cancellations excluded.
 *    Returns null when the denominator is 0. (Clarification 2)
 *  - Total Wagered (USD): the member's OWN stake only — the sum of their
 *    deposit transfers (user → escrow), which equal their own stakes.
 *    (Clarification 3)
 *
 * @param {object} params
 * @param {Array}  params.wagers   - rich wagers (status, winner, creator, opponent, …)
 * @param {Array}  params.transfers - valued transfers ({ wagerId, direction, usdValue, … })
 * @param {string} params.address  - the member's wallet address
 * @param {number} params.walletBalanceUsd - USD value of current wallet balances
 * @param {Array}  [params.walletBalances] - per-token balance rows (passthrough)
 * @returns {import('./types').AccountSummary}
 */
import { classifyOutcome, isActiveStatus, isSettledStatus, normalizeStatus } from './status'

export function computeSummary({
  wagers = [],
  transfers = [],
  address,
  walletBalanceUsd = 0,
  walletBalances = [],
} = {}) {
  const statusById = new Map()
  for (const w of wagers) statusById.set(String(w.id), normalizeStatus(w.status))

  let wins = 0
  let losses = 0
  let activeWagers = 0
  for (const w of wagers) {
    if (isActiveStatus(w.status)) activeWagers += 1
    const outcome = classifyOutcome(w, address)
    if (outcome === 'win') wins += 1
    else if (outcome === 'loss') losses += 1
  }

  const decided = wins + losses
  const winRate = decided > 0 ? wins / decided : null

  // Money flows from the valued transfer stream.
  let depositUsdAll = 0
  let atStakeUsd = 0
  let realizedIn = 0 // payouts + refunds on settled wagers
  let realizedOut = 0 // deposits on settled wagers
  for (const t of transfers) {
    const usd = Number(t.usdValue) || 0
    const status = statusById.get(String(t.wagerId))
    const settled = isSettledStatus(status)
    if (t.direction === 'deposit') {
      depositUsdAll += usd
      if (!settled) atStakeUsd += usd
      else realizedOut += usd
    } else if (t.direction === 'payout' || t.direction === 'refund') {
      if (settled) realizedIn += usd
    }
  }

  const netPnlUsd = realizedIn - realizedOut
  const totalWageredUsd = depositUsdAll

  return {
    netPnlUsd,
    winRate,
    wins,
    losses,
    totalWageredUsd,
    activeWagers,
    atStakeUsd,
    walletBalanceUsd: Number(walletBalanceUsd) || 0,
    walletBalances,
    totalWagers: wagers.length,
  }
}
