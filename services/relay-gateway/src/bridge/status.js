/**
 * Across deposit-status client + normalization for /v1/bridge/:chainId/status (spec 067, US1).
 *
 * Uses the same client as quotes.js (createAcrossClient) — this module owns only the deposit-status
 * path, its validation, and the mapping from Across's vocabulary to the spec's bridge states.
 *
 * HONEST STATE IS THE POINT OF THIS FILE. FR-009 says a bridge is never shown or counted as complete
 * until the destination chain has delivered, and the data model makes `delivered` reachable only from
 * destination-side evidence. So the mapping is not a straight rename of the upstream string:
 * `delivered` is returned ONLY when the response carries a destination fill transaction hash, and
 * `refunded` ONLY when it carries a refund transaction hash. An upstream `filled` with no fill tx is
 * reported as still in flight — an under-claim, which is the safe direction.
 *
 * Unknown upstream vocabulary is reported as `state: null` with the raw `upstreamStatus` preserved,
 * so a new Across status renders as "unknown" rather than being coerced into a state we cannot
 * justify (FR-054). Only a body with no readable status at all is treated as malformed.
 *
 * This endpoint is a CONVENIENCE, not the authority: the client falls back to reading
 * `FundsDeposited` / `FilledV3Relay` on chain when the gateway is unavailable (research R7), which
 * is what makes an in-flight bridge survive a gateway outage.
 */

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/
const DEPOSIT_ID_RE = /^\d{1,78}$/

/** The states this module may report. `needs_attention` is a CLIENT-side clock decision, not ours. */
export const BRIDGE_STATES = {
  IN_FLIGHT: 'in_flight',
  DELIVERED: 'delivered',
  REFUNDED: 'refunded',
  EXPIRED: 'expired',
}

/** Across deposit ids are unsigned integers, passed through as decimal strings. */
export const isDepositId = (v) => typeof v === 'string' && DEPOSIT_ID_RE.test(v)

const txHash = (v) => (typeof v === 'string' && TX_HASH_RE.test(v) ? v : null)

/** First readable tx hash among several candidate field names (the API has renamed these). */
const firstHash = (...candidates) => candidates.map(txHash).find((h) => h != null) ?? null

/**
 * Map an Across `/deposit/status` body to the gateway DTO, or `null` when it is unusable.
 *
 * @param {unknown} body raw upstream JSON
 * @returns {{state: string|null, upstreamStatus: string, fillTxHash: string|null,
 *   refundTxHash: string|null, depositTxHash: string|null, destinationChainId: number|null}|null}
 */
export function normalizeDepositStatus(body) {
  if (!body || typeof body !== 'object') return null
  const upstreamStatus = typeof body.status === 'string' && body.status.trim() !== '' ? body.status.trim() : null
  if (upstreamStatus == null) return null

  const fillTxHash = firstHash(body.fillTx, body.fillTxHash, body.fillTransactionHash)
  const refundTxHash = firstHash(body.depositRefundTxHash, body.refundTxHash)
  const depositTxHash = firstHash(body.depositTxHash, body.depositTx)
  const destinationChainId = Number.isSafeInteger(Number(body.destinationChainId)) && Number(body.destinationChainId) > 0
    ? Number(body.destinationChainId)
    : null

  let state
  switch (upstreamStatus) {
    case 'filled':
      // FR-009: delivered requires destination-side evidence. A `filled` with no fill tx to point at
      // is not yet provable, so it stays in flight until the hash appears.
      state = fillTxHash ? BRIDGE_STATES.DELIVERED : BRIDGE_STATES.IN_FLIGHT
      break
    case 'refunded':
      // Same rule on the other terminal outcome: a refund is only a refund once it has a tx.
      state = refundTxHash ? BRIDGE_STATES.REFUNDED : BRIDGE_STATES.EXPIRED
      break
    case 'expired':
      // Past its fillDeadline and unfilled: the member's funds are refundable on the ORIGIN chain to
      // the depositor — which is the member, never the router (research R2). Promoted to `refunded`
      // by a later poll once the refund tx exists.
      state = refundTxHash ? BRIDGE_STATES.REFUNDED : BRIDGE_STATES.EXPIRED
      break
    case 'pending':
    case 'slowFillRequested':
      state = BRIDGE_STATES.IN_FLIGHT
      break
    default:
      // Vocabulary we do not recognize: say so rather than guess (FR-054).
      state = null
  }

  return { state, upstreamStatus, fillTxHash, refundTxHash, depositTxHash, destinationChainId }
}

/**
 * Fetch + normalize the status of one deposit.
 *
 * @param {{get: Function}} client
 * @param {{originChainId: number, depositId: string}} params
 * @returns {Promise<object|null>} the DTO, or null when the upstream body is unusable
 */
export async function fetchDepositStatus(client, { originChainId, depositId }) {
  const body = await client.get('/deposit/status', { query: { originChainId, depositId } })
  const status = normalizeDepositStatus(body)
  if (status == null) return null
  return { originChainId, depositId, ...status }
}
