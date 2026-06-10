/**
 * Wager activity store — account + chain scoped localStorage persistence for
 * the notification feed (spec 012-wager-notifications).
 *
 * Layout (specs/012-wager-notifications/contracts/storage-schema.md):
 *   fw_user_<lowercased address>_wager_activity_v1_<chainId> → ActivityStore
 *
 * Account scoping comes from utils/userStorage.js (always with
 * useLocalStorage = true); chain scoping is embedded in the feature key
 * because userStorage is not network-aware (FR-009).
 *
 * This module is the ONLY reader/writer of that key. loadStore/saveStore are
 * the only storage touchpoints — everything else is pure (no I/O, no
 * Date.now(), no randomness; time arrives as `nowMs`) and returns new store
 * objects rather than mutating inputs.
 *
 * Resilience (FR-012): a missing, corrupt, or wrong-version value resets to
 * the default store with a console.warn — never a thrown error or user-facing
 * failure, because badges and states re-derive from chain state.
 */

import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

const STORE_VERSION = 1
const MAX_ENTRIES = 100
const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** Canonical states with no further transitions (data-model.md). */
const TERMINAL_STATES = new Set([
  'resolved-claimable',
  'resolved-won-paid',
  'resolved-lost',
  'draw',
  'cancelled',
  'refunded',
])

/** Feature key handed to userStorage (which prepends `fw_user_<address>_`). */
function featureKey(chainId) {
  return `wager_activity_v1_${chainId}`
}

/**
 * Whether a raw value exists for (account, chainId). Mirrors userStorage's
 * documented key layout so loadStore can tell "missing" (silent default)
 * apart from "present but unparseable" (warn + default) — the helper returns
 * the default value for both cases.
 */
