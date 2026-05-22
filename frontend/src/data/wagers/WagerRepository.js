/**
 * WagerRepository — the indexer-ready boundary between the UI and the data
 * sources. Swapping `SubgraphSource` for an Envio/Ponder/Goldsky source
 * later is a one-line change at the call site; no UI changes required.
 *
 * Sources implement the WagerSource interface:
 *   syncIndex(userAddress): Promise<{ marketIds, lastBlock }>
 *   listPage({ userAddress, cursor, pageSize, sortKey, filter }):
 *     Promise<{ items, nextCursor, hasMore, totalKnown, source }>
 *   getById(id, userAddress): Promise<Wager|null>
 */

import * as EventsSource from './EventsSource'
import * as SubgraphSource from './SubgraphSource'
import { WagerSortKey } from '../../constants/wagerDefaults'

const SOURCE_REGISTRY = {
  events: EventsSource,
  subgraph: SubgraphSource,
}

function resolveSourceKey(explicit) {
  if (explicit && SOURCE_REGISTRY[explicit]) return explicit
  const envSource = import.meta.env?.VITE_WAGER_SOURCE
  if (envSource && SOURCE_REGISTRY[envSource]) return envSource
  return 'subgraph'
}

export function createWagerRepository(opts = {}) {
  const sourceKey = resolveSourceKey(opts.source)
  const source = SOURCE_REGISTRY[sourceKey]

  return {
    sourceKey,

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
      })
    },

    async getWagerById(id, userAddress) {
      if (!id || !userAddress) return null
      return source.getById(String(id), String(userAddress).toLowerCase())
    },

    async syncIndex(userAddress) {
      if (!userAddress) return { marketIds: [], lastBlock: 0 }
      return source.syncIndex(String(userAddress).toLowerCase())
    },
  }
}

let defaultInstance = null

export function getDefaultWagerRepository() {
  if (!defaultInstance) defaultInstance = createWagerRepository()
  return defaultInstance
}
