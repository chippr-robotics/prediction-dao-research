/**
 * Staking action buffer (spec 065, FR-011). Mirrors lib/earn/earnActivityBuffer.
 *
 * Stake / unstake / withdraw / claim flows record what the member just did
 * (with the tx hash) here; the staking ActivitySource drains the buffer on its
 * next detect cycle and turns each record into a feed entry with an explorer
 * link. Routing records through the source keeps all activity-store writes
 * inside the poll while still giving user actions their exact tx link.
 *
 * Persistence is account+chain scoped localStorage so a pending record survives
 * a reload between action and poll.
 */
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

const FEATURE_KEY_PREFIX = 'staking_pending_actions_v1_'
const MAX_BUFFERED = 20

function featureKey(chainId) {
  return `${FEATURE_KEY_PREFIX}${chainId}`
}

/**
 * Queue one action record:
 * { type: 'stake'|'unstake-requested'|'withdraw'|'rewards-claimed',
 *   refId, optionId, message, txHash, txUrl, at }
 */
export function queueStakingAction(account, chainId, record) {
  if (!account || !chainId || !record?.type || !record?.txHash) return
  const existing = getUserPreference(account, featureKey(chainId), [], true) || []
  const next = [...existing.filter((r) => r.txHash !== record.txHash), record].slice(-MAX_BUFFERED)
  saveUserPreference(account, featureKey(chainId), next, true)
}

/** Read-and-clear the pending records for (account, chain). */
export function drainStakingActions(account, chainId) {
  if (!account || !chainId) return []
  const records = getUserPreference(account, featureKey(chainId), [], true) || []
  if (records.length > 0) saveUserPreference(account, featureKey(chainId), [], true)
  return records
}

/** Peek without clearing (tests / diagnostics). */
export function peekStakingActions(account, chainId) {
  if (!account || !chainId) return []
  return getUserPreference(account, featureKey(chainId), [], true) || []
}
