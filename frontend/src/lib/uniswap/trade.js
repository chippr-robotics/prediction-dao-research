/**
 * Uniswap SDK trade math.
 *
 * The DEX layer (DexContext) reads raw amounts on-chain through the Uniswap V3
 * QuoterV2 across fee tiers to find the best route. This module wraps those raw
 * numbers in Uniswap SDK primitives (`Token`, `CurrencyAmount`, `Percent`,
 * `Price`) so the trade surface can show the same execution price, minimum
 * received and price impact figures a professional swap client presents —
 * computed with the same SDK the protocol ships, not hand-rolled float math.
 *
 * ETCswap (the ETC family DEX) is a Uniswap V3 deployment, so the SDK primitives
 * apply identically there; only the chainId / addresses differ.
 */
import { Token, CurrencyAmount, Percent, Price } from '@uniswap/sdk-core'
import { computePriceImpact } from '@uniswap/sdk-core'

// The fee tiers we probe when routing, ordered by how commonly they hold the
// deepest liquidity for major pairs. QuoterV2 reverts for a tier with no pool,
// so probing the set and keeping the best output is a lightweight best-route.
export const ROUTED_FEE_TIERS = [500, 3000, 100, 10000]

// Human label for a V3 fee tier (basis points → percent).
export function feeTierLabel(fee) {
  if (fee == null) return null
  return `${(fee / 10000).toFixed(fee % 100 === 0 ? 2 : 3).replace(/\.?0+$/, '')}%`
}

/**
 * Build an SDK Token. Addresses are checksummed by the SDK, so lower-case
 * config addresses are accepted. `chainId` only needs to be the numeric chain
 * id — the SDK does not gate Token on a known-chain allowlist, so ETC-family
 * chain ids work the same as Polygon.
 */
export function toSdkToken(chainId, address, decimals, symbol) {
  return new Token(Number(chainId), address, Number(decimals), symbol)
}

/**
 * Turn a raw on-chain quote into the figures a trader expects to see.
 *
 * @param {object} p
 * @param {Token}  p.tokenIn      SDK token being sold
 * @param {Token}  p.tokenOut     SDK token being bought
 * @param {bigint} p.amountInRaw  input, in tokenIn base units
 * @param {bigint} p.amountOutRaw quoted output, in tokenOut base units
 * @param {bigint} [p.refAmountInRaw]  small reference input for the spot price
 * @param {bigint} [p.refAmountOutRaw] output for the reference input
 * @param {number} p.slippageBps  slippage tolerance, in basis points
 * @returns {{
 *   executionPrice: Price,
 *   minimumReceivedRaw: bigint,
 *   minimumReceived: CurrencyAmount,
 *   priceImpact: Percent | null,
 * }}
 */
export function buildTradeMetrics({
  tokenIn,
  tokenOut,
  amountInRaw,
  amountOutRaw,
  refAmountInRaw,
  refAmountOutRaw,
  slippageBps,
}) {
  const inputAmount = CurrencyAmount.fromRawAmount(tokenIn, amountInRaw.toString())
  const outputAmount = CurrencyAmount.fromRawAmount(tokenOut, amountOutRaw.toString())

  // Execution price = tokenOut received per tokenIn sold.
  const executionPrice = new Price(
    tokenIn,
    tokenOut,
    inputAmount.quotient,
    outputAmount.quotient,
  )

  // Minimum received after slippage, using exact SDK fraction math so the value
  // shown is the value we can enforce on-chain as amountOutMinimum.
  const slippage = new Percent(slippageBps, 10_000)
  const keptFraction = new Percent(10_000 - slippageBps, 10_000)
  const minimumReceived = outputAmount.multiply(keptFraction)
  const minimumReceivedRaw = BigInt(minimumReceived.quotient.toString())

  // Price impact vs the near-spot price implied by a tiny reference quote on the
  // same pool. computePriceImpact() is the protocol's own routine.
  let priceImpact = null
  if (refAmountInRaw != null && refAmountOutRaw != null && refAmountInRaw > 0n && refAmountOutRaw > 0n) {
    try {
      const midPrice = new Price(
        tokenIn,
        tokenOut,
        refAmountInRaw.toString(),
        refAmountOutRaw.toString(),
      )
      priceImpact = computePriceImpact(midPrice, inputAmount, outputAmount)
    } catch {
      priceImpact = null
    }
  }

  return {
    executionPrice,
    minimumReceived,
    minimumReceivedRaw,
    priceImpact,
    slippage,
  }
}
