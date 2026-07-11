/**
 * Earn action buffer (spec 050, FR-010).
 *
 * Deposit / withdraw / claim flows record what the member just did (with the
 * tx hash) here; the earn ActivitySource drains the buffer on its next detect
 * cycle and turns each record into a feed entry with an explorer link. Routing
 * the records through the source keeps ALL activity-store writes inside the
 * poll (no racing the engine) while still giving user actions their exact tx
 * link instead of a generic snapshot-diff message. Flows call the activity
 * context's refresh() right after queueing so the entry lands immediately.
 *
 * Persistence is account+chain scoped localStorage (same convention as the
 * activity store) so a pending record survives a reload between action and
 * poll.
 */
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

const FEATURE_KEY_PREFIX = 'earn_pending_actions_v1_'
const MAX_BUFFERED = 20

function featureKey(chainId) {
  return `${FEATURE_KEY_PREFIX}${chainId}`
}

/**
 * Queue one action record:
 * { type: 'earn-deposit'|'earn-withdraw'|'earn-rewards-claimed',
 *   refId, message, txHash, txUrl, at }
 */
export function queueEarnAction(account, chainId, record) {
  if (!account || !chainId || !record?.type || !record?.txHash) return
  const existing = getUserPreference(account, featureKey(chainId), [], true) || []
  const next = [...existing.filter((r) => r.txHash !== record.txHash), record].slice(-MAX_BUFFERED)
  saveUserPreference(account, featureKey(chainId), next, true)
}

/** Read-and-clear the pending records for (account, chain). */
export function drainEarnActions(account, chainId) {
  if (!account || !chainId) return []
  const records = getUserPreference(account, featureKey(chainId), [], true) || []
  if (records.length > 0) saveUserPreference(account, featureKey(chainId), [], true)
  return records
}

/** Peek without clearing (tests / diagnostics). */
export function peekEarnActions(account, chainId) {
  if (!account || !chainId) return []
  return getUserPreference(account, featureKey(chainId), [], true) || []
}
