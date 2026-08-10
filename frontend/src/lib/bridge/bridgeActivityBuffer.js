/**
 * Bridge notification buffer (spec 067, T111 / FR-037). Mirrors
 * lib/earn/earnActivityBuffer and lib/staking/stakingActivityBuffer.
 *
 * `reconcileBridge` is the ONLY place a bridge changes state (bridgeStatus.js), and it runs
 * from two callers: the open Bridge surface's poll, and the notification poll's bridge
 * ActivitySource. Whichever observes a transition first records it here; the source drains the
 * buffer on its next cycle and turns each record into a feed entry.
 *
 * Routing the records through the source keeps ALL activity-store writes inside the engine's
 * poll (no racing it from a UI timer) while still giving the member the exact transition that
 * happened, with its transaction link.
 *
 * Two properties matter more here than in the earn/staking buffers:
 *
 *   1. **One record per transition, ever.** `reconcileBridge` only calls the emitter when the
 *      new state was actually APPLIED to the ledger, and the ledger refuses to re-apply a state
 *      it already holds — so a re-poll cannot re-notify. The de-dup key below (`bridge + state`)
 *      is a second guard for the case where both pollers observe the same transition in the
 *      same window before either drains.
 *   2. **Nothing is invented on drain.** A record carries the finished message; the source does
 *      no re-derivation and never upgrades a state.
 *
 * Persistence is account+chain scoped localStorage, so a transition observed just before a
 * reload still becomes a notification after it.
 */
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

const FEATURE_KEY_PREFIX = 'bridge_pending_notifications_v1_'
const MAX_BUFFERED = 20

function featureKey(chainId) {
  return `${FEATURE_KEY_PREFIX}${chainId}`
}

/** Identity of a transition: one bridge reaches one state exactly once. */
function dedupKey(record) {
  return `${record?.refId || ''}:${record?.state || ''}`
}

/**
 * Queue one bridge transition record:
 * { type, state, refId, depositId, message, severity, actionable, txHash, txUrl, at }
 *
 * Ignores anything without a bridge reference and a state — an unattributable notification is
 * worse than none.
 */
export function queueBridgeNotification(account, chainId, record) {
  if (!account || !chainId || !record?.type || !record?.refId || !record?.state) return
  const existing = getUserPreference(account, featureKey(chainId), [], true) || []
  const key = dedupKey(record)
  const next = [...existing.filter((r) => dedupKey(r) !== key), record].slice(-MAX_BUFFERED)
  saveUserPreference(account, featureKey(chainId), next, true)
}

/** Read-and-clear the pending records for (account, chain). */
export function drainBridgeNotifications(account, chainId) {
  if (!account || !chainId) return []
  const records = getUserPreference(account, featureKey(chainId), [], true) || []
  if (records.length > 0) saveUserPreference(account, featureKey(chainId), [], true)
  return records
}

/** Peek without clearing (tests / diagnostics). */
export function peekBridgeNotifications(account, chainId) {
  if (!account || !chainId) return []
  return getUserPreference(account, featureKey(chainId), [], true) || []
}
