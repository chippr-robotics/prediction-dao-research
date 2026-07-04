/**
 * In-memory intent store: intentId -> record, plus an engine-tx index for webhook resolution.
 *
 * Phase 1 (single instance): in-process Maps. Phase 2 (horizontal scale): move to shared Redis
 * (Memorystore) — see research.md §3. Restart loss is benign: on-chain is the record of record
 * and the uniquenessMarker is single-use on-chain, so a replay after restart cannot double-spend.
 *
 * Status lifecycle (data-model.md): queued -> submitted -> confirmed | failed.
 * `confirmed` is ONLY ever set from an engine webhook reporting mined/confirmed (FR-006 —
 * never report success before on-chain inclusion).
 */
import crypto from 'node:crypto'

export function createIntentStore({ now = () => Date.now(), ttlMs = 24 * 3600 * 1000 } = {}) {
  const byId = new Map()
  const byEngineTxId = new Map()

  function sweep() {
    const cutoff = now() - ttlMs
    for (const [id, rec] of byId) {
      if (rec.updatedAt < cutoff && (rec.status === 'confirmed' || rec.status === 'failed')) {
        byId.delete(id)
        if (rec.engineTxId) byEngineTxId.delete(rec.engineTxId)
      }
    }
  }

  return {
    create({ chainId, signer, action, targetContract, uniquenessMarker }) {
      sweep()
      const intentId = crypto.randomUUID()
      const rec = {
        intentId,
        chainId,
        signer,
        action,
        targetContract,
        uniquenessMarker,
        status: 'queued',
        txHash: null,
        engineTxId: null,
        reason: null,
        createdAt: now(),
        updatedAt: now(),
      }
      byId.set(intentId, rec)
      return rec
    },

    get(intentId) {
      return byId.get(intentId) ?? null
    },

    getByEngineTxId(engineTxId) {
      return byEngineTxId.get(engineTxId) ?? null
    },

    attachEngineTx(intentId, engineTxId, txHash) {
      const rec = byId.get(intentId)
      if (!rec) return null
      rec.engineTxId = engineTxId
      if (txHash) {
        rec.txHash = txHash
        rec.status = 'submitted'
      }
      rec.updatedAt = now()
      if (engineTxId) byEngineTxId.set(engineTxId, rec)
      return rec
    },

    setStatus(intentId, status, { txHash, reason } = {}) {
      const rec = byId.get(intentId)
      if (!rec) return null
      rec.status = status
      if (txHash) rec.txHash = txHash
      if (reason) rec.reason = reason
      rec.updatedAt = now()
      return rec
    },

    /** Bounded-queue depth: intents accepted but not yet terminal (FR-009 back-pressure input). */
    inFlightCount() {
      let n = 0
      for (const rec of byId.values()) {
        if (rec.status === 'queued' || rec.status === 'submitted') n += 1
      }
      return n
    },

    remove(intentId) {
      const rec = byId.get(intentId)
      if (!rec) return
      byId.delete(intentId)
      if (rec.engineTxId) byEngineTxId.delete(rec.engineTxId)
    },
  }
}