function hasStoredValue(account, chainId) {
  try {
    const key = `fw_user_${String(account).toLowerCase()}_${featureKey(chainId)}`
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural validation of a parsed store (version pinned to 1). */
function isValidStore(value) {
  return (
    isPlainObject(value) &&
    value.version === STORE_VERSION &&
    typeof value.lastPolledAt === 'number' &&
    isPlainObject(value.snapshots) &&
    Array.isArray(value.entries) &&
    isPlainObject(value.deadlineWarnings) &&
    typeof value.drawScanBlock === 'number'
  )
}

/**
 * A fresh, empty version-1 ActivityStore. New object on every call so
 * callers can never share (and accidentally mutate) a singleton.
 *
 * @returns {object} ActivityStore
 */
export function defaultStore() {
  return {
    version: STORE_VERSION,
    lastPolledAt: 0,
    snapshots: {},
    entries: [],
    deadlineWarnings: {},
    drawScanBlock: 0,
  }
}

/**
 * Load the ActivityStore for (account, chainId) from localStorage.
 *
 * Missing value, corrupt JSON, wrong version, or wrong shape all resolve to
 * `defaultStore()` — corruption and version mismatch additionally log a
 * console.warn. Never throws. Without an account, returns the default store
 * without touching storage at all.
 *
 * @param {string|null|undefined} account - Wallet address (any casing)
 * @param {number|string} chainId - Active chain id (e.g. 137)
 * @returns {object} ActivityStore
 */
export function loadStore(account, chainId) {
  if (!account) return defaultStore()

  const stored = getUserPreference(account, featureKey(chainId), null, true)
  if (stored === null) {
    if (hasStoredValue(account, chainId)) {
      console.warn('[activityStore] Corrupt activity store JSON — resetting to defaults')
    }
    return defaultStore()
  }
  if (!isValidStore(stored)) {
    console.warn('[activityStore] Unsupported activity store version or shape — resetting to defaults')
    return defaultStore()
  }
  return stored
}

/**
 * Persist the ActivityStore for (account, chainId) to localStorage, pruning
 * `entries` to the MAX_ENTRIES newest (entries are newest-first, so pruning
 * drops from the tail). The input store is not mutated. No-ops without an
 * account — a disconnected wallet never writes (FR-009 guarantee).
 *
 * @param {string|null|undefined} account - Wallet address (any casing)
 * @param {number|string} chainId - Active chain id
 * @param {object} store - ActivityStore to persist
 * @returns {void}
 */
export function saveStore(account, chainId, store) {
  if (!account) return
  const pruned = {
    ...store,
    entries: (store.entries || []).slice(0, MAX_ENTRIES),
  }
  saveUserPreference(account, featureKey(chainId), pruned, true)
}

/**
 * Append new ActivityEntry items to the feed, newest first.
 *
 * Dedup by `entry.id` (FR-010): an id already present in the store — or
 * earlier in the incoming batch — is never re-added; the existing entry wins
 * so read state and original copy are preserved. The result is capped at
 * MAX_ENTRIES, dropping the oldest from the tail.
 *
 * Pure: returns a new store; neither the input store nor its entries are
 * mutated.
 *
 * @param {object} store - ActivityStore
 * @param {object[]} entries - Candidate entries (rendered, newest first)
 * @returns {object} New ActivityStore
 */
export function appendEntries(store, entries) {
  const existing = store.entries || []
  const seen = new Set(existing.map((entry) => entry.id))
  const fresh = []
  for (const entry of entries || []) {
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    fresh.push(entry)
  }
  return {
    ...store,
    entries: [...fresh, ...existing].slice(0, MAX_ENTRIES),
  }
}

/** Build the entry predicate for a markRead ref. */
function entryMatcher(ref) {
  if (ref === '*') return () => true
  if (isPlainObject(ref)) {
    if (ref.entryId !== undefined) return (entry) => entry.id === ref.entryId
    if (ref.wagerId !== undefined) return (entry) => entry.wagerId === ref.wagerId
  }
  return () => false
}

/**
 * Mark feed entries read (FR-004).
 *
 * Ref forms:
 *   - `{ entryId }` — that single entry (user acknowledged it)
 *   - `{ wagerId }` — every entry for that wager (its detail view opened);
 *     `entryId` takes precedence if both are present
 *   - `'*'`         — everything (explicit "Mark all read" control)
 *
 * Unknown ref shapes match nothing. Pure: returns a new store; untouched
 * entries keep their identity, matched ones are replaced with read copies.
 *
 * @param {object} store - ActivityStore
 * @param {{entryId: string}|{wagerId: string}|'*'} ref - What to mark read
 * @returns {object} New ActivityStore
 */
export function markRead(store, ref) {
  const matches = entryMatcher(ref)
  const entries = (store.entries || []).map((entry) =>
    matches(entry) && !entry.read ? { ...entry, read: true } : entry
  )
  return { ...store, entries }
}

/**
 * Drop snapshots that are no longer needed as a diff baseline.
 *
 * A snapshot is pruned only when ALL of (storage-schema.md size-cap rule):
 *   - its wagerId is absent from `currentWagerIds` (not returned by the poll)
 *   - its state is terminal (no further transitions to announce)
 *   - it was snapped more than 30 days before `nowMs` (strictly older —
 *     terminal snapshots are kept short-term so terminal transitions aren't
 *     re-announced on the next poll)
 *
 * Pure: returns a new store with a new snapshots map.
 *
 * @param {object} store - ActivityStore
 * @param {(string|number)[]} currentWagerIds - Wager ids from the latest poll
 * @param {number} nowMs - Current time in ms (caller-supplied clock)
 * @returns {object} New ActivityStore
 */
export function pruneSnapshots(store, currentWagerIds, nowMs) {
  const current = new Set((currentWagerIds || []).map(String))
  const cutoff = Number(nowMs) - SNAPSHOT_RETENTION_MS
  const snapshots = {}
  for (const [wagerId, snapshot] of Object.entries(store.snapshots || {})) {
    const prunable =
      !current.has(String(wagerId)) &&
      TERMINAL_STATES.has(snapshot?.state) &&
      Number(snapshot?.snappedAt) < cutoff
    if (!prunable) snapshots[wagerId] = snapshot
  }
  return { ...store, snapshots }
}
