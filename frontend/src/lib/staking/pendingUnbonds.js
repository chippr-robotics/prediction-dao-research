/**
 * Pending unbond/withdrawal tracking (spec 065, data-model.md UnstakeRequest).
 *
 * Exits are two-step: request now, withdraw after a wait. The request handle —
 * a Lido withdrawal request id, or a sPOL / Polygon unbond nonce — is persisted
 * per (account, chain) so the "ready to withdraw" state survives reloads and
 * the notification source can detect maturity. Idempotent: re-adding a known
 * handle is a no-op; a claimed request is pruned.
 */
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

const FEATURE_KEY_PREFIX = 'staking_pending_unbonds_v1_'
const MAX_TRACKED = 50

function featureKey(chainId) {
  return `${FEATURE_KEY_PREFIX}${chainId}`
}

/** Stable identity for a request: option + its Lido requestId or unbond nonce. */
export function unbondKey(request) {
  const handle = request?.handle || {}
  const h = handle.requestId != null ? `req:${handle.requestId}` : `nonce:${handle.unbondNonce}`
  return `${request.optionId}:${h}`
}

/** List the pending unstake requests for (account, chain). */
export function listPendingUnbonds(account, chainId) {
  if (!account || !chainId) return []
  return getUserPreference(account, featureKey(chainId), [], true) || []
}

/**
 * Add a pending request (idempotent by unbondKey). `request` shape:
 * { optionId, model, handle: { requestId } | { unbondNonce },
 *   amountRaw, initiatedAt, readyAt? }
 */
export function addPendingUnbond(account, chainId, request) {
  if (!account || !chainId || !request?.optionId || !request?.handle) return
  const key = unbondKey(request)
  const existing = listPendingUnbonds(account, chainId)
  if (existing.some((r) => unbondKey(r) === key)) return
  const next = [...existing, request].slice(-MAX_TRACKED)
  saveUserPreference(account, featureKey(chainId), next, true)
}

/** Remove a request once withdrawn/claimed. */
export function prunePendingUnbond(account, chainId, request) {
  if (!account || !chainId || !request) return
  const key = unbondKey(request)
  const existing = listPendingUnbonds(account, chainId)
  const next = existing.filter((r) => unbondKey(r) !== key)
  if (next.length !== existing.length) saveUserPreference(account, featureKey(chainId), next, true)
}
