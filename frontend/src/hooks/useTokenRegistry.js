/**
 * useTokenRegistry (Spec 034, FR-001/FR-016/FR-017) — the per-network token
 * catalog the "Add token" browser searches. Fetches the pinned token list for
 * the active chain, caches it (TTL), and degrades to last-good cache → in-repo
 * seed on failure. `custom-only` networks (Amoy, Hardhat) expose just the seed
 * and flag `isCustomOnly` so the UI states honestly that no curated list exists.
 */

import { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from './useWeb3'
import { getTokenListSource } from '../config/networks'
import {
  fetchTokenList,
  getCachedList,
  putCachedList,
  isFresh,
  filterByChain,
} from '../lib/tokens/tokenList'

export function useTokenRegistry(chainIdArg) {
  const { chainId: ctxChainId } = useWeb3()
  const chainId = chainIdArg ?? ctxChainId
  const [state, setState] = useState({ catalog: [], status: 'idle', isCustomOnly: false })

  const load = useCallback(async () => {
    const src = getTokenListSource(chainId)
    if (!src || src.sourceType === 'custom-only' || !src.url) {
      setState({ catalog: filterByChain(src?.seed ?? [], chainId), status: 'ready', isCustomOnly: true })
      return
    }

    const cached = getCachedList(src.url)
    if (cached && isFresh(cached)) {
      setState({ catalog: filterByChain(cached.tokens, chainId), status: 'ready', isCustomOnly: false })
      return
    }

    setState((s) => ({ ...s, status: 'loading' }))
    try {
      const fresh = await fetchTokenList(src.url)
      putCachedList(src.url, fresh)
      setState({ catalog: filterByChain(fresh.tokens, chainId), status: 'ready', isCustomOnly: false })
    } catch {
      // Degrade: last-good cache → in-repo seed → honest "unavailable" (FR-016).
      if (cached?.tokens) {
        setState({ catalog: filterByChain(cached.tokens, chainId), status: 'ready', isCustomOnly: false })
      } else if (src.seed?.length) {
        setState({ catalog: filterByChain(src.seed, chainId), status: 'ready', isCustomOnly: false })
      } else {
        setState({ catalog: [], status: 'unavailable', isCustomOnly: false })
      }
    }
  }, [chainId])

  useEffect(() => {
    load()
  }, [load])

  const search = useCallback(
    (query) => {
      const sorted = [...state.catalog].sort((a, b) =>
        String(a.symbol).localeCompare(String(b.symbol)),
      )
      const q = String(query ?? '').trim().toLowerCase()
      if (!q) return sorted
      return sorted.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          (t.name || '').toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q),
      )
    },
    [state.catalog],
  )

  return { ...state, chainId, search, refresh: load }
}

export default useTokenRegistry
