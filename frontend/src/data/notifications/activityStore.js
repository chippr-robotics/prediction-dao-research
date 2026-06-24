/**
 * Platform activity store — account + chain scoped localStorage persistence for the unified notification feed
 * (spec 031-platform-notifications; generalizes spec 012's wager-only store).
 *
 * Layout (specs/031-platform-notifications/contracts/store-schema.md):
 *   fw_user_<lowercased address>_platform_activity_v1_<chainId> → ActivityStore
 *
 * Account scoping comes from utils/userStorage.js (always useLocalStorage=true); chain scoping is embedded in
 * the feature key because userStorage is not network-aware.
 *
 * The store is partitioned by source key so any domain can plug in:
 *   { version, lastPolledAt, entries: ActivityEntry[], sources: { [key]: { snapshots, aux } } }
 *
 * This module is the ONLY reader/writer of that key. loadStore/saveStore are the only storage touchpoints —
 * everything else is pure (no I/O, no Date.now(), no randomness; time arrives as `nowMs`) and returns new
 * store objects rather than mutating inputs.
 *
 * Resilience (Constitution III): a missing, corrupt, or wrong-version value resets to the default store with a
 * console.warn — never a thrown error or user-facing failure, because badges/states re-derive from chain state.
 * A one-time migration lifts a legacy spec-012 wager store into the `wagers` partition so read-state survives.
 */

import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

