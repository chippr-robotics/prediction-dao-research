/**
 * Shared read-provider factory.
 *
 * Every ethers read in the app comes through here, which makes this the seam where the
 * member's own RPC route (spec 069, `lib/network/rpcEndpoints`) is applied: pass a chainId
 * and you get a provider pointed at their endpoint, with their API-key header attached and
 * their failover behind it. Callers that still pass a URL keep working — the URL is used
 * only when the chain has no member override (see `makeReadProvider`).
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
import { resolveRpcEndpoints } from '../lib/network/rpcEndpoints'

// Ethereum Classic mainnet (61) and Mordor testnet (63).
const NO_BATCH_CHAIN_IDS = new Set([61, 63])

// Every ethers provider runs its own `_detectNetwork` polling loop, which retries forever
// (once a second) when the endpoint is unreachable — there is no signal back to the app
// when that happens, and nothing ever calls `.destroy()`. Building a fresh provider on
// every read (as this used to) means a single flaky chain accumulates one more permanent
// retry loop per read, all hammering the endpoint independently and forever. Caching one
// provider per resolved route keeps that to at most one loop per chain, and rebuilds
// (replacing, not stacking) the moment the resolved route actually changes — e.g. a
// member edits their endpoint in Network settings.
const providerCache = new Map() // chainId -> { key, provider }

function cachedProvider(chainId, key, build) {
  if (chainId == null) return build()
  const existing = providerCache.get(chainId)
  if (existing && existing.key === key) return existing.provider
  if (typeof existing?.provider?.destroy === 'function') {
    try {
      existing.provider.destroy()
    } catch {
      // best-effort cleanup — a provider that fails to tear down cleanly shouldn't block
      // building its replacement.
    }
  }
  const provider = build()
  providerCache.set(chainId, { key, provider })
  return provider
}

/**
 * Build one JsonRpcProvider for a single endpoint.
 *
 * Auth headers ride on a `FetchRequest` rather than the URL, so a provider credential
 * never lands in a URL that could be logged. `staticNetwork` is set only when the chainId
 * is known AND the caller is building a failover set (see below) — a single provider keeps
 * ethers' own network detection so a misconfigured endpoint fails loudly instead of
 * silently answering for another chain.
 */
function buildProvider(url, headers, chainId, { staticNetwork = false } = {}) {
  const options = {}
  if (chainId != null && NO_BATCH_CHAIN_IDS.has(Number(chainId))) options.batchMaxCount = 1

  let target = url
  if (headers && Object.keys(headers).length > 0) {
    const request = new ethers.FetchRequest(url)
    for (const [name, value] of Object.entries(headers)) request.setHeader(name, value)
    target = request
  }

  let network
  if (staticNetwork && chainId != null) {
    // A FallbackProvider needs every member to agree on the network up front; ethers only
    // knows the well-known chains by number, so name the rest explicitly.
    network = new ethers.Network(`chain-${Number(chainId)}`, Number(chainId))
    options.staticNetwork = network
  }

  return new ethers.JsonRpcProvider(target, network, Object.keys(options).length ? options : undefined)
}

/**
 * Build a provider for read calls.
 *
 * Resolution order for the endpoint (spec 069):
 *   1. the member's configured endpoint + failover for `chainId`
 *   2. `rpcUrl` as passed by the caller (the build default, `NETWORKS[chainId].rpcUrl`)
 *
 * With a failover configured the result is an `ethers.FallbackProvider` at quorum 1: the
 * primary is tried first and the failover answers when it stalls or errors, which is the
 * whole point of the member setting one.
 *
 * @param {string} rpcUrl - default endpoint; used when the chain has no member override
 * @param {number|null} [chainId] - selects the member's route and the batching decision
 * @returns {ethers.JsonRpcProvider|ethers.FallbackProvider}
 */
export function makeReadProvider(rpcUrl, chainId = null) {
  const route = chainId != null ? resolveRpcEndpoints(chainId) : null

  // No member override → exactly the pre-069 behavior for the caller's URL.
  if (!route || route.source !== 'member' || !route.primary) {
    const key = JSON.stringify(['single', rpcUrl])
    return cachedProvider(chainId, key, () => buildProvider(rpcUrl, null, chainId))
  }

  if (!route.failover) {
    const key = JSON.stringify(['single', route.primary.url, route.primary.headers])
    return cachedProvider(chainId, key, () => buildProvider(route.primary.url, route.primary.headers, chainId))
  }

  const key = JSON.stringify([
    'fallback',
    route.primary.url,
    route.primary.headers,
    route.failover.url,
    route.failover.headers,
  ])
  return cachedProvider(chainId, key, () => {
    const primary = buildProvider(route.primary.url, route.primary.headers, chainId, { staticNetwork: true })
    const failover = buildProvider(route.failover.url, route.failover.headers, chainId, { staticNetwork: true })
    return new ethers.FallbackProvider(
      [
        { provider: primary, priority: 1, weight: 1, stallTimeout: 2000 },
        { provider: failover, priority: 2, weight: 1 },
      ],
      new ethers.Network(`chain-${Number(chainId)}`, Number(chainId)),
      { quorum: 1 },
    )
  })
}

/**
 * Provider for a chain, resolving the endpoint itself. Preferred in new code — it cannot
 * be called with a URL that contradicts the member's settings.
 *
 * @param {number} chainId
 * @returns {ethers.JsonRpcProvider|ethers.FallbackProvider|null} null when the chain has no endpoint at all
 */
export function getReadProvider(chainId) {
  const route = resolveRpcEndpoints(chainId)
  if (!route.primary) return null
  return makeReadProvider(route.primary.url, chainId)
}

/** Exported for tests / callers that need the batching decision directly. */
export function chainNeedsUnbatchedRpc(chainId) {
  return chainId != null && NO_BATCH_CHAIN_IDS.has(Number(chainId))
}
