import { useEffect, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { loadMyWagersSources } from '../lib/lookup/myWagersSources'
import { aggregateMyItems } from '../lib/lookup/myWagersAggregation'

/**
 * The connected user's group pools for the consolidated My Wagers view (spec 037, US2).
 *
 * Pools are a parallel system to the wager registry, so they don't arrive through the wager repository.
 * This loads the user's created + joined pools (scoped to the active network), aggregates them into
 * MyWagersItem[]s, and returns them for display. Read-only; no wallet signature.
 */
export function useMyPools() {
  const { account, chainId } = useWallet()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    if (!account) {
      setItems([])
      return undefined
    }
    setLoading(true)
    loadMyWagersSources({ chainId, account })
      .then(({ createdPools, joinedPools }) => {
        if (!alive) return
        setItems(aggregateMyItems({ createdPools, joinedPools }))
      })
      .catch(() => { if (alive) setItems([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [account, chainId])

  return { items, loading }
}

export default useMyPools