const STORE_VERSION = 1
const MAX_ENTRIES = 100
export const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** Feature key handed to userStorage (which prepends `fw_user_<address>_`). */
function featureKey(chainId) {
  return `platform_activity_v1_${chainId}`
}
/** Legacy spec-012 wager-only key, read once for migration. */
function legacyWagerKey(chainId) {
  return `wager_activity_v1_${chainId}`
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural validation of a parsed platform store (version pinned to 1). */
function isValidStore(value) {
  return (
    isPlainObject(value) &&
    value.version === STORE_VERSION &&
    typeof value.lastPolledAt === 'number' &&
    Array.isArray(value.entries) &&
    isPlainObject(value.sources)
  )
}

/** Structural validation of a legacy spec-012 wager store (for migration only). */
function isValidLegacyWagerStore(value) {
  return (
    isPlainObject(value) &&
    value.version === 1 &&
    typeof value.lastPolledAt === 'number' &&
    isPlainObject(value.snapshots) &&
    Array.isArray(value.entries) &&
    isPlainObject(value.deadlineWarnings)
  )
}

/**
 * A fresh, empty version-1 ActivityStore. New object on every call so callers can never share (and
 * accidentally mutate) a singleton.
 * @returns {object} ActivityStore
 */
export function defaultStore() {
  return {
    version: STORE_VERSION,
    lastPolledAt: 0,
    entries: [],
    sources: {},
  }
}

/**
 * Lift a legacy spec-012 wager store into the generalized shape: entries stamped `domain:'wagers'` + `refId`,
 * snapshots → `sources.wagers.snapshots`, deadlineWarnings → `sources.wagers.aux`. Read-state preserved.
 * `drawScanBlock` dropped (unused since spec 017). Pure.
 * @param {object} legacy - validated legacy wager store
 * @returns {object} platform ActivityStore
 */
export function migrateLegacyWagerStore(legacy) {
  const entries = (legacy.entries || []).map((e) => ({
    ...e,
    domain: e.domain || 'wagers',
    refId: e.refId != null ? e.refId : e.wagerId != null ? String(e.wagerId) : undefined,
  }))
  return {
    version: STORE_VERSION,
    lastPolledAt: typeof legacy.lastPolledAt === 'number' ? legacy.lastPolledAt : 0,
    entries,
    sources: {
      wagers: { snapshots: legacy.snapshots || {}, aux: legacy.deadlineWarnings || {} },
    },
  }
}

/**
 * Load the ActivityStore for (account, chainId) from localStorage.
 *
 * Order: a valid platform store wins; else a one-time migration from a valid legacy wager store (persisted
 * under the new key); else `defaultStore()`. Corruption/version mismatch logs a console.warn. Never throws.
 * Without an account, returns the default store without touching storage.
 *
 * @param {string|null|undefined} account
 * @param {number|string} chainId
 * @returns {object} ActivityStore
 */
export function loadStore(account, chainId) {
  if (!account) return defaultStore()

  const stored = getUserPreference(account, featureKey(chainId), null, true)
  if (stored !== null) {
    if (isValidStore(stored)) return stored
    console.warn('[activityStore] Unsupported platform activity store version or shape — resetting to defaults')
    return defaultStore()
  }

  // No platform store yet — attempt a one-time migration from the legacy spec-012 wager store.
  const legacy = getUserPreference(account, legacyWagerKey(chainId), null, true)
  if (legacy !== null && isValidLegacyWagerStore(legacy)) {
    const migrated = migrateLegacyWagerStore(legacy)
    saveStore(account, chainId, migrated)
    return migrated
  }
  return defaultStore()
}

/**
 * Persist the ActivityStore for (account, chainId), pruning `entries` to the MAX_ENTRIES newest (entries are
 * newest-first). The input store is not mutated. No-ops without an account (a disconnected wallet never writes).
 * @returns {void}
 */
export function saveStore(account, chainId, store) {
  if (!account) return
  const pruned = { ...store, entries: (store.entries || []).slice(0, MAX_ENTRIES) }
  saveUserPreference(account, featureKey(chainId), pruned, true)
}

/**
 * Append new ActivityEntry items to the merged feed, newest first. Dedup by `entry.id` GLOBALLY across
 * domains: an id already present (or earlier in the incoming batch) is never re-added; the existing entry wins
 * so read state + original copy are preserved. Capped at MAX_ENTRIES. Pure.
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
  return { ...store, entries: [...fresh, ...existing].slice(0, MAX_ENTRIES) }
}

/** Build the entry predicate for a markRead ref. */
function entryMatcher(ref) {
  if (ref === '*') return () => true
  if (isPlainObject(ref)) {
    if (ref.entryId !== undefined) return (entry) => entry.id === ref.entryId
    if (ref.refId !== undefined) return (entry) => entry.refId === ref.refId
  }
  return () => false
}

/**
 * Mark feed entries read. Ref forms: `'*'` (all), `{ entryId }` (one entry; precedence), `{ refId }` (every
 * entry for that domain object). Unknown shapes match nothing. Pure: only unread matches are replaced.
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
 * Replace one source's partition (snapshots + aux). Pure.
 * @returns {object} New ActivityStore
 */
export function setSourceSlice(store, key, slice) {
  return {
    ...store,
    sources: { ...(store.sources || {}), [key]: { snapshots: slice?.snapshots || {}, aux: slice?.aux || {} } },
  }
}

/** Read one source's prior partition (never undefined). */
export function getSourceSlice(store, key) {
  return (store.sources && store.sources[key]) || { snapshots: {}, aux: {} }
}

/**
 * Prune a snapshot MAP (not a store): drop a snapshot only when absent-from-this-cycle AND terminal AND
 * older than `SNAPSHOT_RETENTION_MS`. Terminal-ness is domain-specific, so the source supplies `isTerminal`.
 * Pure helper sources reuse to manage their own retention (keeps domain semantics out of the generic store).
 * @param {object} snapshots - map { [refId]: snapshot }
 * @param {(string|number)[]} currentIds - ids seen this cycle
 * @param {number} nowMs
 * @param {(snapshot:object)=>boolean} isTerminal
 * @param {(snapshot:object)=>number} snappedAtOf - reads the snapshot's timestamp (default `.snappedAt`)
 * @returns {object} new snapshots map
 */
export function pruneSnapshotMap(snapshots, currentIds, nowMs, isTerminal, snappedAtOf = (s) => s?.snappedAt) {
  const current = new Set((currentIds || []).map(String))
  const cutoff = Number(nowMs) - SNAPSHOT_RETENTION_MS
  const out = {}
  for (const [refId, snapshot] of Object.entries(snapshots || {})) {
    const prunable =
      !current.has(String(refId)) &&
      isTerminal(snapshot) &&
      Number(snappedAtOf(snapshot)) < cutoff
    if (!prunable) out[refId] = snapshot
  }
  return out
}
