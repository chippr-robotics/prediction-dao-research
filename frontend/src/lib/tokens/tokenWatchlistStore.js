/**
 * Token watchlist pure data layer (Spec 034).
 *
 * Framework-agnostic schema + CRUD over a plain Watchlist object, plus thin
 * load/save helpers around utils/userStorage.js (per-wallet localStorage). All
 * operations except load/save are pure and return a NEW list (never mutate).
 *
 * Entry identity is (lowercase(address), chainId): the same token on two
 * networks is two distinct entries (FR-007). The watchlist is a set of
 * references; merge is an idempotent union with no user-facing conflicts
 * (FR-015) — unlike the address book, there is no editable per-entry field to
 * conflict on.
 */

import { isAddress } from 'ethers'
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'
import { STORAGE_KEY, SCHEMA_VERSION, MAX_SYMBOL_LENGTH, MAX_NAME_LENGTH } from './constants'

/** Stable identity key for a watched token. */
export function entryKey(address, chainId) {
  return `${String(address).toLowerCase()}:${Number(chainId)}`
}

/** @returns {Watchlist} */
export function createEmptyWatchlist() {
  return { schemaVersion: SCHEMA_VERSION, entries: [], updatedAt: Date.now() }
}

function isValidEntry(e) {
  return Boolean(e) && isAddress(String(e.address)) && Number.isFinite(Number(e.chainId))
}

/** Coerce an entry into the canonical persisted shape. */
export function normalizeEntry(e) {
  const dec = Number(e?.decimals)
  return {
    address: String(e.address).toLowerCase(),
    chainId: Number(e.chainId),
    source: e?.source === 'registry' ? 'registry' : 'custom',
    symbol: String(e?.symbol ?? '').slice(0, MAX_SYMBOL_LENGTH),
    name: String(e?.name ?? '').slice(0, MAX_NAME_LENGTH),
    decimals: Number.isInteger(dec) && dec >= 0 && dec <= 255 ? dec : 18,
    addedAt: Number(e?.addedAt) || Date.now(),
  }
}

function cloneList(list) {
  return {
    schemaVersion: list?.schemaVersion ?? SCHEMA_VERSION,
    entries: (list?.entries || []).map((e) => ({ ...e })),
    updatedAt: list?.updatedAt ?? Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Persistence (the only impure functions)
// ---------------------------------------------------------------------------

/**
 * Load the watchlist for an owner; returns a valid empty list on miss/parse
 * failure. Defensively drops malformed/untagged entries rather than throwing.
 * @param {string} ownerAddress
 * @returns {Watchlist}
 */
export function loadWatchlist(ownerAddress) {
  if (!ownerAddress) return createEmptyWatchlist()
  const raw = getUserPreference(ownerAddress, STORAGE_KEY, null, true)
  if (!raw || !Array.isArray(raw.entries)) return createEmptyWatchlist()
  const seen = new Set()
  const entries = []
  for (const e of raw.entries) {
    if (!isValidEntry(e)) continue
    const ne = normalizeEntry(e)
    const k = entryKey(ne.address, ne.chainId)
    if (seen.has(k)) continue
    seen.add(k)
    entries.push(ne)
  }
  return { schemaVersion: SCHEMA_VERSION, entries, updatedAt: raw.updatedAt || Date.now() }
}

/**
 * Persist the watchlist for an owner (localStorage via userStorage).
 * @param {string} ownerAddress
 * @param {Watchlist} list
 */
export function saveWatchlist(ownerAddress, list) {
  if (!ownerAddress) throw new Error('Wallet address is required')
  saveUserPreference(ownerAddress, STORAGE_KEY, { ...list, updatedAt: Date.now() }, true)
}

// ---------------------------------------------------------------------------
// Pure operations
// ---------------------------------------------------------------------------

/**
 * Add a watched token. Dedupes by (address, chainId) (FR-010). Throws on an
 * invalid address/chainId (FR-011 — callers resolve metadata before calling).
 * @returns {Watchlist}
 */
export function addEntry(list, entry) {
  if (!isValidEntry(entry)) throw new Error('Invalid token entry')
  const next = cloneList(list)
  const ne = normalizeEntry(entry)
  const k = entryKey(ne.address, ne.chainId)
  if (next.entries.some((e) => entryKey(e.address, e.chainId) === k)) return next // no-op (FR-010)
  next.entries.push(ne)
  next.updatedAt = Date.now()
  return next
}

/** Remove a watched token by identity (FR-009). */
export function removeEntry(list, address, chainId) {
  const next = cloneList(list)
  const k = entryKey(address, chainId)
  next.entries = next.entries.filter((e) => entryKey(e.address, e.chainId) !== k)
  next.updatedAt = Date.now()
  return next
}

/** Whether an (address, chainId) is already watched. */
export function isWatched(list, address, chainId) {
  const k = entryKey(address, chainId)
  return (list?.entries || []).some((e) => entryKey(e.address, e.chainId) === k)
}

// ---------------------------------------------------------------------------
// Merge (restore/import) — idempotent union, no conflicts (FR-015)
// ---------------------------------------------------------------------------

/**
 * Additive union of two watchlists keyed on (address, chainId). When the same
 * token exists on both sides the earliest `addedAt` wins; nothing is deleted.
 * Returns `conflicts: []` always — a reference set has no field to conflict on.
 *
 * @returns {{ value: Watchlist, conflicts: [] }}
 */
export function mergeWatchlists(current, incoming) {
  const next = cloneList(current)
  const index = new Map()
  next.entries.forEach((e, i) => index.set(entryKey(e.address, e.chainId), i))

  for (const inc of incoming?.entries || []) {
    if (!isValidEntry(inc)) continue
    const ne = normalizeEntry(inc)
    const k = entryKey(ne.address, ne.chainId)
    const at = index.get(k)
    if (at === undefined) {
      index.set(k, next.entries.length)
      next.entries.push(ne)
    } else {
      // Keep the earliest addedAt so ordering is stable across restores.
      const existing = next.entries[at]
      if (ne.addedAt < existing.addedAt) next.entries[at] = { ...existing, addedAt: ne.addedAt }
    }
  }
  next.updatedAt = Date.now()
  return { value: next, conflicts: [] }
}

/**
 * @typedef {Object} WatchlistEntry
 * @property {string} address  lowercased contract address
 * @property {number} chainId
 * @property {'registry'|'custom'} source
 * @property {string} symbol
 * @property {string} name
 * @property {number} decimals
 * @property {number} addedAt
 *
 * @typedef {Object} Watchlist
 * @property {number} schemaVersion
 * @property {WatchlistEntry[]} entries
 * @property {number} updatedAt
 */
