/**
 * Host-side reader for ClearPath's device-tracked DAOs (spec 042 · spec 073 T028).
 *
 * ClearPath is a mini-app now, so its tracked-DAO list lives in the app's namespaced host store
 * (`miniapp_clearpath_v1`) rather than in a raw localStorage key of its own. The notification
 * source still needs to read it — a DAO the member tracked must still raise "a new proposal is
 * open" — and that source is HOST code, not app code.
 *
 * READING AN APP'S NAMESPACE FROM HERE IS LEGITIMATE, and worth saying plainly because it looks
 * like the thing FR-018 forbids. It is not: the isolation rule is that a mini-app cannot reach
 * another app's namespace, enforced by never handing a package anything that names one. The host
 * IMPLEMENTS those namespaces. This module is the host reading its own storage, the same way it
 * reads the address book.
 *
 * Read-only on purpose. Writes belong to the app that owns the data.
 */

import { createAppStore } from '../miniapps/store'

/** The app id ClearPath is published under; also its store namespace root. */
export const CLEARPATH_APP_ID = 'clearpath'

/** Store key inside that namespace: `{ [chainId]: Entry[] }`. */
export const TRACKED_KEY = 'tracked'

const norm = (a) => String(a || '').toLowerCase()

/**
 * Every DAO tracked device-local for (chainId, account), newest first.
 *
 * Signature-compatible with the module this replaces, so `daoSource` did not have to change shape
 * — only where it imports from.
 */
export function list(chainId, account) {
  if (chainId == null || !account) return []
  let byChain
  try {
    byChain = createAppStore(account, CLEARPATH_APP_ID).get(TRACKED_KEY, null)
  } catch {
    // A malformed app id cannot happen for a constant, but the store throws rather than guessing
    // and a notification poll must never take the feed down.
    return []
  }
  const entries = byChain?.[String(chainId)]
  if (!Array.isArray(entries)) return []
  return entries
    .filter((e) => e && e.address)
    .slice()
    .reverse()
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
}

/** Whether `address` is tracked in this scope (case-insensitive). */
export function has(chainId, account, address) {
  const target = norm(address)
  return list(chainId, account).some((e) => norm(e.address) === target)
}
