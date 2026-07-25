/**
 * Cross-chain bridge ledger source (spec 067, T071 — FR-035/FR-036).
 *
 * Mirrors `stakingLedgerSource`: bridges are captured at ACTION TIME into the
 * append-only client ledger store, because no indexer covers Across and the
 * entry has to survive the app closing (FR-010, research R7). The store travels
 * in the spec-032 encrypted backup, and every record carries real, chain-
 * verifiable transaction hashes.
 *
 * Three things make this source different from the other client sources, and
 * each is a spec requirement rather than a preference:
 *
 *   1. ONE entry per bridge, never two (FR-035). A bridge touches two networks
 *      and two transactions, but it is a single logical movement: it is keyed
 *      `bridge:<originChainId>:<depositId>`, lives on the ORIGIN chain, and
 *      carries the destination chain and both hashes on itself. Recording a
 *      "send" on one chain and a "receive" on the other would double-count it.
 *
 *   2. `direction: 'none'` (FR-036). A member moving their own assets between
 *      networks has not earned anything and has not disposed of anything. The
 *      only cost is the FairWins platform fee, carried as `refs.feeAmountRaw`.
 *
 *   3. `delivered` / `SETTLED` is reachable ONLY with a destination-side
 *      transaction hash (FR-009). `captureBridgeState` enforces that here, at
 *      the point of persistence, so a status poll that says "probably done"
 *      cannot write a completed bridge into the ledger. Without `dstTxHash` the
 *      entry stays PENDING no matter what the caller claims.
 *
 * Status transitions follow the store's append-only rule: each change appends a
 * SUPERSEDING record (`refs.supersedes`) whose id is `<baseId>:<state>`, so
 * re-reporting the same state on a later reconciliation is a no-op and the full
 * history stays readable for audit.
 *
 * Bridge-specific fields live in `refs` because `normalizeEntry` keeps only the
 * known top-level LedgerEntry fields plus `refs` wholesale; the top-level
 * mirrors written alongside them are for consumers reading the store directly
 * (`readBridgeEntry` prefers `refs` and falls back to those, so both paths agree).
 */
import { listClientRecords, appendClientRecord } from '../ledgerClientStore'
import { clientEntryId } from '../identity'
import { LEDGER_CLASS, LEDGER_STATUS, LEDGER_DIRECTION, PROVENANCE, TS_PROVENANCE } from '../constants'

/** The settlement protocol recorded on the entry when the caller names none (FR-014). */
const DEFAULT_SETTLEMENT_PROTOCOL = 'Across'

/**
 * UI-level bridge states (data-model.md "BridgeEntry"). Distinct from
 * LEDGER_STATUS: a bridge is PENDING through four different real situations,
 * and the member is owed the difference between them.
 */
export const BRIDGE_STATE = Object.freeze({
  SUBMITTED: 'submitted',
  SOURCE_CONFIRMED: 'source_confirmed',
  IN_FLIGHT: 'in_flight',
  DELIVERED: 'delivered',
  REFUNDED: 'refunded',
  NEEDS_ATTENTION: 'needs_attention',
  /** The origin transaction reverted — the `src revert` leaf of the state machine. */
  FAILED: 'failed',
})

/** Ledger status per bridge state. `delivered` is additionally gated on evidence. */
const STATUS_BY_STATE = Object.freeze({
  [BRIDGE_STATE.SUBMITTED]: LEDGER_STATUS.PENDING,
  [BRIDGE_STATE.SOURCE_CONFIRMED]: LEDGER_STATUS.PENDING,
  [BRIDGE_STATE.IN_FLIGHT]: LEDGER_STATUS.PENDING,
  [BRIDGE_STATE.NEEDS_ATTENTION]: LEDGER_STATUS.PENDING,
  [BRIDGE_STATE.DELIVERED]: LEDGER_STATUS.SETTLED,
  [BRIDGE_STATE.REFUNDED]: LEDGER_STATUS.CANCELLED,
  [BRIDGE_STATE.FAILED]: LEDGER_STATUS.FAILED,
})

