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

import { WagerSortKey, TERMINAL_STATUSES } from '../../constants/wagerDefaults'
import { upsertCache } from './cacheStore'
import * as EventsSource from './EventsSource'

const SUBGRAPH_URL = import.meta.env?.VITE_SUBGRAPH_URL || ''

const SORT_KEY_TO_FIELD = {
  [WagerSortKey.CREATED]: 'createdAt',
  [WagerSortKey.ENDS]: 'endTime',
  [WagerSortKey.RESOLUTION_TYPE]: 'resolutionType',
  [WagerSortKey.STATUS]: 'status',
}

const PAGE_QUERY = `
  query MyWagers(
    $owner: String!
    $first: Int!
    $orderBy: Wager_orderBy!
    $orderDirection: OrderDirection!
    $cursorField: String
    $cursorValue: String
    $statusIn: [String!]
    $statusNotIn: [String!]
    $resolutionTypesIn: [Int!]
    $marketTypesIn: [String!]
    $now: BigInt!
    $tab: String!
  ) {
    wagers(
      first: $first
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: {
        and: [
          { or: [
            { creator: $owner },
            { participants_contains: [$owner] }
          ] }
        ]
      }
    ) {
      id
      marketType
      status
      resolutionType
      creator
      participants
      stakePerParticipant
      stakeToken
      tradingPeriodSeconds
      createdAt
      acceptanceDeadline
      endTime
      acceptedCount
      ipfsCid
      isEncrypted
      metadataCipher
      description
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
  return {
    id: String(raw.id),
    marketType: raw.marketType,
    status: raw.status,
    resolutionType: Number(raw.resolutionType ?? 0),
    creator: raw.creator,
    participants: (raw.participants || []).map(p => p.toLowerCase()),
    arbitrator: raw.arbitrator || null,
    stakeAmount: raw.stakePerParticipant,
    stakeTokenAddress: raw.stakeToken,
    stakeTokenSymbol: raw.stakeTokenSymbol || null,
    tradingPeriodSeconds: Number(raw.tradingPeriodSeconds || 0),
    createdAt: Number(raw.createdAt || 0) * 1000,
    acceptanceDeadline: Number(raw.acceptanceDeadline || 0) * 1000,
    endTime: Number(raw.endTime || 0) * 1000,
    endDate: raw.endTime ? new Date(Number(raw.endTime) * 1000).toISOString() : null,
    acceptedCount: Number(raw.acceptedCount || 0),
    ipfsCid: raw.ipfsCid || null,
    isEncrypted: Boolean(raw.isEncrypted),
    metadataCipher: raw.metadataCipher || null,
    description: raw.description || '',
    needsIpfsFetch: Boolean(raw.ipfsCid),
    needsRehydration: false,
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
    cursorField: orderField,
    cursorValue: cursor?.lastSortKey || null,
    statusIn: filter?.statuses || null,
    statusNotIn: filter?.includeExpired ? null : Array.from(TERMINAL_STATUSES),
    resolutionTypesIn: filter?.resolutionTypes || null,
    marketTypesIn: filter?.marketTypes || null,
    now: Math.floor(Date.now() / 1000).toString(),
    tab: filter?.tab || 'participating',
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
      `query($id: ID!) { wager(id: $id) { id marketType status resolutionType creator participants stakePerParticipant stakeToken tradingPeriodSeconds createdAt acceptanceDeadline endTime acceptedCount ipfsCid isEncrypted metadataCipher description } }`,
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
