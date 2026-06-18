/**
 * Stablecoin valuation for the wager tax/activity report
 * (spec 016-wager-tax-report, FR-005 / FR-016; research.md D3).
 *
 * v1 policy: value every stablecoin transfer at a par $1.00 per token. The
 * value is returned in a STRUCTURED field (`usdValue`, `costBasis`,
 * `valuationSource`) so a real historical price feed can replace the baseline
 * later without changing the report's shape. Cost basis uses the same
 * valuation at staking time per the spec clarification.
 *
 * Pure module — no I/O.
 */

/** USD value of one stablecoin token under the v1 par baseline. */
export const PAR_USD_PER_TOKEN = 1.0

/** Stable identifier recorded on each valued row (for future feed swap-in). */
export const VALUATION_SOURCE_PAR = 'par-1usd-v1'

/** Disclosure shown on the report document (FR-005 / FR-009). */
export const PAR_VALUATION_NOTE =
  'USD values use a $1.00-per-token par baseline for supported stablecoins. ' +
  'Minor de-pegging at the exact transfer time is not yet reflected.'

/**
 * Value a transfer amount (token units) at the par baseline.
 *
 * @param {number|string} amount - token amount in human units (not wei)
 * @returns {{usdValue: number, costBasis: number, valuationSource: string}}
 */
export function valueTransfer(amount) {
  const tokens = Number(amount)
  const usd = Number.isFinite(tokens) ? tokens * PAR_USD_PER_TOKEN : 0
  return {
    usdValue: usd,
    // Cost basis = par value at staking time (FR-016). Identical to usdValue
    // under the par baseline, but kept as its own field so a future feed can
    // diverge proceeds (transfer-time) from basis (staking-time).
    costBasis: usd,
    valuationSource: VALUATION_SOURCE_PAR,
  }
}