/**
 * Progress order for the non-terminal states, so a late poll cannot walk a
 * transfer backwards. `needs_attention` sits alongside `in_flight` (it is a
 * timing observation, not progress) and stays resolvable in both directions.
 */
const STATE_RANK = Object.freeze({
  [BRIDGE_STATE.SUBMITTED]: 0,
  [BRIDGE_STATE.SOURCE_CONFIRMED]: 1,
  [BRIDGE_STATE.IN_FLIGHT]: 2,
  [BRIDGE_STATE.NEEDS_ATTENTION]: 2,
})

/** Outcomes nothing may overwrite. */
const TERMINAL_STATES = Object.freeze([
  BRIDGE_STATE.DELIVERED,
  BRIDGE_STATE.REFUNDED,
  BRIDGE_STATE.FAILED,
])

/** EVM only: Bitcoin network ids are strings (spec 061) and never bridge (FR-006). */
function evmChainId(value) {
  const n = Number(value)
  return typeof value !== 'string' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The stable, idempotent id of a bridge entry: origin chain + Across depositId.
 * Exported so the status reconciler and the progress view can address the same
 * bridge without re-deriving the key.
 */
export function bridgeEntryId(originChainId, depositId) {
  const chainId = evmChainId(originChainId)
  if (chainId == null || depositId == null || depositId === '') return null
  return clientEntryId(`bridge:${chainId}:${String(depositId)}`)
}

/** The surviving record for one bridge, or null if it was never captured. */
function findBridgeRecord(records, baseId) {
  return records.find((r) => r.class === LEDGER_CLASS.BRIDGE && r.refs?.bridgeId === baseId) || null
}

function buildRecord({ account, originChainId, destinationChainId, baseId, b, state, status, base }) {
  const srcTxHash = b.srcTxHash || base?.refs?.srcTxHash || base?.txHash || null
  const dstTxHash = b.dstTxHash || base?.refs?.dstTxHash || null
  const refundTxHash = b.refundTxHash || base?.refs?.refundTxHash || null
  const submittedAt = Number(base?.timestamp) > 0 ? Number(base.timestamp) : null
  const at = submittedAt ?? (Number(b.at) > 0 ? Number(b.at) : Date.now())
  return {
    entryId: baseId,
    chainId: originChainId,
    account: String(account).toLowerCase(),
    class: LEDGER_CLASS.BRIDGE,
    kind: 'bridge_transfer',
    // FR-036 — moving your own assets between networks is neither income nor a
    // disposal. Only the platform fee below is a cost.
    direction: LEDGER_DIRECTION.NONE,
    status,
    failureReason: b.failureReason || base?.failureReason || null,
    tokenAddress: b.tokenAddress ?? base?.tokenAddress ?? null,
    tokenSymbol: b.tokenSymbol || base?.tokenSymbol || null,
    tokenDecimals: b.tokenDecimals ?? base?.tokenDecimals ?? null,
    amountRaw: b.amountRaw != null ? String(b.amountRaw) : (base?.amountRaw ?? null),
    // A bridge is a self-transfer; the counterparty is the member's own address
    // on the destination network, kept in refs rather than pretending otherwise.
    counterparty: null,
    // The origin transaction is the entry's own chain-verifiable hash.
    txHash: srcTxHash,
    timestamp: at,
    timestampProvenance: TS_PROVENANCE.DEVICE,
    provenance: PROVENANCE.CLIENT,
    // Top-level mirrors for direct store readers (data-model.md); `refs` is the
    // copy that survives normalizeEntry.
    destinationChainId,
    srcTxHash,
    dstTxHash,
    bridgeState: state,
    refs: {
      bridgeId: baseId,
      depositId: String(b.depositId ?? base?.refs?.depositId ?? ''),
      originChainId,
      destinationChainId,
      srcTxHash,
      dstTxHash,
      refundTxHash,
      bridgeState: state,
      // The FairWins platform fee actually charged — the only value this entry
      // reports as a cost (FR-036).
      feeAmountRaw: b.feeAmountRaw != null ? String(b.feeAmountRaw) : (base?.refs?.feeAmountRaw ?? null),
      feeBps: b.feeBps ?? base?.refs?.feeBps ?? null,
      outputAmountRaw:
        b.outputAmountRaw != null ? String(b.outputAmountRaw) : (base?.refs?.outputAmountRaw ?? null),
      recipient: (b.recipient || base?.refs?.recipient || null)?.toLowerCase?.() ?? null,
      // Timestamp after which in_flight becomes needs_attention (FR-011).
      expectedBy: Number(b.expectedBy) > 0 ? Number(b.expectedBy) : (base?.refs?.expectedBy ?? null),
      deliveredAt: state === BRIDGE_STATE.DELIVERED ? Date.now() : (base?.refs?.deliveredAt ?? null),
      // FR-014 — the third party that settles the transfer, named in the record.
      settlementProtocol: b.protocol || base?.refs?.settlementProtocol || DEFAULT_SETTLEMENT_PROTOCOL,
      description: b.description || base?.refs?.description || null,
    },
  }
}

/**
 * Capture a submitted bridge as ONE pending entry (FR-035). Called by the
 * bridge submit flow with the origin receipt. Never throws — capture must not
 * break the action — and is idempotent: the same depositId re-captures to the
 * same entryId, which the store drops.
 *
 * @param {string} account
 * @param {number} originChainId
 * @param {object} b - { depositId, destinationChainId, srcTxHash, amountRaw, tokenAddress?,
 *   tokenSymbol?, tokenDecimals?, feeAmountRaw?, feeBps?, outputAmountRaw?, recipient?,
 *   expectedBy?, protocol?, at?, description? }
 * @returns {string|null} the entryId, or null when the input is unusable
 */
export function captureBridgeSubmission(account, originChainId, b) {
  if (!account || !b?.depositId || !b?.srcTxHash) return null
  const origin = evmChainId(originChainId)
  const destination = evmChainId(b.destinationChainId)
  // FR-006 — a bridge needs two distinct EVM networks. Bitcoin string ids and a
  // same-chain "bridge" are both rejected rather than recorded as something else.
  if (origin == null || destination == null || origin === destination) return null

  const baseId = bridgeEntryId(origin, b.depositId)
  if (!baseId) return null
  appendClientRecord(
    account,
    buildRecord({
      account,
      originChainId: origin,
      destinationChainId: destination,
      baseId,
      b,
      state: BRIDGE_STATE.SUBMITTED,
      status: LEDGER_STATUS.PENDING,
      base: null,
    }),
  )
  return baseId
}

/**
 * Record a state change for an already-captured bridge (FR-009/FR-011).
 * Appends a superseding record; the base entry is never mutated.
 *
 * Refusals, all of them deliberate:
 *   - unknown state, or a bridge that was never captured → no write;
 *   - `delivered` without a destination transaction hash → held at its current
 *     progress state, still PENDING. Nothing but destination-side evidence may
 *     complete a bridge;
 *   - `refunded` without a refund transaction hash → held at `needs_attention`,
 *     still PENDING and still resolvable. "Your asset came back" is a claim
 *     about money and gets the same evidence rule as delivery; reconcilers must
 *     pass the refund hash they saw;
 *   - a state already terminal (delivered / refunded / failed) → no write;
 *   - a state that would move the transfer backwards → no write;
 *   - the state it is already in → no write (idempotent reconciliation).
 *
 * @param {string} account
 * @param {number} originChainId
 * @param {object} b - { depositId, state, dstTxHash?, refundTxHash?, srcTxHash?, failureReason?, ... }
 * @returns {string|null} the appended entryId, or null when nothing was written
 */
export function captureBridgeState(account, originChainId, b) {
  if (!account || !b?.depositId || !b?.state) return null
  const origin = evmChainId(originChainId)
  if (origin == null) return null
  const baseId = bridgeEntryId(origin, b.depositId)
  if (!baseId) return null

  let state = b.state
  if (!STATUS_BY_STATE[state]) return null

  const current = findBridgeRecord(listClientRecords(account, origin), baseId)
  if (!current) return null // nothing to supersede — submission was never captured

  const currentState = current.refs?.bridgeState || current.bridgeState
  if (TERMINAL_STATES.includes(currentState)) return null

  // FR-009 — no destination transaction, no completion. Held at the furthest
  // honest progress state instead of being silently dropped.
  const dstTxHash = b.dstTxHash || current.refs?.dstTxHash || null
  if (state === BRIDGE_STATE.DELIVERED && !dstTxHash) {
    state = STATE_RANK[currentState] >= STATE_RANK[BRIDGE_STATE.IN_FLIGHT]
      ? currentState
      : BRIDGE_STATE.IN_FLIGHT
  }

  // Same rule for the other money outcome: a refund is only recorded once the
  // returning transaction is known. Until then the transfer is honestly stuck,
  // not resolved — and `needs_attention` still leads to refunded or delivered.
  const refundTxHash = b.refundTxHash || current.refs?.refundTxHash || null
  if (state === BRIDGE_STATE.REFUNDED && !refundTxHash) {
    state = BRIDGE_STATE.NEEDS_ATTENTION
  }

  if (state === currentState) return null
  const isTerminal = TERMINAL_STATES.includes(state)
  if (!isTerminal && (STATE_RANK[state] ?? 0) < (STATE_RANK[currentState] ?? 0)) return null

  const record = buildRecord({
    account,
    originChainId: origin,
    destinationChainId: evmChainId(current.refs?.destinationChainId ?? current.destinationChainId),
    baseId,
    b: { ...b, dstTxHash },
    state,
    status: STATUS_BY_STATE[state],
    base: current,
  })
  const entryId = `${baseId}:${state}`
  appendClientRecord(account, {
    ...record,
    entryId,
    recordedAt: Date.now(),
    refs: { ...record.refs, supersedes: current.entryId },
  })
  return entryId
}

/**
 * Flat view of a bridge record for the progress UI — `refs` first (the copy that
 * survives normalization), top-level mirrors as the fallback. Returns null for
 * anything that is not a bridge entry.
 * @param {object} record
 */
export function readBridgeEntry(record) {
  if (!record || record.class !== LEDGER_CLASS.BRIDGE) return null
  const refs = record.refs || {}
  return {
    entryId: record.entryId,
    bridgeId: refs.bridgeId || record.entryId,
    depositId: refs.depositId || null,
    originChainId: refs.originChainId ?? record.chainId ?? null,
    destinationChainId: refs.destinationChainId ?? record.destinationChainId ?? null,
    state: refs.bridgeState || record.bridgeState || null,
    status: record.status,
    srcTxHash: refs.srcTxHash ?? record.srcTxHash ?? record.txHash ?? null,
    dstTxHash: refs.dstTxHash ?? record.dstTxHash ?? null,
    refundTxHash: refs.refundTxHash ?? null,
    amountRaw: record.amountRaw ?? null,
    outputAmountRaw: refs.outputAmountRaw ?? null,
    feeAmountRaw: refs.feeAmountRaw ?? null,
    tokenSymbol: record.tokenSymbol ?? null,
    tokenDecimals: record.tokenDecimals ?? null,
    expectedBy: refs.expectedBy ?? null,
    settlementProtocol: refs.settlementProtocol || DEFAULT_SETTLEMENT_PROTOCOL,
    timestamp: record.timestamp ?? null,
  }
}

/** Every bridge the account has on `chainId` as origin, latest state per bridge. */
export function listBridgeEntries(account, chainId) {
  const origin = evmChainId(chainId)
  if (!account || origin == null) return []
  return listClientRecords(account, origin)
    .filter((r) => r.class === LEDGER_CLASS.BRIDGE)
    .map(readBridgeEntry)
}

export function createBridgeLedgerSource(deps = {}) {
  const readClientRecords = deps.listClientRecords || listClientRecords
  return {
    class: LEDGER_CLASS.BRIDGE,
    async list({ account, chainId }) {
      return readClientRecords(account, chainId).filter((r) => r.class === LEDGER_CLASS.BRIDGE)
    },
  }
}
