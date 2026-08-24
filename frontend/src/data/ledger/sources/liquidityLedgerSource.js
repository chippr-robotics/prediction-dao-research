/**
 * Liquidity ledger source (spec 067, T104 — data-model.md "LiquidityEntry").
 *
 * Mirrors `stakingLedgerSource` and `bridgeLedgerSource`: pool positions are not swept from
 * an indexer, so supply / withdraw / fee-claim actions are captured at ACTION TIME into the
 * append-only client ledger store, carrying the real, chain-verifiable transaction hash. The
 * store travels in the spec-032 encrypted backup.
 *
 * Class `'liquidity'` is deliberately NOT `'pool'`: `LEDGER_CLASS.POOL` means a *wager* pool
 * (spec 034), and the two must never merge in a member's history or a tax report (research
 * R6 / FR-039).
 *
 * ---------------------------------------------------------------------------
 * WHAT IS RECORDED AS A COST, AND WHAT IS NOT.
 *
 * A FairWins platform fee is recorded ONLY where one can actually be charged:
 *
 *   - `lp_withdraw` and `lp_fees_claim` — ALWAYS zero. Exits and earnings claims never carry
 *     a platform fee (FR-030); there is no code path that could charge one.
 *   - `lp_supply` into a BRIDGE pool — ALWAYS zero. Across's `HubPool.addLiquidity` has no
 *     recipient parameter, so a fee-taking wrapper would own the position and the member
 *     could never exit; bridge liquidity is therefore fee-free and does not go through the
 *     router at all (research R3).
 *   - `lp_supply` into a TRADING pool — whatever was ACTUALLY charged, taken from the
 *     receipt. Not a quote, and never derived from the amount the member typed: the router
 *     charges the fee on the capital Uniswap actually consumed, and refunds the rest whole.
 *     A figure computed off the gross would over-state what the member paid.
 *
 * A fee that was not reported is recorded as `null` — unknown — never as `0`. "You were
 * charged nothing" and "we do not know what you were charged" are different claims, and only
 * one of them can be made from an absent value.
 * ---------------------------------------------------------------------------
 *
 * Pool-specific fields live in `refs` because `normalizeEntry` keeps only the known
 * top-level LedgerEntry fields plus `refs` wholesale. `poolId` and `poolKind` are carried on
 * every entry so the two kinds stay distinguishable forever — they have different
 * disclosures, different fee rules, and different availability.
 */
import { listClientRecords, appendClientRecord } from '../ledgerClientStore'
import { clientEntryId } from '../identity'
import {
  LEDGER_CLASS,
  LEDGER_STATUS,
  LEDGER_STATUSES,
  LEDGER_DIRECTION,
  PROVENANCE,
  TS_PROVENANCE,
} from '../constants'
import { LIQUIDITY_POOL_KIND, LIQUIDITY_PROTOCOLS, poolKindOf } from '../../../lib/liquidity/liquidityCopy'

/** The actions this source captures. Values are part of the entryId and are append-only. */
export const LIQUIDITY_ACTION = Object.freeze({
  SUPPLY: 'supply',
  WITHDRAW: 'withdraw',
  FEES_CLAIM: 'fees-claim',
})

/**
 * Entry kind and value direction per action (data-model.md "LiquidityEntry").
 * Supplying moves value out of the wallet; withdrawing and claiming move it back in.
 */
const KIND_BY_ACTION = Object.freeze({
  [LIQUIDITY_ACTION.SUPPLY]: { kind: 'lp_supply', direction: LEDGER_DIRECTION.OUT },
  [LIQUIDITY_ACTION.WITHDRAW]: { kind: 'lp_withdraw', direction: LEDGER_DIRECTION.IN },
  [LIQUIDITY_ACTION.FEES_CLAIM]: { kind: 'lp_fees_claim', direction: LEDGER_DIRECTION.IN },
})

/** The third party whose pool this is, named on the entry (FR-014/FR-017). */
function protocolFor(poolKind) {
  if (poolKind === LIQUIDITY_POOL_KIND.BRIDGE_LP) return LIQUIDITY_PROTOCOLS.bridge.protocol
  if (poolKind === LIQUIDITY_POOL_KIND.TRADING_LP) return LIQUIDITY_PROTOCOLS.trading.protocol
  return null
}

