import { useCallback, useEffect, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { usePools } from './usePools'
import { loadMyWagersSources, readJoinedPoolAddresses } from '../lib/lookup/myWagersSources'
import { aggregateMyItems } from '../lib/lookup/myWagersAggregation'

// Bound the RPC fallback so a long device history can't fan out into dozens of reads per open.
const MAX_FALLBACK_READS = 12

/**
 * The connected user's group pools for the consolidated My Wagers view (spec 037, US2).
 *
 * Pools are a parallel system to the wager registry, so they don't arrive through the wager repository.
 * This loads the user's created + joined pools (scoped to the active network), aggregates them into
 * MyWagersItem[]s, and returns them for display. Read-only; no wallet signature.
 *
 * Reliability (tester feedback — "users must be able to locate their pools"): device-recorded pool
 * addresses that the subgraph did NOT return (indexer lagging, or a chain with no subgraph configured)
 * are backfilled with direct on-chain summary reads, so a pool the user created or joined on this
 * device always surfaces.
 */
export function useMyPools() {
  const { account, chainId } = useWallet()
  const { getPoolSummary } = usePools()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const { createdPools = [], joinedPools = [] } = await loadMyWagersSources({ chainId, account })
      .catch(() => ({ createdPools: [], joinedPools: [] }))

    // On-chain fallback for device-known pools the subgraph didn't return.
    const indexed = new Set([...createdPools, ...joinedPools].map((p) => String(p.address).toLowerCase()))
    const missing = readJoinedPoolAddresses(account)
      .filter((a) => !indexed.has(String(a).toLowerCase()))
      .slice(0, MAX_FALLBACK_READS)
    const fallback = (
      await Promise.all(
        missing.map((addr) =>
          getPoolSummary(addr)
            .then((s) => ({
              address: s.address,
              poolId: null,
              state: s.state,
              stateLabel: s.stateDisplay || s.stateLabel,
              memberCount: s.memberCount,
              maxMembers: s.maxMembers,
            }))
            .catch(() => null)
        )
      )
    ).filter(Boolean)

    return aggregateMyItems({ createdPools, joinedPools: [...joinedPools, ...fallback] })
  }, [account, chainId, getPoolSummary])

  useEffect(() => {
    let alive = true
    if (!account) {
      setItems([])
      return undefined
    }
    setLoading(true)
    load()
      .then((list) => { if (alive) setItems(list) })
      .catch(() => { if (alive) setItems([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [account, load])

  return { items, loading }
}

export default useMyPools
