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
 * Apply one engine webhook event. Pure of HTTP concerns (server.js owns auth + parsing).
 * @returns {{ ok: boolean, code?: string, record?: object }}
 */
export function applyEngineEvent({ store, dedup, audit }, event) {
  const engineTxId = event?.id != null ? String(event.id) : null
  if (!engineTxId) return { ok: false, code: 'missing_id' }

  const mapped = mapEngineStatus(event.status)
  if (!mapped) return { ok: false, code: 'unknown_status' }

  const record = store.getByEngineTxId(engineTxId)
  if (!record) return { ok: false, code: 'unknown_transaction' }

  // Don't regress a terminal state (late/duplicate webhook deliveries are expected).
  if (record.status === 'confirmed' || record.status === 'failed') {
    return { ok: true, record }
  }

  const txHash = event.hash ?? record.txHash ?? null
  const reason = mapped === 'failed' ? (event.reason ?? event.status_reason ?? 'transaction failed on-chain') : null
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
