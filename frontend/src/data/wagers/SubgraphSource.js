/**
 * SubgraphSource — WagerSource implementation backed by The Graph's
 * decentralized network (public during development; hosted graph in future).
 *
 * Encodes filter + sort directly in GraphQL `where` / `orderBy` clauses so
 * scalability is bounded by the indexer, not by the client. The visible page
 * is the only data fetched; encrypted envelopes round-trip as raw strings
 * and are decrypted client-side via useLazyMarketDecryption.
 *
 * Falls back to EventsSource if the subgraph endpoint is unreachable.
 */

import { WagerSortKey } from '../../constants/wagerDefaults'
import { upsertCache } from './cacheStore'
import * as EventsSource from './EventsSource'

const SUBGRAPH_URL = import.meta.env?.VITE_SUBGRAPH_URL || ''

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

async function postGraphQL(query, variables) {
  if (!SUBGRAPH_URL) throw new Error('VITE_SUBGRAPH_URL is not set')
  const res = await fetch(SUBGRAPH_URL, {
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
}) {
  if (!userAddress) {
    return { items: [], nextCursor: null, hasMore: false, totalKnown: 0, source: 'subgraph' }
  }
  if (!SUBGRAPH_URL) {
    return EventsSource.listPage({ userAddress, cursor, pageSize, sortKey, filter }).then(r => ({
      ...r,
      source: 'subgraph-fallback',
    }))
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
    const data = await postGraphQL(PAGE_QUERY, variables)
    const items = (data?.wagers || []).slice(0, pageSize).map(toWager)
    const hasMore = (data?.wagers || []).length > pageSize
    const nextCursor = hasMore && items.length
      ? { sortKey, lastSortKey: String(items[items.length - 1][orderField] ?? ''), pageSize }
      : null
    if (items.length) upsertCache(userAddress, items)
    return { items, nextCursor, hasMore, totalKnown: items.length, source: 'subgraph' }
  } catch (err) {
    console.warn('[SubgraphSource] falling back to EventsSource:', err?.message)
    const fallback = await EventsSource.listPage({ userAddress, cursor, pageSize, sortKey, filter })
    return { ...fallback, source: 'subgraph-fallback' }
  }
}

export async function getById(id, userAddress) {
  if (!id || !userAddress) return null
  if (!SUBGRAPH_URL) return EventsSource.getById(id, userAddress)
  try {
    const data = await postGraphQL(
      `query($id: ID!) { wager(id: $id) { id status resolutionType creator opponent token creatorStake opponentStake winner createdAt resolvedAt metadataUri metadataHash } }`,
      { id: String(id) }
    )
    const wager = data?.wager ? toWager(data.wager) : null
    if (wager) upsertCache(userAddress, [wager])
    return wager
  } catch (err) {
    console.warn('[SubgraphSource] getById fallback:', err?.message)
    return EventsSource.getById(id, userAddress)
  }
}
