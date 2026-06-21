/**
 * WagerRepository — the indexer-ready boundary between the UI and the data
 * sources. Swapping `SubgraphSource` for an Envio/Ponder/Goldsky source
 * later is a one-line change at the call site; no UI changes required.
 *
 * Source selection is per-chain: networks indexed by a subgraph
 * (`hasSubgraph(chainId)`) read from `SubgraphSource`; networks without one
 * (e.g. Ethereum Classic Mordor) read directly from the on-chain
 * `WagerRegistry` via `RegistrySource`. The repository is bound to a chain id
 * so a wallet on testnet never reads mainnet wagers (or vice versa).
 *
 * Sources implement the WagerSource interface:
 *   syncIndex(userAddress, opts): Promise<{ marketIds, lastBlock }>
 *   listPage({ userAddress, cursor, pageSize, sortKey, filter, chainId }):
 *     Promise<{ items, nextCursor, hasMore, totalKnown, source }>
 *   getById(id, userAddress, opts): Promise<Wager|null>
 */

import * as EventsSource from './EventsSource'
import * as SubgraphSource from './SubgraphSource'
import * as RegistrySource from './RegistrySource'
import { WagerSortKey } from '../../constants/wagerDefaults'
import { hasSubgraph } from '../../config/networks'

const SOURCE_REGISTRY = {
  events: EventsSource,
  subgraph: SubgraphSource,
  registry: RegistrySource,
}

function resolveSourceKey(explicit, chainId) {
  // An explicit per-call override or the global VITE_WAGER_SOURCE escape hatch
  // always wins (useful for debugging a specific source).
  if (explicit && SOURCE_REGISTRY[explicit]) return explicit
  const envSource = import.meta.env?.VITE_WAGER_SOURCE
  if (envSource && SOURCE_REGISTRY[envSource]) return envSource
  // Chain-aware default: indexed chains use the subgraph; everything else
  // (Mordor, Hardhat, any future un-indexed deployment) reads over RPC.
  if (chainId != null) return hasSubgraph(chainId) ? 'subgraph' : 'registry'
  return 'subgraph'
}

export function createWagerRepository(opts = {}) {
  const chainId = opts.chainId ?? null
  const sourceKey = resolveSourceKey(opts.source, chainId)
  const source = SOURCE_REGISTRY[sourceKey]

  return {
    sourceKey,
    chainId,

    async listMyWagers({
      userAddress,
      cursor = null,
      pageSize = 25,
      sortKey = WagerSortKey.CREATED,
      filter = {},
    }) {
      if (!userAddress) {
        return { items: [], nextCursor: null, hasMore: false, totalKnown: 0, source: sourceKey }
      }
      return source.listPage({
        userAddress: String(userAddress).toLowerCase(),
        cursor,
        pageSize,
        sortKey,
        filter,
        chainId,
      })
    },

    async getWagerById(id, userAddress) {
      if (!id || !userAddress) return null
      return source.getById(String(id), String(userAddress).toLowerCase(), { chainId })
    },

    async syncIndex(userAddress) {
      if (!userAddress) return { marketIds: [], lastBlock: 0 }
      return source.syncIndex(String(userAddress).toLowerCase(), { chainId })
    },
  }
}

// Repositories are cheap and stateless, so memoize one per chain id to keep a
// stable identity across renders (hooks depend on it).
const instancesByChain = new Map()

export function getDefaultWagerRepository(chainId = null) {
  const key = chainId == null ? 'default' : String(chainId)
  if (!instancesByChain.has(key)) {
    instancesByChain.set(key, createWagerRepository({ chainId }))
  }
  return instancesByChain.get(key)
}
