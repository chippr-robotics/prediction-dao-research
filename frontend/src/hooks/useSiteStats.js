/**
 * useSiteStats — wallet-free hook that powers the landing page stats band.
 *
 * Source priority (graceful degradation):
 *   1. Subgraph aggregation (VITE_SUBGRAPH_URL) — counts wagers by status,
 *      sums staked value, counts unique users.
 *   2. RPC fallback — reads WagerRegistry.nextWagerId() for the total wager
 *      count when the subgraph is unavailable.
 *   3. Baseline floor — every metric is displayed as max(live, baseline) so
 *      a fresh testnet still looks alive (see constants/siteStats.js).
 *
 * Results are cached at module scope for STATS_TTL_MS so the band doesn't
 * refetch on every mount/navigation.
 */

import { useEffect, useState } from 'react'
import { Contract, formatUnits } from 'ethers'
import { getProvider } from '../utils/blockchainService'
import { CONTRACT_ADDRESSES } from '../config/contracts'
import { WagerRegistryABI } from '../abis/WagerRegistry'
import { STATS_BASELINE } from '../constants/siteStats'

const SUBGRAPH_URL = import.meta.env?.VITE_SUBGRAPH_URL || ''
// Stake token is assumed to be a 6-decimal stable (USDC) for the headline
// USD figure — accurate for the default deployment's stake token.
const STABLE_DECIMALS = 6
const STATS_TTL_MS = 60_000
const QUERY_PAGE = 1000

const STATS_QUERY = `
  query SiteStats($first: Int!) {
    wagers(first: $first, orderBy: createdAt, orderDirection: desc) {
      status
      stakePerParticipant
      acceptedCount
    }
    users(first: $first) {
      id
    }
  }
`

let cache = null // { value, ts }

function emptyStats() {
  return {
    activeAccounts: 0,
    valueWageredUsd: 0,
    wagersResolved: 0,
    totalWagers: 0,
    activeWagers: 0,
  }
}

async function fetchFromSubgraph() {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: STATS_QUERY, variables: { first: QUERY_PAGE } }),
  })
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0]?.message || 'Subgraph error')

  const wagers = json.data?.wagers || []
  const users = json.data?.users || []

  let potBase = 0n
  let resolved = 0
  let active = 0
  for (const w of wagers) {
    if (w.status === 'resolved') resolved += 1
    if (w.status === 'active') active += 1
    try {
      potBase += BigInt(w.stakePerParticipant || 0) * BigInt(w.acceptedCount || 0)
    } catch {
      // skip malformed rows rather than failing the whole aggregation
    }
  }

  return {
    activeAccounts: users.length,
    valueWageredUsd: Math.round(Number(formatUnits(potBase, STABLE_DECIMALS))),
    wagersResolved: resolved,
    totalWagers: wagers.length,
    activeWagers: active,
  }
}

async function fetchFromRpc() {
  const stats = emptyStats()
  const address = CONTRACT_ADDRESSES.WagerRegistry
  if (!address) return stats
  const registry = new Contract(address, WagerRegistryABI, getProvider())
  const nextId = await registry.nextWagerId()
  // ids start at 1, so total created = nextWagerId - 1
  stats.totalWagers = Math.max(0, Number(nextId) - 1)
  return stats
}

async function loadStats() {
  if (cache && Date.now() - cache.ts < STATS_TTL_MS) return cache.value

  let live = emptyStats()
  let isLive = false
  try {
    live = SUBGRAPH_URL ? await fetchFromSubgraph() : await fetchFromRpc()
    isLive = true
  } catch {
    try {
      live = await fetchFromRpc()
      isLive = true
    } catch {
      isLive = false
    }
  }

  // Floor each metric at its baseline so the band always looks alive.
  const stats = {}
  for (const key of Object.keys(STATS_BASELINE)) {
    stats[key] = Math.max(Number(live[key]) || 0, STATS_BASELINE[key])
  }

  const value = { stats, isLive }
  cache = { value, ts: Date.now() }
  return value
}

export function useSiteStats() {
  // Render the baseline immediately so the band never flashes empty, then
  // refine with live data once it resolves.
  const [stats, setStats] = useState(() => ({ ...STATS_BASELINE }))
  const [isLive, setIsLive] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadStats()
      .then((res) => {
        if (cancelled) return
        setStats(res.stats)
        setIsLive(res.isLive)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { stats, isLive, loading }
}

export default useSiteStats
