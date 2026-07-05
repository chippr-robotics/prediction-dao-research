/**
 * Engine -> gateway status webhook logic (contracts/engine-integration.md).
 *
 * Maps the engine's transaction lifecycle onto the Intent Status lifecycle
 * (data-model.md): `confirmed` is surfaced ONLY on mined/confirmed — never on
 * submit/pending — so the gateway can never report false success (FR-006).
 *
 *   engine status  -> intent status
 *   pending/sent/submitted -> submitted
 *   mined/confirmed        -> confirmed   (terminal; dedup marker -> completed)
 *   failed/expired         -> failed      (terminal; dedup marker -> failed => retryable)
 *   cancelled              -> failed
 */
const STATUS_MAP = {
  pending: 'submitted',
  sent: 'submitted',
  submitted: 'submitted',
  mined: 'confirmed',
  confirmed: 'confirmed',
  failed: 'failed',
  expired: 'failed',
  cancelled: 'failed',
  canceled: 'failed',
}

export function mapEngineStatus(engineStatus) {
  return STATUS_MAP[String(engineStatus ?? '').toLowerCase()] ?? null
}

/**
 * Normalize an engine webhook body to { id, status, hash, reason }. The real OZ Relayer wraps every
 * tx update as `{ id: <notificationId>, event, payload, timestamp }` — the TRANSACTION fields (its own
 * id/hash/status) live INSIDE `payload`: flattened for `payload_type: "transaction"`, nested under
 * `payload.transaction` (+ `failure_reason`) for `"transaction_failure"`. NB the outer `event.id` is
 * the notification id, NOT the tx id. Also accepts a flat `{ id, status, hash }` (the shape
 * engine-integration.md originally assumed / the unit tests use) so both are handled.
 */
export function normalizeEngineEvent(event) {
  const p = event?.payload
  if (p && typeof p === 'object') {
    const tx = p.payload_type === 'transaction_failure' ? (p.transaction ?? {}) : p
    return { id: tx.id, status: tx.status, hash: tx.hash, reason: p.failure_reason ?? tx.status_reason ?? p.reason }
  }
  return { id: event?.id, status: event?.status, hash: event?.hash, reason: event?.reason ?? event?.status_reason }
}

/**
 * Apply one engine webhook event. Pure of HTTP concerns (server.js owns auth + parsing).
 * @returns {{ ok: boolean, code?: string, record?: object }}
 */
export function applyEngineEvent({ store, dedup, audit }, event) {
  const n = normalizeEngineEvent(event)
  const engineTxId = n.id != null ? String(n.id) : null
  if (!engineTxId) return { ok: false, code: 'missing_id' }

  const mapped = mapEngineStatus(n.status)
  if (!mapped) return { ok: false, code: 'unknown_status' }

  const record = store.getByEngineTxId(engineTxId)
  if (!record) return { ok: false, code: 'unknown_transaction' }

  // Don't regress a terminal state (late/duplicate webhook deliveries are expected).
  if (record.status === 'confirmed' || record.status === 'failed') {
    return { ok: true, record }
  }

  const txHash = n.hash ?? record.txHash ?? null
  const reason = mapped === 'failed' ? (n.reason ?? 'transaction failed on-chain') : null
  store.setStatus(record.intentId, mapped, { txHash, reason })

  if (mapped === 'confirmed') {
    dedup.markCompleted(record.chainId, record.uniquenessMarker)
  } else if (mapped === 'failed') {
    // The on-chain nonce was not consumed; a fresh submission of the same marker is safe.
    dedup.markFailed(record.chainId, record.uniquenessMarker)
  }

  audit({
    signer: record.signer,
    chainId: record.chainId,
    action: record.action,
    targetContract: record.targetContract,
    uniquenessMarker: record.uniquenessMarker,
    txHash,
    outcome: mapped === 'submitted' ? 'submitted' : mapped,
    ...(reason ? { reason } : {}),
  })

  return { ok: true, record }
}
