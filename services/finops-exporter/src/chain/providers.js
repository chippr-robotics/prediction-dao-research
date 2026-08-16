/**
 * Read-only chain providers for the exporter (spec 089).
 *
 * READ-ONLY BY CONSTRUCTION. These are `JsonRpcProvider`s with no signer anywhere in the service.
 * The exporter reports on money and must never be able to move any (FR-026) — the absence of a
 * signer is what enforces that, not a policy comment.
 *
 * Only cohort chains get a provider (FR-008): a mainnet build cannot accidentally scan Mordor's
 * events into the same revenue series, because there is no provider to scan them with.
 */
import { ethers } from 'ethers'

export function buildProviders(config, { log = console.warn } = {}) {
  const providers = {}

  for (const chainId of config.cohortChainIds) {
    const urls = config.rpcUrls[chainId]
    if (!urls?.length) {
      log(`[finops] chain ${chainId}: no RPC_URLS_${chainId} configured — on-chain sources on this chain report not-configured`)
      continue
    }

    // A single URL needs no failover wrapper. Several get a FallbackProvider so one dead endpoint
    // does not turn every on-chain source unreadable at once.
    providers[chainId] =
      urls.length === 1
        ? new ethers.JsonRpcProvider(urls[0], chainId, { staticNetwork: true })
        : new ethers.FallbackProvider(
            urls.map((url, i) => ({
              provider: new ethers.JsonRpcProvider(url, chainId, { staticNetwork: true }),
              priority: i + 1,
              stallTimeout: 3000,
            })),
            chainId,
            { quorum: 1 },
          )
  }

  return providers
}

/**
 * The highest block safe to treat as final on this chain.
 *
 * Revenue counters are computed only up to here (research R5). A counter that could rewind on a
 * reorg breaks every `increase()` and `rate()` query built on it, and the breakage renders as a
 * revenue DROP — the most alarming possible way for a bug to present on a finance dashboard.
 */
export async function finalizedBlock(provider, chainId, config) {
  const head = await provider.getBlockNumber()
  const lag = config.confirmations[chainId] ?? 32
  return Math.max(0, head - lag)
}
