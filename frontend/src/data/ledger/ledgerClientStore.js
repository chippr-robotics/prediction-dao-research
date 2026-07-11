/**
 * ledgerClientStore — the durable home of client-only ledger records
 * (spec 051, data-model.md "ClientLedgerRecord").
 *
 * Holds the `cl:` provenance subset of the ledger: activity that exists only
 * on this device (failed gasless ops, client-captured earn actions, transfer
 * history) and therefore travels in the spec-032 encrypted backup. Records
 * are APPEND-ONLY (FR-008): a status transition appends a superseding record
 * (`refs.supersedes`) — nothing is ever mutated or deleted in place; readers
 * resolve chains to the latest record while the full chain stays readable
 * for audit.
 *
 * Persistence: localStorage via userStorage (per-account), one feature key
 * per chainId (the activityStore convention). Writes never throw into the
 * caller — activity capture must never break the action that produced it.
 *
 * Retention: no cap by default. `pruneClientRecords` exists as a disclosed
 * size guard that records a `prunedBefore` marker and REFUSES any cutoff
 * inside the current or previous tax year (FR-013).
 */
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

const STORE_VERSION = 1

function featureKey(chainId) {
  return `activity_ledger_v1_${chainId}`
}

function defaultStore() {
  return { version: STORE_VERSION, records: [], prunedBefore: null }
}

function loadStore(account, chainId) {
  if (!account) return defaultStore()
  const stored = getUserPreference(account, featureKey(chainId), null, true)
  if (
    stored &&
    typeof stored === 'object' &&
    stored.version === STORE_VERSION &&
    Array.isArray(stored.records)
  ) {
    return stored
  }
  if (stored !== null) {
    console.warn('[ledgerClientStore] Unsupported store shape — resetting to defaults')
  }
  return defaultStore()
}

function saveStore(account, chainId, store) {
  if (!account) return
  try {
    saveUserPreference(account, featureKey(chainId), store, true)
  } catch {
    // Storage full/disabled — capture is best-effort and must never break the
    // action that produced the record (transferStore rule).
  }
}

/**
 * Append one client record. No-op if the entryId already exists (append-only:
 * identical ids are identical records; the original always wins). Never throws.
 * @param {string} account
 * @param {object} record - full ClientLedgerRecord including entryId + chainId
 */
export function appendClientRecord(account, record) {
  if (!account || !record?.entryId || record.chainId == null) return
  try {
    const chainId = Number(record.chainId)
    const store = loadStore(account, chainId)
    if (store.records.some((r) => r.entryId === record.entryId)) return
    const next = {
      ...store,
      records: [...store.records, { ...record, recordedAt: record.recordedAt ?? Date.now() }],
    }
    saveStore(account, chainId, next)
  } catch {
    // never throw into the caller
  }
}

/** Raw append-only history (audit view) for (account, chainId). */
export function listAllClientRecords(account, chainId) {
  return loadStore(account, chainId).records
}

/**
 * Latest record per supersede chain: a record is shadowed when another record
 * names it in `refs.supersedes`. Chains stay short (pending → complete/failed),
 * so a single shadowed-set pass resolves them.
 */
export function listClientRecords(account, chainId) {
  const records = listAllClientRecords(account, chainId)
  const shadowed = new Set()
  for (const r of records) {
    if (r?.refs?.supersedes) shadowed.add(r.refs.supersedes)
  }
  return records.filter((r) => !shadowed.has(r.entryId))
}

/** FR-013 disclosure marker — epoch ms records were pruned before, or null. */
export function getPrunedBefore(account, chainId) {
  return loadStore(account, chainId).prunedBefore ?? null
}

/**
 * Disclosed size guard (FR-013). Refuses any cutoff that would touch the
 * current or previous tax year; otherwise drops records older than cutoff
 * (by timestamp, falling back to recordedAt) and records `prunedBefore`.
 * @returns {{pruned: number}}
 */
export function pruneClientRecords(account, chainId, { cutoffMs, nowMs = Date.now() } = {}) {
  if (!account || !Number.isFinite(Number(cutoffMs))) return { pruned: 0 }
  const previousTaxYearStart = Date.UTC(new Date(nowMs).getUTCFullYear() - 1, 0, 1)
  if (cutoffMs > previousTaxYearStart) return { pruned: 0 }

  const store = loadStore(account, chainId)
  const keep = store.records.filter((r) => {
    const ts = r.timestamp ?? r.recordedAt ?? Infinity
    return ts >= cutoffMs
  })
  const pruned = store.records.length - keep.length
  if (pruned > 0 || store.prunedBefore !== cutoffMs) {
    saveStore(account, chainId, { ...store, records: keep, prunedBefore: cutoffMs })
  }
  return { pruned }
}

/**
 * Replace-or-merge the full client record set from a backup restore.
 * Append-only union by entryId — existing records always survive, incoming
 * new ids are added (FR-011: identical ids are identical records).
 * @returns {{added: number}}
 */
export function mergeClientRecords(account, chainId, incoming = []) {
  if (!account) return { added: 0 }
  const store = loadStore(account, chainId)
  const have = new Set(store.records.map((r) => r.entryId))
  const fresh = (incoming || []).filter((r) => r?.entryId && !have.has(r.entryId))
  if (fresh.length > 0) {
    saveStore(account, chainId, { ...store, records: [...store.records, ...fresh] })
  }
  return { added: fresh.length }
}

/**
 * All client records for the account across every chain (flat array; each
 * record carries its chainId) — the spec-032 backup payload. Chain ids are
 * discovered from the account's storage keys so no network registry is needed.
 */
export function listClientRecordsAllChains(account) {
  if (!account || typeof localStorage === 'undefined') return []
  const prefix = `fw_user_${String(account).toLowerCase()}_activity_ledger_v1_`
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(prefix)) continue
    const chainId = Number(key.slice(prefix.length))
    if (Number.isFinite(chainId)) out.push(...listAllClientRecords(account, chainId))
  }
  return out
}

/**
 * Merge a flat cross-chain record array (from a backup) into the store.
 * Append-only union by entryId per chain (FR-011). Both restore modes use
 * this — "replace" would delete history and violate FR-008.
 * @returns {{added: number}}
 */
export function mergeClientRecordsAllChains(account, incoming = []) {
  const byChain = new Map()
  for (const r of incoming || []) {
    if (!r?.entryId || r.chainId == null) continue
    const cid = Number(r.chainId)
    if (!byChain.has(cid)) byChain.set(cid, [])
    byChain.get(cid).push(r)
  }
  let added = 0
  for (const [chainId, records] of byChain) {
    added += mergeClientRecords(account, chainId, records).added
  }
  return { added }
}

/** Test/util seam: wipe every account's client ledger (localStorage scan). */
export function __clearClientLedger() {
  if (typeof localStorage === 'undefined') return
  const doomed = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.includes('_activity_ledger_')) doomed.push(key)
  }
  doomed.forEach((k) => localStorage.removeItem(k))
}
