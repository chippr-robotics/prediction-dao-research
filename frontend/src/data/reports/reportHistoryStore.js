/**
 * Report history store — account + chain scoped localStorage persistence of
 * report METADATA only (spec 016-wager-tax-report, FR-010/FR-011/FR-012/FR-014;
 * contracts/report-history-store.md; research.md D4).
 *
 * Layout (mirrors data/notifications/activityStore.js):
 *   fw_user_<lowercased address>_tax_report_history_v1_<chainId> → Entry[]
 *
 * Only metadata is stored; the rendered document is regenerated on demand from
 * immutable chain data, so re-download reproduces equivalent content (FR-010).
 * A missing/corrupt value resolves to an empty list — never throws into the UI
 * (FR-012 resilience). Strictly scoped to (account, chainId): no cross-account
 * or cross-network reads/writes (FR-012/FR-014).
 */

import {
  getUserPreference,
  saveUserPreference,
  removeUserPreference,
} from '../../utils/userStorage'

const STORE_VERSION = 1

function featureKey(chainId) {
  return `tax_report_history_v1_${chainId}`
}

function genId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function isValidEntry(e) {
  return (
    e && typeof e === 'object' &&
    typeof e.id === 'string' &&
    typeof e.from === 'string' &&
    typeof e.to === 'string'
  )
}

/**
 * List history entries for (account, chainId), newest first. Returns [] for a
 * disconnected wallet, a missing store, or any corrupt/invalid value.
 *
 * @param {string|null|undefined} account
 * @param {number|string} chainId
 * @returns {object[]}
 */
export function list(account, chainId) {
  if (!account) return []
  const raw = getUserPreference(account, featureKey(chainId), null, true)
  if (!raw || typeof raw !== 'object' || raw.version !== STORE_VERSION || !Array.isArray(raw.entries)) {
    return []
  }
  return raw.entries.filter(isValidEntry)
}

function persist(account, chainId, entries) {
  saveUserPreference(account, featureKey(chainId), { version: STORE_VERSION, entries }, true)
}

/**
 * Add a history entry (called after a successful generation). Generates id +
 * createdAt when absent and stores the entry newest-first. No-ops without an
 * account. Returns the stored entry.
 *
 * @param {string} account
 * @param {number|string} chainId
 * @param {object} entry - { periodKind, from, to, label }
 * @returns {object|null}
 */
export function add(account, chainId, entry) {
  if (!account) return null
  const stored = {
    id: entry.id || genId(),
    periodKind: entry.periodKind || 'custom',
    from: String(entry.from),
    to: String(entry.to),
    label: entry.label || '',
    chainId: Number(chainId),
    createdAt: entry.createdAt || new Date().toISOString(),
  }
  const next = [stored, ...list(account, chainId)]
  persist(account, chainId, next)
  return stored
}

/**
 * Remove a single history entry by id (FR-011). The underlying wager data is
 * unaffected — only the metadata entry is dropped. No-ops without an account.
 *
 * @param {string} account
 * @param {number|string} chainId
 * @param {string} id
 * @returns {void}
 */
export function remove(account, chainId, id) {
  if (!account) return
  const next = list(account, chainId).filter((e) => e.id !== id)
  if (next.length === 0) {
    removeUserPreference(account, featureKey(chainId), true)
    return
  }
  persist(account, chainId, next)
}
