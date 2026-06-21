/**
 * SubgraphSource — WagerSource implementation backed by The Graph's
 * decentralized network (public during development; hosted graph in future).
 *
 * Encodes filter + sort directly in GraphQL `where` / `orderBy` clauses so
 * scalability is bounded by the indexer, not by the client. The visible page
 * is the only data fetched; encrypted envelopes round-trip as raw strings
 * and are decrypted client-side via useLazyMarketDecryption.
 *
 * The endpoint is resolved per-chain from networks.js. When a chain has no
 * subgraph, or the endpoint is unreachable, reads fall back to RegistrySource
 * (direct RPC reads of the v2 WagerRegistry) rather than the deprecated
 * FriendGroupMarketFactory-backed EventsSource.
 */

import { WagerSortKey } from '../../constants/wagerDefaults'
import { upsertCache } from './cacheStore'
import * as RegistrySource from './RegistrySource'
import { getSubgraphUrl, getCurrentChainId } from '../../config/networks'

// Legacy single-endpoint override. Honored only for the build-time active
// chain so it can never leak to a different network at runtime; per-chain
// `subgraphUrl` in networks.js is the preferred configuration.
const LEGACY_SUBGRAPH_URL = import.meta.env?.VITE_SUBGRAPH_URL || ''

function resolveSubgraphUrl(chainId) {
  const perChain = getSubgraphUrl(chainId)
  if (perChain) return perChain
  if (chainId == null || chainId === getCurrentChainId()) return LEGACY_SUBGRAPH_URL
  return ''
}

// v2 WagerRegistry has no on-chain trading/resolution deadlines in its events,
// so "ends" sort falls back to createdAt; the detail view hydrates timing from
// chain (needsRehydration, research R5).
const SORT_KEY_TO_FIELD = {
  [WagerSortKey.CREATED]: 'createdAt',
  [WagerSortKey.ENDS]: 'createdAt',
  [WagerSortKey.RESOLUTION_TYPE]: 'resolutionType',
  [WagerSortKey.STATUS]: 'status',
}

// Only declare variables the query actually uses — GraphQL rejects an operation
// with a declared-but-unused variable. v2 wagers are 1v1, so ownership is
// creator OR opponent (the v1 participants array is gone).
const PAGE_QUERY = `
  query MyWagers(
    $owner: Bytes!
    $first: Int!
    $orderBy: Wager_orderBy!
    $orderDirection: OrderDirection!
  ) {
    wagers(
      first: $first
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: { or: [ { creator: $owner }, { opponent: $owner } ] }
    ) {
      id
      status
      resolutionType
      creator
      opponent
      token
      creatorStake
      opponentStake
      winner
      createdAt
      resolvedAt
      metadataUri
      metadataHash
    }
  }
`

async function postGraphQL(url, query, variables) {
  if (!url) throw new Error('No subgraph endpoint configured for this chain')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(`Subgraph: ${json.errors[0]?.message || 'unknown error'}`)
  return json.data
}

function toWager(raw) {
  const isIpfs = Boolean(raw.metadataUri && String(raw.metadataUri).startsWith('ipfs://'))
  const ipfsCid = isIpfs ? String(raw.metadataUri).slice('ipfs://'.length) : null
  return {
    id: String(raw.id),
    // v2 WagerRegistry is always 1v1.
    marketType: 'oneVsOne',
    status: raw.status,
    resolutionType: Number(raw.resolutionType ?? 0),
    creator: raw.creator,
    opponent: raw.opponent || null,
    participants: [raw.creator, raw.opponent].filter(Boolean).map(p => String(p).toLowerCase()),
    arbitrator: null,
    // v2 has explicit per-side stakes; expose both, with creatorStake as the
    // representative headline amount.
    stakeAmount: raw.creatorStake,
    creatorStake: raw.creatorStake,
    opponentStake: raw.opponentStake,
    stakeTokenAddress: raw.token,
    stakeTokenSymbol: null,
    createdAt: Number(raw.createdAt || 0) * 1000,
    resolvedAt: raw.resolvedAt ? Number(raw.resolvedAt) * 1000 : null,
    winner: raw.winner || null,
    metadataUri: raw.metadataUri || null,
    metadataHash: raw.metadataHash || null,
    ipfsCid,
    needsIpfsFetch: isIpfs,
    description: '',
    isEncrypted: false,
    // v2 events carry no trading/resolution deadlines or decrypted metadata, so
    // the detail/list view rehydrates timing + description from chain (R5).
    needsRehydration: true,
  }
}

export async function syncIndex(_userAddress) {
  // The subgraph indexes server-side; the client doesn't maintain an
  // explicit watermark. Return an empty index so callers can short-circuit.
  return { marketIds: [], lastBlock: 0 }
}

export async function listPage({
  userAddress,
  cursor,
  pageSize = 25,
  sortKey = WagerSortKey.CREATED,
  filter,
  chainId,
}) {
  if (!userAddress) {
    return { items: [], nextCursor: null, hasMore: false, totalKnown: 0, source: 'subgraph' }
  }
  const subgraphUrl = resolveSubgraphUrl(chainId)
  if (!subgraphUrl) {
    const fallback = await RegistrySource.listPage({
      userAddress,
      cursor,
      pageSize,
      sortKey,
      filter,
      chainId,
    })
    return { ...fallback, source: 'subgraph-fallback' }
  }
  if (import.meta.env.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') {
    return { items: [], nextCursor: null, hasMore: false, totalKnown: 0, source: 'subgraph' }
  }

  const orderField = SORT_KEY_TO_FIELD[sortKey] || 'createdAt'
  const variables = {
    owner: userAddress.toLowerCase(),
    first: pageSize + 1,
    orderBy: orderField,
    orderDirection: 'desc',
  }

  try {
    const data = await postGraphQL(subgraphUrl, PAGE_QUERY, variables)
    const items = (data?.wagers || []).slice(0, pageSize).map(toWager)
    const hasMore = (data?.wagers || []).length > pageSize
    const nextCursor = hasMore && items.length
      ? { sortKey, lastSortKey: String(items[items.length - 1][orderField] ?? ''), pageSize }
      : null
    if (items.length) upsertCache(userAddress, items)
    return { items, nextCursor, hasMore, totalKnown: items.length, source: 'subgraph' }
  } catch (err) {
    console.warn('[SubgraphSource] falling back to RegistrySource (RPC):', err?.message)
    const fallback = await RegistrySource.listPage({
      userAddress,
      cursor,
      pageSize,
      sortKey,
      filter,
      chainId,
    })
    return { ...fallback, source: 'subgraph-fallback' }
  }
}

export async function getById(id, userAddress, opts = {}) {
  if (!id || !userAddress) return null
  const subgraphUrl = resolveSubgraphUrl(opts.chainId)
  if (!subgraphUrl) return RegistrySource.getById(id, userAddress, opts)
  try {
    const data = await postGraphQL(
      subgraphUrl,
      `query($id: ID!) { wager(id: $id) { id status resolutionType creator opponent token creatorStake opponentStake winner createdAt resolvedAt metadataUri metadataHash } }`,
      { id: String(id) }
    )
    const wager = data?.wager ? toWager(data.wager) : null
    if (wager) upsertCache(userAddress, [wager])
    return wager
  } catch (err) {
    console.warn('[SubgraphSource] getById fallback to RPC:', err?.message)
    return RegistrySource.getById(id, userAddress, opts)
  }
}
