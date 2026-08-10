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
 *
 * Spec 067 adds the bridge guarantees (FR-035/FR-036), because a bridge is the
 * one entry that spans two networks:
 *   G6 — a bridge carries BOTH networks (origin = the entry's chainId, plus a
 *        distinct destination) and BOTH transactions on the one entry; what it
 *        does not know is null, and a "bridge" naming one network on both sides
 *        is refused outright
 *   G7 — a bridge carries direction 'none': a member moving their own assets
 *        between networks has neither earned nor disposed of anything, so only
 *        the platform fee (refs.feeAmountRaw) is a cost
 *   G8 — a bridge is SETTLED only with destination-side evidence; a settled
 *        claim without a destination transaction is held at PENDING
 * and `collapseBridgeEntries` keeps the whole thing ONE entry.
 */
import {
  LEDGER_CLASS,
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
 * Bridge state keys, mirrored BY VALUE from `BRIDGE_STATE` in
 * `sources/bridgeLedgerSource.js` (the idiom `lib/bridge/bridgeCopy.js` uses)
 * so the ledger core stays free of a dependency on any one source.
 */
const BRIDGE_STATE_DELIVERED = 'delivered'
const BRIDGE_STATE_IN_FLIGHT = 'in_flight'

/** EVM chain id, or null. Bitcoin network ids are strings (spec 061). */
function evmChainId(value) {
  const n = Number(value)
  return typeof value !== 'string' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The cross-network facet of a bridge pre-item (G6, data-model.md
 * "BridgeEntry"). `refs` is the copy that survives normalization, so it wins;
 * the top-level mirrors written by the source are the fallback.
 *
 * A missing destination network or origin transaction is carried as `null` —
 * honestly unknown, the G2 treatment of a missing timestamp. It is NOT a
 * rejection: the repository degrades a source per SOURCE, so throwing over one
 * damaged record (a backup restored from an older build, say) would hide every
 * other bridge with it, including an in-flight transfer the member is waiting
 * on. Hiding someone's money is the worse failure.
 *
 * A destination equal to the origin IS rejected: an entry claiming a movement
 * between two networks while naming one network on both sides is not an
 * incomplete bridge, it is a false statement about what happened, and the
 * source's own capture path already refuses to write one.
 */
function bridgeFacet(pre, originChainId) {
  const refs = pre.refs && typeof pre.refs === 'object' ? pre.refs : {}
  const destinationChainId = evmChainId(refs.destinationChainId ?? pre.destinationChainId)
  if (destinationChainId != null && destinationChainId === originChainId) {
    throw new Error(
      `ledger: bridge entry "${pre.entryId}" names one network ${originChainId} on both sides`,
    )
  }
  return {
    destinationChainId,
    srcTxHash: refs.srcTxHash || pre.srcTxHash || pre.txHash || null,
    dstTxHash: refs.dstTxHash ?? pre.dstTxHash ?? null,
    bridgeState: refs.bridgeState || pre.bridgeState || null,
    bridgeId: refs.bridgeId || pre.entryId,
  }
}

/**
 * The logical identity of a bridge — the transfer itself, not the observation
 * of it. Status changes append superseding records under new entryIds
 * (`<bridgeId>:<state>`); they are all the same single movement (FR-035).
 * @param {object} entry
 * @returns {string} bridgeId, falling back to the entryId
 */
export function bridgeLogicalKey(entry) {
  return entry?.refs?.bridgeId || entry?.entryId || null
}

const TERMINAL_STATUSES = [LEDGER_STATUS.SETTLED, LEDGER_STATUS.CANCELLED, LEDGER_STATUS.FAILED]

/** Observation order: a resolved bridge outranks an in-flight one; then recency. */
function outranks(candidate, incumbent) {
  const rank = (e) => (TERMINAL_STATUSES.includes(e.status) ? 1 : 0)
  if (rank(candidate) !== rank(incumbent)) return rank(candidate) > rank(incumbent)
  const seen = (e) => Number(e.recordedAt ?? e.timestamp ?? 0)
  return seen(candidate) > seen(incumbent)
}

/**
 * Collapse every observation of the same bridge to ONE entry (FR-035).
 *
 * Within one device the client store already resolves supersede chains, so this
 * is a backstop for the case it cannot see: a spec-032 backup restored from a
 * second device unions records by entryId, which can leave two divergent tips
 * of the same transfer (one saying `in_flight`, one saying `delivered`). Showing
 * both would present one movement as two and double-count its value. The
 * furthest-progressed observation survives; ties go to the most recent.
 *
 * Non-bridge entries pass through untouched, in their original order.
 * @param {Array} entries - normalized entries
 * @returns {Array}
 */
export function collapseBridgeEntries(entries = []) {
  const winners = new Map()
  for (const e of entries) {
    if (e?.class !== LEDGER_CLASS.BRIDGE) continue
    const key = bridgeLogicalKey(e)
    const incumbent = winners.get(key)
    if (!incumbent || outranks(e, incumbent)) winners.set(key, e)
  }
  if (winners.size === 0) return entries
  const kept = new Set([...winners.values()].map((e) => e.entryId))
  return entries.filter((e) => e?.class !== LEDGER_CLASS.BRIDGE || kept.has(e.entryId))
}

/**
 * @param {object} pre - source pre-item
 * @param {{account:string, chainId:number}} ctx - query scope
 * @returns {object} validated LedgerEntry
 */
export function normalizeEntry(pre, ctx) {
  if (!pre || typeof pre !== 'object') throw new Error('ledger: entry must be an object')
  if (!pre.entryId) throw new Error('ledger: entry missing entryId')
  if (!LEDGER_CLASSES.includes(pre.class)) throw new Error(`ledger: unknown class "${pre.class}"`)

  let status = pre.status || LEDGER_STATUS.SETTLED
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

  // G6 — a bridge is ONE entry spanning two networks; it must be able to name
  // both of them and its origin transaction, or it is not a bridge (FR-035).
  const bridge = pre.class === LEDGER_CLASS.BRIDGE ? bridgeFacet(pre, chainId) : null

  // G8 — only destination-side evidence completes a bridge (FR-009). A record
  // claiming SETTLED without a destination transaction is held at PENDING
  // rather than telling a member their money arrived on someone's say-so, and
  // the state claim is held back with it so the entry never says two things.
  if (bridge && status === LEDGER_STATUS.SETTLED && !bridge.dstTxHash) {
    status = LEDGER_STATUS.PENDING
    if (bridge.bridgeState === BRIDGE_STATE_DELIVERED) bridge.bridgeState = BRIDGE_STATE_IN_FLIGHT
  }

  // G3 — failed operations moved no value.
  // G7 — neither does moving your own assets between networks: a bridge is not
  // income and not a disposal, only its platform fee is a cost (FR-036).
  const direction =
    status === LEDGER_STATUS.FAILED || bridge
      ? LEDGER_DIRECTION.NONE
      : pre.direction || LEDGER_DIRECTION.NONE

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
    // Both networks and both transactions travel on the single entry, at the
    // top level (data-model.md "BridgeEntry") and in `refs` — the two always
    // agree, so a consumer reading either one reads the same bridge.
    ...(bridge
      ? {
          destinationChainId: bridge.destinationChainId,
          srcTxHash: bridge.srcTxHash,
          dstTxHash: bridge.dstTxHash,
          bridgeState: bridge.bridgeState,
        }
      : {}),
    refs: bridge
      ? {
          ...(pre.refs && typeof pre.refs === 'object' ? pre.refs : {}),
          bridgeId: bridge.bridgeId,
          originChainId: chainId,
          destinationChainId: bridge.destinationChainId,
          srcTxHash: bridge.srcTxHash,
          dstTxHash: bridge.dstTxHash,
          bridgeState: bridge.bridgeState,
        }
      : pre.refs && typeof pre.refs === 'object'
        ? pre.refs
        : {},
  }
}
