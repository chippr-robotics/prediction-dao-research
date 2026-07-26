/**
 * Spec 051 T039 — FR-002 cross-surface consistency: no activity surface may
 * show a financial event that is absent from the ledger.
 *
 * Automated slice: every transfer the device log (Pay & Transfer Activity's
 * old backing store) knows about resolves to a ledger entry with the same
 * identity, status, and failure reason; every earn action captured beside the
 * notification buffer resolves to a ledger entry carrying the same txHash.
 *
 * Spec 067 T117 extends the same rule to the two new domains: a bridge and a
 * liquidity supply must be REACHABLE through the assembled ledger (an
 * unregistered source is invisible however carefully it was written), a bridge
 * must read as ONE movement across two networks (FR-035) that is neither income
 * nor a disposal (FR-036), and a liquidity position must never be mistakable
 * for a WAGER pool (FR-039).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { recordTransfer, updateTransfer, listTransfers, __clearTransfers, TRANSFER_STATUS } from '../../lib/transfer/transferStore'
import { queueEarnAction, peekEarnActions } from '../../lib/earn/earnActivityBuffer'
import { captureEarnAction } from '../../data/ledger/sources/earnLedgerSource'
import { createTransferLedgerSource } from '../../data/ledger/sources/transferLedgerSource'
import { createEarnLedgerSource } from '../../data/ledger/sources/earnLedgerSource'
import {
  BRIDGE_STATE,
  bridgeEntryId,
  captureBridgeSubmission,
  captureBridgeState,
  createBridgeLedgerSource,
} from '../../data/ledger/sources/bridgeLedgerSource'
import {
  LIQUIDITY_ACTION,
  captureLiquidityAction,
  createLiquidityLedgerSource,
} from '../../data/ledger/sources/liquidityLedgerSource'
import { createPoolLedgerSource } from '../../data/ledger/sources/poolLedgerSource'
import { createLedgerRepository } from '../../data/ledger/ledgerRepository'
import { getDefaultLedgerRepository } from '../../data/ledger'
import { LEDGER_CLASS, LEDGER_DIRECTION, LEDGER_STATUS } from '../../data/ledger/constants'
import { LIQUIDITY_POOL_KIND } from '../../lib/liquidity/liquidityCopy'
import { __clearClientLedger, appendClientRecord, listClientRecords } from '../../data/ledger/ledgerClientStore'

const ACCOUNT = '0xAbc0000000000000000000000000000000000039'
const TX = '0x' + '39'.repeat(32)

// Spec 067 fixtures — one bridge Polygon → Ethereum, one Uniswap supply.
const ORIGIN = 137
const DESTINATION = 1
const SRC_TX = '0x' + '11'.repeat(32)
const DST_TX = '0x' + '22'.repeat(32)
const LP_TX = '0x' + '33'.repeat(32)
const POOL_TX = '0x' + '44'.repeat(32)
const DEPOSIT_ID = '90210'
const USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'

const BRIDGE = {
  depositId: DEPOSIT_ID,
  destinationChainId: DESTINATION,
  srcTxHash: SRC_TX,
  amountRaw: '250000000',
  tokenAddress: USDC,
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  feeAmountRaw: '250000',
  feeBps: 10,
  recipient: ACCOUNT,
  at: 1_700_000_000_000,
}

/** Enrichment identity — valuation is not what these tests are about. */
const passThroughEnrich = async (entries) => entries

beforeEach(() => {
  __clearTransfers()
  __clearClientLedger()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cross-surface consistency (FR-002)', () => {
  it('every device-log transfer resolves to a ledger entry (incl. failures, verbatim reason)', async () => {
    const ok = recordTransfer(ACCOUNT, { chainId: 137, kind: 'stable', symbol: 'USC', decimals: 6, amount: '5', from: ACCOUNT, to: '0xd', route: 'gasless' })
    updateTransfer(ACCOUNT, ok.id, { status: TRANSFER_STATUS.COMPLETE, txHash: TX })
    const bad = recordTransfer(ACCOUNT, { chainId: 137, kind: 'native', symbol: 'MATIC', decimals: 18, amount: '0.01', from: ACCOUNT, to: '0xd', route: 'gasless' })
    updateTransfer(ACCOUNT, bad.id, { status: TRANSFER_STATUS.FAILED, error: 'Smart Account does not have sufficient funds to execute the User Operation.' })

    const source = createTransferLedgerSource()
    const entries = await source.list({ account: ACCOUNT, chainId: 137 })
    const byTransferId = new Map(entries.map((e) => [e.refs?.transferId, e]))

    for (const record of listTransfers(ACCOUNT, 137)) {
      const entry = byTransferId.get(record.id)
      expect(entry, `transfer ${record.id} missing from ledger`).toBeTruthy()
      if (record.status === TRANSFER_STATUS.FAILED) {
        expect(entry.status).toBe('failed')
        expect(entry.failureReason).toBe(record.error)
      }
    }
  })

  it('every earn action queued for the notification feed has a ledger entry with the same txHash', async () => {
    const action = {
      type: 'earn-deposit',
      refId: '0xvault',
      message: 'Deposited 5 USDC into Vault',
      txHash: TX,
      txUrl: null,
      at: Date.now(),
    }
    queueEarnAction(ACCOUNT, 137, action)
    captureEarnAction(ACCOUNT, 137, {
      type: action.type,
      txHash: action.txHash,
      at: action.at,
      vaultAddress: action.refId,
      amountRaw: '5000000',
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
    })

    const ledgerEntries = await createEarnLedgerSource().list({ account: ACCOUNT, chainId: 137 })
    for (const queued of peekEarnActions(ACCOUNT, 137)) {
      expect(
        ledgerEntries.some((e) => e.txHash === queued.txHash),
        `earn action ${queued.txHash} missing from ledger`,
      ).toBe(true)
    }
  })
})

