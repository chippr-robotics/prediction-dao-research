/**
 * EIP-1559 fee overrides for user-facing write transactions.
 *
 * On Polygon networks (mainnet 137, Amoy testnet 80002) the RPC frequently reports a
 * near-zero `maxPriorityFeePerGas`. ethers then populates the transaction with that value,
 * and wallets surface it as a "$0 / 0 POL site-suggested" gas option — forcing the user to
 * pick a fee manually (Minor bug #2). To avoid that, we apply a sensible priority-fee floor
 * so the wallet shows a usable, non-zero suggestion.
 *
 * For every other network we return an empty object, leaving fee estimation entirely to the
 * wallet / ethers defaults.
 */

const POLYGON_CHAIN_IDS = new Set([137, 80002])
// 30 gwei — comfortably above Polygon's typical minimum priority fee.
const MIN_PRIORITY_FEE_WEI = 30_000_000_000n

/**
 * @param {ethers.Provider} provider
 * @returns {Promise<{maxFeePerGas?: bigint, maxPriorityFeePerGas?: bigint}>}
 */
export async function getFeeOverrides(provider) {
  try {
    if (!provider?.getFeeData || !provider?.getNetwork) return {}

    const network = await provider.getNetwork()
    const chainId = Number(network?.chainId)
    if (!POLYGON_CHAIN_IDS.has(chainId)) return {}

    const fee = await provider.getFeeData()
    const suggestedPriority = fee.maxPriorityFeePerGas ?? 0n
    const suggestedMaxFee = fee.maxFeePerGas ?? 0n

    // Floor the priority fee; if the node already suggests more, keep its value.
    const priority = suggestedPriority > MIN_PRIORITY_FEE_WEI
      ? suggestedPriority
      : MIN_PRIORITY_FEE_WEI

    // Carry any priority bump onto the node's maxFee so the tx stays valid
    // (maxFee must be >= base fee + priority). Guarantee a minimum headroom too.
    const priorityBump = priority > suggestedPriority ? priority - suggestedPriority : 0n
    let maxFee = suggestedMaxFee + priorityBump
    const floorMaxFee = priority * 2n
    if (maxFee < floorMaxFee) maxFee = floorMaxFee

    return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority }
  } catch {
    // Never block a transaction on fee estimation — fall back to wallet defaults.
    return {}
  }
}
