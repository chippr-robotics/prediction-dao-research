import { useCallback, useEffect, useRef, useState } from 'react'
import { useChainId } from 'wagmi'
import { getNetwork, getCurrentChainId } from '../config/networks'
import logger from '../utils/logger'

const DEFAULT_LIMIT = 10
const SEARCH_DEBOUNCE_MS = 400

/**
 * Search Polymarket events by name via the Gamma API.
 *
 * The Gamma API base URL is per-chain (set in networks.js); both Polygon
 * Amoy (testnet) and Polygon Mainnet share Polymarket's public Gamma
 * instance at gamma-api.polymarket.com by default.
 *
 * Usage:
 *   const { results, isLoading, error, search, clear } = usePolymarketSearch()
 *   search('US election')                       // returns markets matching the query
 *   const m = results[0]; m.conditionId         // pass to the LinkedMarket form
 *
 * Each result includes:
 *   - id, slug, question, category
 *   - conditionId (bytes32 — what the PolymarketOracle resolution type wants)
 *   - endDate, volume, liquidity, active, closed
 *   - outcomes: [{ name, price }]
 */
export function usePolymarketSearch({ limit = DEFAULT_LIMIT } = {}) {
  const wagmiChainId = useChainId()
  const chainId = wagmiChainId || getCurrentChainId()
  const network = getNetwork(chainId)
  const apiBase = network?.polymarket?.gammaApiUrl || 'https://gamma-api.polymarket.com'

  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastQuery, setLastQuery] = useState('')

  const debounceRef = useRef(null)
  const abortRef = useRef(null)

  const runSearch = useCallback(async (rawQuery) => {
    const query = String(rawQuery || '').trim()
    setLastQuery(query)

    if (!query) {
      setResults([])
      setError(null)
      return
    }

    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      // Gamma API: /markets supports `search` plus filters; we ask for active,
      // unresolved markets first since those are what a side-bet wants to peg.
      const params = new URLSearchParams({
        search: query,
        limit: String(limit),
        active: 'true',
        closed: 'false',
      })
      const url = `${apiBase.replace(/\/$/, '')}/markets?${params.toString()}`
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })

      if (!res.ok) {
        throw new Error(`Polymarket Gamma API returned ${res.status}`)
      }

      const data = await res.json()
      // The Gamma API has historically returned both raw arrays and
      // { data: [] } wrappers, so normalise.
      const items = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      const normalised = items
        .map(normaliseGammaMarket)
        .filter((m) => m.conditionId) // can only peg markets that have a condition id

      setResults(normalised)
    } catch (err) {
      if (err.name === 'AbortError') return
      logger.warn?.('[usePolymarketSearch] failed:', err)
      setError(err.message || 'Polymarket search failed')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [apiBase, limit])

  const search = useCallback((query) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS)
  }, [runSearch])

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()
    setResults([])
    setError(null)
    setLastQuery('')
    setIsLoading(false)
  }, [])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()
  }, [])

  return {
    results,
    isLoading,
    error,
    lastQuery,
    search,
    runSearch,
    clear,
  }
}

/**
 * Normalise a Gamma `/markets` response item into the same shape used by
 * `usePolymarketSearch`. Extracted so the top-markets hook can reuse it.
 */
function normaliseGammaMarket(m) {
  const outcomes = (() => {
    try {
      const names = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes
      const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices
      if (!Array.isArray(names)) return []
      return names.map((name, i) => ({
        name,
        price: prices?.[i] != null ? Number(prices[i]) : null,
      }))
    } catch {
      return []
    }
  })()

  return {
    id: m.id ?? m.marketId ?? null,
    slug: m.slug || null,
    question: m.question || m.title || m.name || '',
    description: m.description || '',
    category: m.category || m.categories || null,
    conditionId: m.conditionId || m.condition_id || null,
    endDate: m.endDate || m.end_date_iso || null,
    volume: m.volume != null ? Number(m.volume) : null,
    liquidity: m.liquidity != null ? Number(m.liquidity) : null,
    active: m.active !== false,
    closed: m.closed === true,
    image: m.image || m.icon || null,
    outcomes,
  }
}

/**
 * Load the currently top-by-volume Polymarket markets, optionally filtered by
 * category/tag slugs. Used by the dashboard feed and the in-modal market
 * browser. Mirrors the `usePolymarketSearch` lifecycle (per-chain `apiBase`,
 * `AbortController` cleanup) so behaviour stays consistent.
 *
 * Usage:
 *   const { results, isLoading, error, refresh } = usePolymarketTopMarkets({
 *     categories: ['politics', 'sports'],
 *     limit: 12,
 *   })
 *
 * Gamma's `/markets` endpoint sorts by `volume` desc when given
 * `order=volume&ascending=false`. Multiple tag slugs are comma-joined under
 * `tag_slug=` — the Gamma API treats them as OR.
 */
export function usePolymarketTopMarkets({ categories = [], limit = 12 } = {}) {
  const wagmiChainId = useChainId()
  const chainId = wagmiChainId || getCurrentChainId()
  const network = getNetwork(chainId)
  const apiBase = network?.polymarket?.gammaApiUrl || 'https://gamma-api.polymarket.com'

  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  // Stabilise the categories array against new references on every render —
  // the parent often passes a fresh array literal, which would otherwise loop
  // the effect.
  const categoriesKey = Array.isArray(categories) ? categories.slice().sort().join(',') : ''

  const fetchTop = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: String(limit),
        active: 'true',
        closed: 'false',
        order: 'volume',
        ascending: 'false',
      })
      if (categoriesKey) {
        params.set('tag_slug', categoriesKey)
      }
      const url = `${apiBase.replace(/\/$/, '')}/markets?${params.toString()}`
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })

      if (!res.ok) {
        throw new Error(`Polymarket Gamma API returned ${res.status}`)
      }

      const data = await res.json()
      const items = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      const normalised = items
        .map(normaliseGammaMarket)
        .filter((m) => m.conditionId)
      setResults(normalised)
    } catch (err) {
      if (err.name === 'AbortError') return
      logger.warn?.('[usePolymarketTopMarkets] failed:', err)
      setError(err.message || 'Polymarket top-markets fetch failed')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [apiBase, limit, categoriesKey])

  useEffect(() => {
    fetchTop()
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [fetchTop])

  return {
    results,
    isLoading,
    error,
    refresh: fetchTop,
  }
}

export default usePolymarketSearch
