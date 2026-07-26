/**
 * bridgeLedgerSource tests (spec 067, T071) — one entry per bridge carrying both
 * networks and both hashes (FR-035), `direction: 'none'` (FR-036), idempotent
 * reconciliation, and the rule that only destination-side evidence completes a
 * bridge (FR-009).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  BRIDGE_STATE,
  bridgeEntryId,
  captureBridgeSubmission,
  captureBridgeState,
  createBridgeLedgerSource,
  listBridgeEntries,
  readBridgeEntry,
} from '../../data/ledger/sources/bridgeLedgerSource'
import { listClientRecords, listAllClientRecords } from '../../data/ledger/ledgerClientStore'
import { normalizeEntry } from '../../data/ledger/normalize'
import { LEDGER_CLASS, LEDGER_STATUS } from '../../data/ledger/constants'

const ACCOUNT = '0x3333333333333333333333333333333333333333'
const ORIGIN = 137
const DESTINATION = 8453
const SRC_TX = '0x' + 'a1'.repeat(32)
const DST_TX = '0x' + 'b2'.repeat(32)
const REFUND_TX = '0x' + 'c3'.repeat(32)

const SUBMISSION = {
  depositId: '90210',
  destinationChainId: DESTINATION,
  srcTxHash: SRC_TX,
  amountRaw: '25000000',
  tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  feeAmountRaw: '12500',
  feeBps: 5,
  outputAmountRaw: '24960000',
  recipient: ACCOUNT,
  expectedBy: 1_800_000_060_000,
  at: 1_800_000_000_000,
}

const bridges = (chainId = ORIGIN) =>
  listClientRecords(ACCOUNT, chainId).filter((r) => r.class === LEDGER_CLASS.BRIDGE)

beforeEach(() => {
  localStorage.clear()
})

describe('captureBridgeSubmission', () => {
  it('records ONE pending entry carrying both networks and the origin hash', () => {
    const entryId = captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
    expect(entryId).toBe(bridgeEntryId(ORIGIN, '90210'))
    expect(entryId).toBe('cl:bridge:137:90210')

    const records = bridges()
    expect(records).toHaveLength(1)
    const [r] = records
    expect(r.class).toBe(LEDGER_CLASS.BRIDGE)
    expect(r.kind).toBe('bridge_transfer')
    expect(r.chainId).toBe(ORIGIN)
    expect(r.refs.destinationChainId).toBe(DESTINATION)
    expect(r.txHash).toBe(SRC_TX)
    expect(r.refs.srcTxHash).toBe(SRC_TX)
    expect(r.refs.dstTxHash).toBe(null)
    expect(r.status).toBe(LEDGER_STATUS.PENDING)
    expect(r.refs.bridgeState).toBe(BRIDGE_STATE.SUBMITTED)
    expect(r.refs.settlementProtocol).toBe('Across')
  })

  it('is neither income nor a disposal — direction none, only the fee is a cost (FR-036)', () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
    const [r] = bridges()
    expect(r.direction).toBe('none')
    expect(r.valueUsd ?? null).toBe(null)
    expect(r.refs.feeAmountRaw).toBe('12500')
    expect(r.refs.feeBps).toBe(5)
  })

  it('is idempotent — re-capturing the same depositId does not add a second entry', () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
    captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
    expect(bridges()).toHaveLength(1)
  })

  it('refuses Bitcoin string network ids on either side (FR-006)', () => {
    expect(captureBridgeSubmission(ACCOUNT, 'bitcoin', SUBMISSION)).toBe(null)
    expect(
      captureBridgeSubmission(ACCOUNT, ORIGIN, { ...SUBMISSION, destinationChainId: 'bitcoin' }),
    ).toBe(null)
    expect(bridges()).toHaveLength(0)
    expect(listAllClientRecords(ACCOUNT, ORIGIN)).toHaveLength(0)
  })

  it('refuses a same-network "bridge" and inputs with no deposit id or origin hash', () => {
    expect(
      captureBridgeSubmission(ACCOUNT, ORIGIN, { ...SUBMISSION, destinationChainId: ORIGIN }),
    ).toBe(null)
    expect(captureBridgeSubmission(ACCOUNT, ORIGIN, { ...SUBMISSION, depositId: null })).toBe(null)
    expect(captureBridgeSubmission(ACCOUNT, ORIGIN, { ...SUBMISSION, srcTxHash: null })).toBe(null)
    expect(captureBridgeSubmission(null, ORIGIN, SUBMISSION)).toBe(null)
    expect(bridges()).toHaveLength(0)
  })
})

describe('captureBridgeState', () => {
  beforeEach(() => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
  })

  it('supersedes rather than duplicates — still ONE visible entry per bridge (FR-035)', () => {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.SOURCE_CONFIRMED })
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.IN_FLIGHT })

    expect(bridges()).toHaveLength(1)
    expect(listAllClientRecords(ACCOUNT, ORIGIN)).toHaveLength(3) // audit history kept
    const [r] = bridges()
    expect(r.refs.bridgeState).toBe(BRIDGE_STATE.IN_FLIGHT)
    expect(r.refs.supersedes).toBe('cl:bridge:137:90210:source_confirmed')
    expect(r.status).toBe(LEDGER_STATUS.PENDING)
  })

  it('promotes to settled ONLY with a destination transaction hash (FR-009)', () => {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.IN_FLIGHT })

    // Claimed delivered with no destination evidence — held in flight, still pending.
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.DELIVERED })
    let [r] = bridges()
    expect(r.status).toBe(LEDGER_STATUS.PENDING)
    expect(r.refs.bridgeState).toBe(BRIDGE_STATE.IN_FLIGHT)
    expect(r.refs.dstTxHash).toBe(null)

    // With the destination hash it settles, keeping both hashes on one entry.
    captureBridgeState(ACCOUNT, ORIGIN, {
      depositId: '90210',
      state: BRIDGE_STATE.DELIVERED,
      dstTxHash: DST_TX,
    })
    ;[r] = bridges()
    expect(r.status).toBe(LEDGER_STATUS.SETTLED)
    expect(r.refs.bridgeState).toBe(BRIDGE_STATE.DELIVERED)
    expect(r.refs.srcTxHash).toBe(SRC_TX)
    expect(r.refs.dstTxHash).toBe(DST_TX)
    expect(r.direction).toBe('none')
  })

  it('a delivered claim before the transfer is even confirmed cannot skip ahead', () => {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.DELIVERED })
    const [r] = bridges()
    expect(r.refs.bridgeState).toBe(BRIDGE_STATE.IN_FLIGHT)
    expect(r.status).toBe(LEDGER_STATUS.PENDING)
  })

  it('records a refund as cancelled only with the returning transaction (FR-009)', () => {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.REFUNDED })
    let [r] = bridges()
    expect(r.refs.bridgeState).toBe(BRIDGE_STATE.NEEDS_ATTENTION)
    expect(r.status).toBe(LEDGER_STATUS.PENDING)

    captureBridgeState(ACCOUNT, ORIGIN, {
      depositId: '90210',
      state: BRIDGE_STATE.REFUNDED,
      refundTxHash: REFUND_TX,
    })
    ;[r] = bridges()
    expect(r.status).toBe(LEDGER_STATUS.CANCELLED)
    expect(r.refs.refundTxHash).toBe(REFUND_TX)
  })

  it('needs_attention is not terminal — it still resolves to delivered', () => {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.NEEDS_ATTENTION })
    expect(bridges()[0].status).toBe(LEDGER_STATUS.PENDING)
    captureBridgeState(ACCOUNT, ORIGIN, {
      depositId: '90210',
      state: BRIDGE_STATE.DELIVERED,
      dstTxHash: DST_TX,
    })
    const [r] = bridges()
    expect(r.refs.bridgeState).toBe(BRIDGE_STATE.DELIVERED)
    expect(r.status).toBe(LEDGER_STATUS.SETTLED)
  })

  it('never walks backwards and never overwrites a terminal outcome', () => {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.IN_FLIGHT })
    expect(
      captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.SUBMITTED }),
    ).toBe(null)
    expect(bridges()[0].refs.bridgeState).toBe(BRIDGE_STATE.IN_FLIGHT)

    captureBridgeState(ACCOUNT, ORIGIN, {
      depositId: '90210',
      state: BRIDGE_STATE.DELIVERED,
      dstTxHash: DST_TX,
    })
    expect(
      captureBridgeState(ACCOUNT, ORIGIN, {
        depositId: '90210',
        state: BRIDGE_STATE.REFUNDED,
        refundTxHash: REFUND_TX,
      }),
    ).toBe(null)
    expect(bridges()[0].status).toBe(LEDGER_STATUS.SETTLED)
  })

  it('re-reporting the current state on a later reconciliation writes nothing', () => {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.IN_FLIGHT })
    expect(
      captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.IN_FLIGHT }),
    ).toBe(null)
    expect(listAllClientRecords(ACCOUNT, ORIGIN)).toHaveLength(2)
  })

  it('ignores unknown states, uncaptured bridges, and non-EVM origins', () => {
    expect(captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: 'probably_fine' })).toBe(null)
    expect(captureBridgeState(ACCOUNT, ORIGIN, { depositId: 'never-seen', state: BRIDGE_STATE.IN_FLIGHT })).toBe(null)
    expect(captureBridgeState(ACCOUNT, 'bitcoin', { depositId: '90210', state: BRIDGE_STATE.IN_FLIGHT })).toBe(null)
    expect(bridges()[0].refs.bridgeState).toBe(BRIDGE_STATE.SUBMITTED)
  })

  it('carries the failed leaf when the origin transaction reverted', () => {
    captureBridgeState(ACCOUNT, ORIGIN, {
      depositId: '90210',
      state: BRIDGE_STATE.FAILED,
      failureReason: 'execution reverted: RouteDisabled',
    })
    const [r] = bridges()
    expect(r.status).toBe(LEDGER_STATUS.FAILED)
    expect(r.failureReason).toBe('execution reverted: RouteDisabled')
  })
})

describe('reading bridges back', () => {
  it('survives an app restart with its true state (the store is the only home)', () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: '90210', state: BRIDGE_STATE.IN_FLIGHT })

    // Simulated restart: nothing in memory, everything re-read from storage.
    const [entry] = listBridgeEntries(ACCOUNT, ORIGIN)
    expect(entry.state).toBe(BRIDGE_STATE.IN_FLIGHT)
    expect(entry.originChainId).toBe(ORIGIN)
    expect(entry.destinationChainId).toBe(DESTINATION)
    expect(entry.srcTxHash).toBe(SRC_TX)
    expect(entry.dstTxHash).toBe(null)
    expect(entry.feeAmountRaw).toBe('12500')
    expect(entry.expectedBy).toBe(1_800_000_060_000)
    expect(entry.settlementProtocol).toBe('Across')
  })

  it('keeps every bridge field through normalizeEntry (refs survives, mirrors do not)', () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
    const normalized = normalizeEntry(bridges()[0], { account: ACCOUNT, chainId: ORIGIN })
    expect(normalized.class).toBe(LEDGER_CLASS.BRIDGE)
    expect(normalized.direction).toBe('none')
    expect(normalized.refs.destinationChainId).toBe(DESTINATION)
    expect(normalized.refs.srcTxHash).toBe(SRC_TX)
    expect(readBridgeEntry(normalized).destinationChainId).toBe(DESTINATION)
  })

  it('readBridgeEntry ignores records of other classes', () => {
    expect(readBridgeEntry({ class: LEDGER_CLASS.TRANSFER })).toBe(null)
    expect(readBridgeEntry(null)).toBe(null)
  })

  it('the source lists only BRIDGE-class records for the origin chain', async () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
    const source = createBridgeLedgerSource()
    expect(source.class).toBe(LEDGER_CLASS.BRIDGE)
    const listed = await source.list({ account: ACCOUNT, chainId: ORIGIN })
    expect(listed).toHaveLength(1)
    expect(listed.every((r) => r.class === LEDGER_CLASS.BRIDGE)).toBe(true)
    expect(await source.list({ account: ACCOUNT, chainId: DESTINATION })).toHaveLength(0)
  })

  it('listBridgeEntries refuses non-EVM chain ids', () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
    expect(listBridgeEntries(ACCOUNT, 'bitcoin')).toEqual([])
  })
})
