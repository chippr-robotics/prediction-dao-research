/**
 * Pure filter / sort / paginate helpers for the My Wagers list.
 *
 * Mirror of the predicates a subgraph encodes in its `where` and `orderBy`
 * clauses. Also used as a defensive double-gate by the events-backed source
 * against tampered localStorage caches.
 */

import {
  ResolutionTypeOrder,
  TERMINAL_STATUSES,
  WagerSortKey,
} from '../../constants/wagerDefaults'

const PENDING_RESOLUTION_STATUSES = new Set([
  'pending_resolution',
  'challenged',
  'disputed',
])

function lower(s) {
  return s ? String(s).toLowerCase() : ''
}

function ownsWager(wager, ownerAddress) {
  if (!ownerAddress) return false
  const addr = lower(ownerAddress)
  if (lower(wager.creator) === addr) return true
  return (wager.participants || []).some(p => lower(p) === addr)
}

export function applyOwnershipGate(wagers, ownerAddress) {
  return wagers.filter(w => ownsWager(w, ownerAddress))
}

function isExpired(wager, now) {
  const status = lower(wager.status)
  if (TERMINAL_STATUSES.has(status)) return true
  if (PENDING_RESOLUTION_STATUSES.has(status)) return false
  const endTime = Number(wager.endTime) || 0
  return endTime > 0 && endTime < now
}

export function applyExpiryGate(wagers, { includeExpired = false, now = Date.now() } = {}) {
  if (includeExpired) return wagers
  return wagers.filter(w => !isExpired(w, now))
}

function isCreator(wager, ownerAddress) {
  return lower(wager.creator) === lower(ownerAddress)
}

function isParticipant(wager, ownerAddress) {
  const addr = lower(ownerAddress)
  return (wager.participants || []).some(p => lower(p) === addr)
}

export function applyTabGate(wagers, { tab, ownerAddress }) {
  if (!tab || tab === 'all') return wagers
  return wagers.filter(w => {
    const status = lower(w.status)
    const terminal = TERMINAL_STATUSES.has(status)
    if (tab === 'history') return terminal
    if (terminal) return false
    if (tab === 'created') return isCreator(w, ownerAddress)
    if (tab === 'participating') {
      return isParticipant(w, ownerAddress) && !isCreator(w, ownerAddress)
    }
    return true
  })
}

export function applyTypeFilter(wagers, marketTypes) {
  if (!marketTypes?.length) return wagers
  const set = new Set(marketTypes.map(lower))
  return wagers.filter(w => set.has(lower(w.marketType)))
}

export function applyStatusFilter(wagers, statuses) {
  if (!statuses?.length) return wagers
  const set = new Set(statuses.map(lower))
  return wagers.filter(w => set.has(lower(w.status)))
}

export function applyResolutionTypeFilter(wagers, resolutionTypes) {
  if (!resolutionTypes?.length) return wagers
  const set = new Set(resolutionTypes.map(Number))
  return wagers.filter(w => set.has(Number(w.resolutionType)))
}

const STATUS_ORDER = [
  'pending_acceptance',
  'active',
  'pending_resolution',
  'challenged',
  'disputed',
  'resolved',
  'cancelled',
  'refunded',
  'oracle_timed_out',
]

function statusOrderIndex(status) {
  const idx = STATUS_ORDER.indexOf(lower(status))
  return idx === -1 ? STATUS_ORDER.length : idx
}

function resolutionOrderIndex(resolutionType) {
  const idx = ResolutionTypeOrder.indexOf(Number(resolutionType))
  return idx === -1 ? ResolutionTypeOrder.length : idx
}

function pad(n, width = 16) {
  return String(n).padStart(width, '0')
}

export function computeSortKey(wager, sortKey) {
  const id = pad(wager.id ?? '0')
  switch (sortKey) {
    case WagerSortKey.CREATED: {
      const createdAt = Number(wager.createdAt) || 0
      return `${pad(Number.MAX_SAFE_INTEGER - createdAt)}|${id}`
    }
    case WagerSortKey.ENDS: {
      const endTime = Number(wager.endTime) || 0
      return `${pad(Number.MAX_SAFE_INTEGER - endTime)}|${id}`
    }
    case WagerSortKey.RESOLUTION_TYPE: {
      const ri = resolutionOrderIndex(wager.resolutionType)
      const createdAt = Number(wager.createdAt) || 0
      return `${pad(ri, 4)}|${pad(Number.MAX_SAFE_INTEGER - createdAt)}|${id}`
    }
    case WagerSortKey.STATUS: {
      const si = statusOrderIndex(wager.status)
      const createdAt = Number(wager.createdAt) || 0
      return `${pad(si, 4)}|${pad(Number.MAX_SAFE_INTEGER - createdAt)}|${id}`
    }
    default:
      return id
  }
}

export function applySort(wagers, sortKey) {
  const keyed = wagers.map(w => ({ w, k: computeSortKey(w, sortKey) }))
  keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
  return keyed.map(({ w, k }) => ({ ...w, sortKey: k }))
}

export function applyCursor(sortedWagers, cursor) {
  if (!cursor?.lastSortKey) return sortedWagers
  const target = cursor.lastSortKey
  const idx = sortedWagers.findIndex(w => w.sortKey === target)
  if (idx === -1) return sortedWagers
  return sortedWagers.slice(idx + 1)
}

export function applyFilters(wagers, filter) {
  let out = wagers
  out = applyOwnershipGate(out, filter.ownerAddress)
  out = applyTabGate(out, { tab: filter.tab, ownerAddress: filter.ownerAddress })
  out = applyExpiryGate(out, { includeExpired: filter.includeExpired })
  out = applyTypeFilter(out, filter.marketTypes)
  out = applyStatusFilter(out, filter.statuses)
  out = applyResolutionTypeFilter(out, filter.resolutionTypes)
  return out
}

export function paginate(wagers, { cursor, pageSize = 25, sortKey = WagerSortKey.CREATED }) {
  const sorted = applySort(wagers, sortKey)
  const resumed = applyCursor(sorted, cursor)
  const items = resumed.slice(0, pageSize)
  const hasMore = resumed.length > pageSize
  const nextCursor = items.length > 0 && hasMore
    ? { sortKey, lastSortKey: items[items.length - 1].sortKey, pageSize }
    : null
  return { items, nextCursor, hasMore, totalKnown: wagers.length }
}