/** A repository over exactly the sources under test — deterministic, no network. */
function ledgerOf(...sources) {
  return createLedgerRepository({ sources, enrich: passThroughEnrich })
}

async function bridgeEntriesFor(chainId = ORIGIN) {
  const { entries } = await ledgerOf(createBridgeLedgerSource()).listEntries({ account: ACCOUNT, chainId })
  return entries.filter((e) => e.class === LEDGER_CLASS.BRIDGE)
}

describe('spec 067 — bridge and liquidity are reachable ledger activities (T105)', () => {
  it('the default repository collects bridge and liquidity records (an unregistered source is invisible)', async () => {
    // The other domain sources reach a subgraph; answer them with nothing so
    // this test is about registration, not about the network.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) })))

    captureBridgeSubmission(ACCOUNT, ORIGIN, BRIDGE)
    captureLiquidityAction(ACCOUNT, ORIGIN, {
      type: LIQUIDITY_ACTION.SUPPLY,
      txHash: LP_TX,
      poolId: 'uniswap-v3-usdc-weth-005',
      poolKind: LIQUIDITY_POOL_KIND.TRADING_LP,
      amountRaw: '100000000',
      tokenAddress: USDC,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      feeAmountRaw: '100000',
      feeBps: 10,
      at: 1_700_000_100_000,
    })

    const { entries, staleClasses } = await getDefaultLedgerRepository().listEntries({
      account: ACCOUNT,
      chainId: ORIGIN,
    })
    const classes = entries.map((e) => e.class)
    expect(classes).toContain(LEDGER_CLASS.BRIDGE)
    expect(classes).toContain(LEDGER_CLASS.LIQUIDITY)
    // Registered and healthy — neither domain may be silently degraded either.
    expect(staleClasses).not.toContain(LEDGER_CLASS.BRIDGE)
    expect(staleClasses).not.toContain(LEDGER_CLASS.LIQUIDITY)
  })
})

