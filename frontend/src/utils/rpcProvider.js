/**
 * Shared read-provider factory.
 *
 * ethers v6 batches concurrent JSON-RPC calls into a single request by default
 * (batchMaxCount = 100). Some chains' public RPC endpoints — notably Ethereum
 * Classic / Mordor (Caddy-fronted core-geth/besu nodes) — return batch
 * responses that ethers cannot decode, surfacing as
 *   `bad response data (… code=SERVER_ERROR …)` / `invalid BytesLike value`.
 *
 * The failure is intermittent and environment-dependent (it reproduces in the
 * browser/DOM runtime even when a plain Node process tolerates it), and it takes
 * down EVERY read on the chain — `fetchFriendMarketsForUser` (My Wagers) and
 * `hasRoleOnChain` (the membership banner) both go through the same provider, so
 * a single batched failure leaves the UI looking empty.
 *
 * For these chains we disable batching so each eth_call is sent on its own
 * request, which the endpoints handle reliably. Chains known to support batching
 * (Polygon, Amoy) keep the default behavior so we don't regress their request
 * volume.
 */
import { ethers } from 'ethers'

// Ethereum Classic mainnet (61) and Mordor testnet (63).
const NO_BATCH_CHAIN_IDS = new Set([61, 63])

/**
 * Build a JsonRpcProvider for read calls, disabling request batching on chains
 * whose RPCs mishandle JSON-RPC batches.
 *
 * @param {string} rpcUrl
 * @param {number|null} [chainId] - used only to decide whether to disable batching
 * @returns {ethers.JsonRpcProvider}
 */
export function makeReadProvider(rpcUrl, chainId = null) {
  const options =
    chainId != null && NO_BATCH_CHAIN_IDS.has(Number(chainId)) ? { batchMaxCount: 1 } : undefined
  return new ethers.JsonRpcProvider(rpcUrl, undefined, options)
}

/** Exported for tests / callers that need the batching decision directly. */
export function chainNeedsUnbatchedRpc(chainId) {
  return chainId != null && NO_BATCH_CHAIN_IDS.has(Number(chainId))
}
