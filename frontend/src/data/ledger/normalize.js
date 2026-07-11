/**
 * Normalization + invariant enforcement for ledger entries (spec 051).
 *
 * Sources return pre-items; this module turns each into a validated
 * LedgerEntry (data-model.md) or throws. The invariants here are the
 * fidelity guarantees of contracts/ledger-entry.md:
 *   G2 — timestamp is real epoch ms or null+unavailable; 0 never survives
 *   G3 — failed entries carry direction 'none' (and are excluded from totals
 *        downstream by status, not by omission)
 *   G4 — on-chain provenance requires a txHash
 *   G5 — strict chainId scoping against the query context
 */
import {
  LEDGER_CLASSES,
  LEDGER_STATUSES,
  LEDGER_STATUS,
  LEDGER_DIRECTION,
  PROVENANCE,
  ID_NS,
  TS_PROVENANCE,
} from './constants'
import { namespaceOf } from './identity'

/**
 * @param {object} pre - source pre-item
 * @param {{account:string, chainId:number}} ctx - query scope
 * @returns {object} validated LedgerEntry
 */
export function normalizeEntry(pre, ctx) {
  if (!pre || typeof pre !== 'object') throw new Error('ledger: entry must be an object')
  if (!pre.entryId) throw new Error('ledger: entry missing entryId')
  if (!LEDGER_CLASSES.includes(pre.class)) throw new Error(`ledger: unknown class "${pre.class}"`)

  const status = pre.status || LEDGER_STATUS.SETTLED
  if (!LEDGER_STATUSES.includes(status)) throw new Error(`ledger: unknown status "${status}"`)

  const provenance = pre.provenance
  if (!Object.values(PROVENANCE).includes(provenance)) {
    throw new Error(`ledger: unknown provenance "${provenance}"`)
  }
  if (namespaceOf(pre.entryId) !== ID_NS[provenance]) {
    throw new Error(`ledger: entryId namespace does not match provenance for "${pre.entryId}"`)
  }
  if (provenance === PROVENANCE.ONCHAIN && !pre.txHash) {
    throw new Error(`ledger: on-chain entry "${pre.entryId}" missing txHash`)
  }

  const chainId = Number(pre.chainId)
  if (ctx?.chainId != null && chainId !== Number(ctx.chainId)) {
    throw new Error(`ledger: entry chainId ${chainId} leaked into query for chainId ${ctx.chainId}`)
  }

  // G2 — a missing/zero/invalid time is honestly unavailable, never epoch-0.
  const tsNum = Number(pre.timestamp)
  const hasRealTs = Number.isFinite(tsNum) && tsNum > 0 && pre.timestamp !== null && pre.timestamp !== undefined
  const timestamp = hasRealTs ? tsNum : null
  const timestampProvenance = hasRealTs
    ? pre.timestampProvenance || TS_PROVENANCE.CHAIN
    : TS_PROVENANCE.UNAVAILABLE

  // G3 — failed operations moved no value.
  const direction = status === LEDGER_STATUS.FAILED ? LEDGER_DIRECTION.NONE : pre.direction || LEDGER_DIRECTION.NONE

  return {
    entryId: pre.entryId,
    account: String(ctx?.account ?? pre.account ?? '').toLowerCase(),
    chainId,
    class: pre.class,
    kind: pre.kind || pre.class,
    direction,
    status,
    failureReason: pre.failureReason ?? null,
    tokenAddress: pre.tokenAddress ? String(pre.tokenAddress).toLowerCase() : null,
    tokenSymbol: pre.tokenSymbol ?? null,
    tokenDecimals: pre.tokenDecimals ?? null,
    amountRaw: pre.amountRaw != null ? String(pre.amountRaw) : null,
    amount: pre.amount ?? null,
    valueUsd: pre.valueUsd ?? null,
    valuationStatus: pre.valuationStatus ?? null,
    counterparty: pre.counterparty ? String(pre.counterparty).toLowerCase() : null,
    txHash: pre.txHash || null,
    logIndex: pre.logIndex ?? null,
    timestamp,
    timestampProvenance,
    provenance,
    recordedAt: pre.recordedAt ?? null,
    refs: pre.refs && typeof pre.refs === 'object' ? pre.refs : {},
  }
}