describe('spec 067 — a bridge is ONE entry across two networks (FR-035/FR-036, T106)', () => {
  it('names both networks and both transactions on a single entry', async () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, BRIDGE)
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: DEPOSIT_ID, state: BRIDGE_STATE.SOURCE_CONFIRMED })
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: DEPOSIT_ID, state: BRIDGE_STATE.IN_FLIGHT })
    captureBridgeState(ACCOUNT, ORIGIN, {
      depositId: DEPOSIT_ID,
      state: BRIDGE_STATE.DELIVERED,
      dstTxHash: DST_TX,
    })

    const bridges = await bridgeEntriesFor()
    expect(bridges).toHaveLength(1)
    const [entry] = bridges
    expect(entry.chainId).toBe(ORIGIN)
    expect(entry.destinationChainId).toBe(DESTINATION)
    expect(entry.refs.originChainId).toBe(ORIGIN)
    expect(entry.refs.destinationChainId).toBe(DESTINATION)
    expect(entry.srcTxHash).toBe(SRC_TX)
    expect(entry.dstTxHash).toBe(DST_TX)
    expect(entry.txHash).toBe(SRC_TX)
    expect(entry.status).toBe(LEDGER_STATUS.SETTLED)
    // The logical identity survives every status change (the entryId does not).
    expect(entry.refs.bridgeId).toBe(bridgeEntryId(ORIGIN, DEPOSIT_ID))
  })

  it('collapses divergent observations of the same bridge (a backup restored from a second device)', async () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, BRIDGE)
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: DEPOSIT_ID, state: BRIDGE_STATE.IN_FLIGHT })
    const baseId = bridgeEntryId(ORIGIN, DEPOSIT_ID)

    // The other device saw the destination fill and superseded the SAME base
    // record, so both tips survive the append-only union by entryId.
    appendClientRecord(ACCOUNT, {
      entryId: `${baseId}:delivered`,
      chainId: ORIGIN,
      account: ACCOUNT.toLowerCase(),
      class: LEDGER_CLASS.BRIDGE,
      kind: 'bridge_transfer',
      direction: LEDGER_DIRECTION.NONE,
      status: LEDGER_STATUS.SETTLED,
      provenance: 'client',
      amountRaw: BRIDGE.amountRaw,
      txHash: SRC_TX,
      timestamp: BRIDGE.at,
      timestampProvenance: 'device',
      recordedAt: Date.now() + 1000,
      refs: {
        bridgeId: baseId,
        supersedes: baseId,
        destinationChainId: DESTINATION,
        srcTxHash: SRC_TX,
        dstTxHash: DST_TX,
        bridgeState: BRIDGE_STATE.DELIVERED,
        feeAmountRaw: BRIDGE.feeAmountRaw,
      },
    })
    expect(listClientRecords(ACCOUNT, ORIGIN).filter((r) => r.class === LEDGER_CLASS.BRIDGE)).toHaveLength(2)

    const bridges = await bridgeEntriesFor()
    expect(bridges).toHaveLength(1)
    // The resolved observation wins — a delivered transfer is never re-shown
    // as still in flight, and it is never shown twice.
    expect(bridges[0].status).toBe(LEDGER_STATUS.SETTLED)
    expect(bridges[0].dstTxHash).toBe(DST_TX)
  })

  it('is neither income nor a disposal — only the platform fee is a cost (FR-036)', async () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, BRIDGE)
    captureBridgeState(ACCOUNT, ORIGIN, {
      depositId: DEPOSIT_ID,
      state: BRIDGE_STATE.DELIVERED,
      dstTxHash: DST_TX,
    })

    const bridges = await bridgeEntriesFor()
    expect(bridges).toHaveLength(1)
    const [entry] = bridges
    expect(entry.direction).toBe(LEDGER_DIRECTION.NONE)
    // Nothing moved in and nothing moved out, at any amount.
    expect(bridges.filter((e) => e.direction !== LEDGER_DIRECTION.NONE)).toHaveLength(0)
    expect(entry.amountRaw).toBe(BRIDGE.amountRaw)
    // The fee is the single cost the entry reports, and it is what was charged.
    expect(entry.refs.feeAmountRaw).toBe(BRIDGE.feeAmountRaw)
    expect(Number(entry.refs.feeAmountRaw)).toBeLessThan(Number(entry.amountRaw))
  })

  it('holds a settled claim at pending when no destination transaction backs it (FR-009)', async () => {
    const forged = {
      entryId: 'cl:bridge:137:forged',
      chainId: ORIGIN,
      account: ACCOUNT,
      class: LEDGER_CLASS.BRIDGE,
      kind: 'bridge_transfer',
      direction: LEDGER_DIRECTION.IN, // also a lie: a bridge moves nobody's money in
      status: LEDGER_STATUS.SETTLED,
      provenance: 'client',
      txHash: SRC_TX,
      timestamp: BRIDGE.at,
      timestampProvenance: 'device',
      refs: { bridgeId: 'cl:bridge:137:forged', destinationChainId: DESTINATION, srcTxHash: SRC_TX, bridgeState: BRIDGE_STATE.DELIVERED },
    }
    const { entries, staleClasses } = await ledgerOf({
      class: LEDGER_CLASS.BRIDGE,
      list: async () => [forged],
    }).listEntries({ account: ACCOUNT, chainId: ORIGIN })

    expect(staleClasses).toEqual([])
    expect(entries[0].status).toBe(LEDGER_STATUS.PENDING)
    expect(entries[0].bridgeState).toBe('in_flight')
    expect(entries[0].direction).toBe(LEDGER_DIRECTION.NONE)
  })

  it('refuses a "bridge" that names one network on both sides, but keeps one that is merely incomplete', async () => {
    const bridgeRecord = (overrides) => ({
      entryId: 'cl:bridge:137:x',
      chainId: ORIGIN,
      account: ACCOUNT,
      class: LEDGER_CLASS.BRIDGE,
      kind: 'bridge_transfer',
      direction: LEDGER_DIRECTION.NONE,
      status: LEDGER_STATUS.PENDING,
      provenance: 'client',
      txHash: SRC_TX,
      timestamp: BRIDGE.at,
      timestampProvenance: 'device',
      ...overrides,
    })

    // A movement "between networks" that never leaves one is a false claim.
    const sameNetwork = await ledgerOf({
      class: LEDGER_CLASS.BRIDGE,
      list: async () => [bridgeRecord({ refs: { bridgeId: 'cl:bridge:137:x', destinationChainId: ORIGIN } })],
    }).listEntries({ account: ACCOUNT, chainId: ORIGIN })
    expect(sameNetwork.entries).toEqual([])
    expect(sameNetwork.staleClasses).toEqual([LEDGER_CLASS.BRIDGE])

    // A record that simply does not know its destination is kept and honestly
    // blank — hiding it (and every other bridge with it) would be worse.
    const incomplete = await ledgerOf({
      class: LEDGER_CLASS.BRIDGE,
      list: async () => [bridgeRecord({ refs: { bridgeId: 'cl:bridge:137:x', srcTxHash: SRC_TX } })],
    }).listEntries({ account: ACCOUNT, chainId: ORIGIN })
    expect(incomplete.staleClasses).toEqual([])
    expect(incomplete.entries).toHaveLength(1)
    expect(incomplete.entries[0].destinationChainId).toBeNull()
    expect(incomplete.entries[0].srcTxHash).toBe(SRC_TX)
  })
})