/** Bitcoin network ids are strings (spec 061) and hold no pools (FR-006). */
function evmChainId(value) {
  const n = Number(value)
  return typeof value !== 'string' && Number.isFinite(n) && n > 0 ? n : null
}

const raw = (v) => (v != null && v !== '' ? String(v) : null)

/**
 * True when this action + pool kind is one where a FairWins platform fee can exist at all.
 * Everything else records zero, whatever the caller passed.
 */
export function chargesPlatformFee(action, poolKind) {
  return action === LIQUIDITY_ACTION.SUPPLY && poolKind !== LIQUIDITY_POOL_KIND.BRIDGE_LP
}

/**
 * The fee to record: the amount actually charged where one can be, `'0'` where none can be,
 * and `null` where a chargeable action did not report one.
 */
function feeFor(action, poolKind, amount) {
  if (!chargesPlatformFee(action, poolKind)) return '0'
  return raw(amount)
}

/**
 * The stable id of a liquidity entry: `cl:liquidity:<chainId>:<action>:<txHash>`.
 *
 * Keyed by action as well as hash because one transaction legitimately performs two of them —
 * `decreaseLiquidity` + `collect` withdraws a position AND sweeps its earned fees — and they
 * are two different things in a member's history and in a tax report.
 *
 * @param {number} chainId
 * @param {string} action
 * @param {string} txHash
 * @returns {string|null}
 */
export function liquidityEntryId(chainId, action, txHash) {
  const id = evmChainId(chainId)
  if (id == null || !KIND_BY_ACTION[action] || !txHash) return null
  return clientEntryId(`liquidity:${id}:${action}:${txHash}`)
}

/**
 * Record a supply, withdrawal, or fee claim. Called by the Supply flows with the mined
 * receipt. Never throws — capture must not break the action — and is idempotent: the same
 * action on the same transaction re-captures to the same entryId, which the store drops.
 *
 * `poolId` and `poolKind` are required in substance: without the kind, the entry cannot say
 * which disclosures and which fee rule applied to it. A missing kind is recorded as `null`
 * (unknown) rather than guessed into `trading_lp`, and an unknown kind never has a fee zeroed
 * on its behalf — it is simply reported as given.
 *
 * @param {string} account
 * @param {number} chainId
 * @param {object} a - {
 *   type: 'supply'|'withdraw'|'fees-claim', txHash, at?, status?, failureReason?,
 *   poolId?, poolKind?, poolAddress?, tokenId?,
 *   amountRaw?, tokenAddress?, tokenSymbol?, tokenDecimals?,          // leg 0 / the single asset
 *   amount1Raw?, token1Address?, token1Symbol?, token1Decimals?,      // leg 1 (trading pairs)
 *   lpTokenAmountRaw?, feeAmountRaw?, fee1AmountRaw?, feeBps?, protocol?, description?
 * }
 * @returns {string|null} the entryId, or null when nothing was recorded
 */
