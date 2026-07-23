/**
 * Shared vocabulary for the unified activity ledger (spec 051).
 * Mirrors specs/051-unified-activity-ledger/data-model.md — the enums here are
 * the single source of truth the sources, repository, UI, and report share.
 */

/** Activity classes the ledger covers (FR-001). */
export const LEDGER_CLASS = Object.freeze({
  WAGER: 'wager',
  TRANSFER: 'transfer',
  EARN: 'earn',
  STAKING: 'staking',
  POOL: 'pool',
  MEMBERSHIP: 'membership',
})

export const LEDGER_CLASSES = Object.freeze(Object.values(LEDGER_CLASS))

/** Final status of an entry. Failed entries are listed, never totaled (FR-003). */
export const LEDGER_STATUS = Object.freeze({
  SETTLED: 'settled',
  PENDING: 'pending',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
})

export const LEDGER_STATUSES = Object.freeze(Object.values(LEDGER_STATUS))

/** Value direction relative to the account. Failed ops carry 'none'. */
export const LEDGER_DIRECTION = Object.freeze({
  IN: 'in',
  OUT: 'out',
  NONE: 'none',
})

/** Where an entry's data comes from — surfaced to auditing (constitution III). */
export const PROVENANCE = Object.freeze({
  ONCHAIN: 'onchain', // re-derivable from chain/subgraph; carries a txHash
  DERIVED: 'derived', // synthesized from on-chain state (no single tx)
  CLIENT: 'client', // exists only on this device; travels in the encrypted backup
})

/** entryId namespace per provenance (data-model.md Identity). */
export const ID_NS = Object.freeze({
  [PROVENANCE.ONCHAIN]: 'oc',
  [PROVENANCE.DERIVED]: 'dv',
  [PROVENANCE.CLIENT]: 'cl',
})

/** Where an entry's timestamp comes from (FR-005). */
export const TS_PROVENANCE = Object.freeze({
  CHAIN: 'chain', // block time — the only provenance for on-chain events
  DEVICE: 'device', // device clock — only for client-only events
  UNAVAILABLE: 'unavailable', // no real time exists; UI shows "date unavailable" (FR-006)
})

/** Valuation flags — unvalued entries are kept and flagged, never zeroed (FR-016). */
export const VALUATION_STATUS = Object.freeze({
  VALUED: 'valued',
  UNVALUED: 'unvalued',
})