describe('spec 067 — liquidity is never mistakable for a wager pool (FR-039, T117)', () => {
  /** A spec-034 wager pool join, as the pool subgraph reports it. */
  const wagerPoolSource = () =>
    createPoolLedgerSource({
      querySubgraph: async () => ({
        poolMembers: [
          {
            id: 'pm-1',
            buyIn: '20000000',
            joinedAt: 1_700_000_200,
            joinTxHash: POOL_TX,
            pool: { id: '0xpool', poolId: '7', token: USDC },
          },
        ],
        poolClaims: [],
        poolRefunds: [],
      }),
    })

  it('keeps the two apart by class, kind, and identity in one merged ledger', async () => {
    captureLiquidityAction(ACCOUNT, ORIGIN, {
      type: LIQUIDITY_ACTION.SUPPLY,
      txHash: LP_TX,
      poolId: 'uniswap-v3-usdc-weth-005',
      poolKind: LIQUIDITY_POOL_KIND.TRADING_LP,
      amountRaw: '100000000',
      tokenAddress: USDC,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      feeAmountRaw: '100000',
      at: 1_700_000_100_000,
    })

    const { entries } = await ledgerOf(createLiquidityLedgerSource(), wagerPoolSource()).listEntries({
      account: ACCOUNT,
      chainId: ORIGIN,
    })
    const liquidity = entries.filter((e) => e.class === LEDGER_CLASS.LIQUIDITY)
    const wagerPools = entries.filter((e) => e.class === LEDGER_CLASS.POOL)

    expect(liquidity).toHaveLength(1)
    expect(wagerPools).toHaveLength(1)
    // No entry is both, and neither class borrows the other's vocabulary.
    expect(liquidity[0].class).not.toBe(LEDGER_CLASS.POOL)
    expect(liquidity[0].kind).toBe('lp_supply')
    expect(wagerPools[0].kind).toBe('pool_join')
    expect(liquidity[0].entryId).not.toBe(wagerPools[0].entryId)
    // The liquidity entry carries which kind of pool it is, so its disclosures
    // and its fee rule stay attributable forever.
    expect(liquidity[0].refs.poolKind).toBe(LIQUIDITY_POOL_KIND.TRADING_LP)
    expect(wagerPools[0].refs.poolKind).toBeUndefined()
  })

  it('filtering to wager pools never returns a liquidity position, and the reverse', async () => {
    captureLiquidityAction(ACCOUNT, ORIGIN, {
      type: LIQUIDITY_ACTION.SUPPLY,
      txHash: LP_TX,
      poolId: 'across-usdc',
      poolKind: LIQUIDITY_POOL_KIND.BRIDGE_LP,
      amountRaw: '50000000',
      tokenAddress: USDC,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      at: 1_700_000_100_000,
    })
    const repository = ledgerOf(createLiquidityLedgerSource(), wagerPoolSource())

    const pools = await repository.listEntries({
      account: ACCOUNT,
      chainId: ORIGIN,
      filter: { classes: [LEDGER_CLASS.POOL] },
    })
    expect(pools.entries.every((e) => e.class === LEDGER_CLASS.POOL)).toBe(true)
    expect(pools.entries.some((e) => e.kind?.startsWith('lp_'))).toBe(false)

    const supplies = await repository.listEntries({
      account: ACCOUNT,
      chainId: ORIGIN,
      filter: { classes: [LEDGER_CLASS.LIQUIDITY] },
    })
    expect(supplies.entries).toHaveLength(1)
    expect(supplies.entries[0].refs.poolId).toBe('across-usdc')
    // Bridge liquidity is fee-free (research R3) — recorded as charged nothing,
    // which is a different claim from "we do not know".
    expect(supplies.entries[0].refs.feeAmountRaw).toBe('0')
  })
})