export function captureLiquidityAction(account, chainId, a) {
  if (!account || !a?.type || !a?.txHash) return null
  const mapping = KIND_BY_ACTION[a.type]
  if (!mapping) return null
  const id = evmChainId(chainId)
  if (id == null) return null
  const entryId = liquidityEntryId(id, a.type, a.txHash)
  if (!entryId) return null

  const poolKind = poolKindOf(a.poolKind)
  const status = LEDGER_STATUSES.includes(a.status) ? a.status : LEDGER_STATUS.SETTLED

  appendClientRecord(account, {
    entryId,
    chainId: id,
    account: String(account).toLowerCase(),
    class: LEDGER_CLASS.LIQUIDITY,
    kind: mapping.kind,
    // normalizeEntry forces `none` on a FAILED entry — a reverted action moved no value.
    direction: mapping.direction,
    status,
    failureReason: a.failureReason || null,
    // Leg 0, or the single asset of a bridge pool. Leg 1 lives in `refs`, because the ledger
    // entry has one top-level amount and a pair genuinely has two.
    tokenAddress: a.tokenAddress ?? null,
    tokenSymbol: a.tokenSymbol || null,
    tokenDecimals: a.tokenDecimals ?? null,
    amountRaw: raw(a.amountRaw),
    // The counterparty is a pool, not a person; it is named in `refs.poolAddress`.
    counterparty: null,
    txHash: a.txHash,
    timestamp: Number(a.at) > 0 ? Number(a.at) : Date.now(),
    timestampProvenance: TS_PROVENANCE.DEVICE,
    provenance: PROVENANCE.CLIENT,
    refs: {
      action: a.type,
      // Carried on EVERY entry so the two pool kinds stay distinguishable forever.
      poolId: a.poolId || null,
      poolKind,
      poolAddress: a.poolAddress ? String(a.poolAddress).toLowerCase() : null,
      // Uniswap position NFT id — trading pools only; a bridge position is an ERC-20 balance.
      tokenId: a.tokenId != null ? String(a.tokenId) : null,
      // The pair's second leg.
      amount1Raw: raw(a.amount1Raw),
      token1Address: a.token1Address ?? null,
      token1Symbol: a.token1Symbol || null,
      token1Decimals: a.token1Decimals ?? null,
      // Across LP tokens burned or minted, for a bridge position.
      lpTokenAmountRaw: raw(a.lpTokenAmountRaw),
      // Zero wherever no fee can be charged; the amount actually charged where one can be;
      // null when a chargeable action did not report one. Never a computed-from-gross figure.
      feeAmountRaw: feeFor(a.type, poolKind, a.feeAmountRaw),
      fee1AmountRaw: feeFor(a.type, poolKind, a.fee1AmountRaw),
      feeBps: chargesPlatformFee(a.type, poolKind) ? (a.feeBps ?? null) : 0,
      protocol: a.protocol || protocolFor(poolKind),
      description: a.description || null,
    },
  })
  return entryId
}

/**
 * Flat view of a liquidity record for the Supply UI. Returns null for anything that is not a
 * liquidity entry, so a caller can map over mixed records safely.
 * @param {object} record
 */
export function readLiquidityEntry(record) {
  if (!record || record.class !== LEDGER_CLASS.LIQUIDITY) return null
  const refs = record.refs || {}
  return {
    entryId: record.entryId,
    chainId: record.chainId ?? null,
    action: refs.action || null,
    kind: record.kind,
    direction: record.direction,
    status: record.status,
    poolId: refs.poolId || null,
    poolKind: refs.poolKind || null,
    poolAddress: refs.poolAddress || null,
    tokenId: refs.tokenId ?? null,
    amountRaw: record.amountRaw ?? null,
    tokenAddress: record.tokenAddress ?? null,
    tokenSymbol: record.tokenSymbol ?? null,
    tokenDecimals: record.tokenDecimals ?? null,
    amount1Raw: refs.amount1Raw ?? null,
    token1Address: refs.token1Address ?? null,
    token1Symbol: refs.token1Symbol ?? null,
    token1Decimals: refs.token1Decimals ?? null,
    lpTokenAmountRaw: refs.lpTokenAmountRaw ?? null,
    feeAmountRaw: refs.feeAmountRaw ?? null,
    fee1AmountRaw: refs.fee1AmountRaw ?? null,
    feeBps: refs.feeBps ?? null,
    protocol: refs.protocol || null,
    txHash: record.txHash ?? null,
    timestamp: record.timestamp ?? null,
  }
}

/**
 * Every liquidity action the account has recorded on `chainId`, newest first as the store
 * returns them. Optionally narrowed to one pool.
 * @param {string} account
 * @param {number} chainId
 * @param {{poolId?: string}} [opts]
 */
export function listLiquidityEntries(account, chainId, { poolId } = {}) {
  const id = evmChainId(chainId)
  if (!account || id == null) return []
  return listClientRecords(account, id)
    .filter((r) => r.class === LEDGER_CLASS.LIQUIDITY)
    .map(readLiquidityEntry)
    .filter((e) => (poolId ? e.poolId === poolId : true))
}

export function createLiquidityLedgerSource(deps = {}) {
  const readClientRecords = deps.listClientRecords || listClientRecords
  return {
    class: LEDGER_CLASS.LIQUIDITY,
    // Reads the local record store only — it cannot fail because a network
    // is down, so it never testifies that a chain went unread (#1280).
    backing: 'client',
    async list({ account, chainId }) {
      return readClientRecords(account, chainId).filter((r) => r.class === LEDGER_CLASS.LIQUIDITY)
    },
  }
}
