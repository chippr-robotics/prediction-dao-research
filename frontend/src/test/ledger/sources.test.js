/**
 * Spec 051 T009–T015 — the five ledger source adapters.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createWagerLedgerSource } from '../../data/ledger/sources/wagerLedgerSource'
import { createTransferLedgerSource, transferRecordToEntry } from '../../data/ledger/sources/transferLedgerSource'
import { createEarnLedgerSource, captureEarnAction } from '../../data/ledger/sources/earnLedgerSource'
import { createPoolLedgerSource } from '../../data/ledger/sources/poolLedgerSource'
import { createMembershipLedgerSource } from '../../data/ledger/sources/membershipLedgerSource'
import { createStakingLedgerSource } from '../../data/ledger/sources/stakingLedgerSource'
import { createBridgeLedgerSource } from '../../data/ledger/sources/bridgeLedgerSource'
import { createLiquidityLedgerSource } from '../../data/ledger/sources/liquidityLedgerSource'
import { createMiniAppLedgerSource } from '../../data/ledger/sources/miniAppSource'
import { __clearClientLedger } from '../../data/ledger/ledgerClientStore'

const ACCOUNT = '0xabc0000000000000000000000000000000000001'
const TX = '0x' + 'ef'.repeat(32)
const CTX = { account: ACCOUNT, chainId: 137 }

beforeEach(() => __clearClientLedger())

describe('wagerLedgerSource', () => {
  it('maps subgraph WagerTransfer rows to on-chain entries with dedup keys', async () => {
    const src = createWagerLedgerSource({
      listTransfers: async () => [
        {
          wagerId: '7',
          direction: 'payout',
          tokenAddress: '0xToken',
          amountRaw: '2000000',
          fromAddress: '0xEscrow',
          toAddress: ACCOUNT,
          txHash: TX,
          timestamp: 1_700_000_000_000,
        },
      ],
    })
    const [e] = await src.list(CTX)
    expect(e.entryId).toBe(`oc:137:wt:${TX}-7-payout`)
    expect(e.provenance).toBe('onchain')
    expect(e.direction).toBe('in')
    expect(e.timestamp).toBe(1_700_000_000_000)
    expect(e.timestampProvenance).toBe('chain')
    expect(e.refs.dedupKey).toBe('wager:7:payout')
  })

  it('falls back to derived entries on subgraph-less networks — null timestamps, never 0', async () => {
    const src = createWagerLedgerSource({
      listTransfers: async () => null, // no subgraph
      hydrateWagerTimestamps: async (ws) => ws, // hydration exhausted — nothing recovered
      listWagers: async () => [
        {
          id: '9',
          creator: ACCOUNT,
          opponent: '0xother',
          status: 'active',
          creatorStake: '1000000',
          opponentStake: '1000000',
          stakeTokenAddress: '0xtoken',
          createdAt: 0, // RegistrySource has no on-chain creation time
          resolvedAt: null,
        },
      ],
    })
    const entries = await src.list(CTX)
    const mine = entries.find((e) => e.kind === 'deposit')
    expect(mine.entryId).toBe(`dv:137:wager:9:deposit:${ACCOUNT}`)
    expect(mine.provenance).toBe('derived')
    expect(mine.timestamp).toBe(null)
    expect(mine.timestampProvenance).toBe('unavailable')
    expect(mine.txHash).toBe(null)
  })

  it('uses hydrated timestamps on the fallback path when the hydrator supplies them', async () => {
    const src = createWagerLedgerSource({
      listTransfers: async () => null,
      listWagers: async () => [
        {
          id: '9',
          creator: ACCOUNT,
          opponent: null,
          status: 'open',
          creatorStake: '1000000',
          stakeTokenAddress: '0xtoken',
          createdAt: 0,
          resolvedAt: null,
        },
      ],
      hydrateWagerTimestamps: async (wagers) =>
        wagers.map((w) => ({ ...w, createdAt: 1_700_000_123_000 })),
    })
    const [e] = await src.list(CTX)
    expect(e.timestamp).toBe(1_700_000_123_000)
    expect(e.timestampProvenance).toBe('chain')
  })
})

describe('transferLedgerSource', () => {
  const legacyRecord = {
    id: 't-1',
    chainId: 137,
    kind: 'stable',
    symbol: 'USC',
    decimals: 6,
    amount: '7.5',
    from: ACCOUNT,
    to: '0xdest',
    status: 'failed',
    route: 'gasless',
    txHash: null,
    error: 'Smart Account does not have sufficient funds to execute the User Operation.',
    createdAt: 1_760_000_000_000,
    updatedAt: 1_760_000_001_000,
  }

  it('maps legacy transferStore records to failed client entries with the verbatim reason', () => {
    const e = transferRecordToEntry(legacyRecord, { account: ACCOUNT })
    expect(e.entryId).toBe('cl:t-1')
    expect(e.class).toBe('transfer')
    expect(e.status).toBe('failed')
    expect(e.failureReason).toMatch(/sufficient funds/)
    expect(e.refs.route).toBe('gasless')
    expect(e.valueUsd).toBe(7.5) // stable at par
    expect(e.timestampProvenance).toBe('device')
  })

  it('prefers the client-ledger chain over the legacy record for the same transfer', async () => {
    const src = createTransferLedgerSource({
      listClientRecords: () => [
        {
          entryId: 'cl:t-1:u1',
          chainId: 137,
          class: 'transfer',
          kind: 'send',
          status: 'settled',
          provenance: 'client',
          refs: { transferId: 't-1', supersedes: 'cl:t-1' },
        },
      ],
      listTransfers: () => [legacyRecord],
    })
    const entries = await src.list(CTX)
    expect(entries).toHaveLength(1)
    expect(entries[0].entryId).toBe('cl:t-1:u1')
  })

  it('returns legacy records when nothing is mirrored yet (pre-migration)', async () => {
    const src = createTransferLedgerSource({
      listClientRecords: () => [],
      listTransfers: () => [legacyRecord],
    })
    const entries = await src.list(CTX)
    expect(entries).toHaveLength(1)
    expect(entries[0].entryId).toBe('cl:t-1')
  })
})

describe('earnLedgerSource + captureEarnAction', () => {
  it('captures deposit/withdraw/claim actions as settled client entries with txHash', async () => {
    captureEarnAction(ACCOUNT, 137, {
      type: 'earn-deposit',
      txHash: TX,
      at: 1_760_000_000_000,
      vaultAddress: '0xVault',
      amountRaw: '5000000',
      tokenAddress: '0xUsdc',
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
    })
    const src = createEarnLedgerSource()
    const [e] = await src.list(CTX)
    expect(e.class).toBe('earn')
    expect(e.kind).toBe('vault_deposit')
    expect(e.direction).toBe('out')
    expect(e.txHash).toBe(TX)
    expect(e.counterparty).toBe('0xvault')
    expect(e.timestampProvenance).toBe('device')
  })

  it('is idempotent per (type, txHash) — re-capture does not duplicate', async () => {
    const a = { type: 'earn-withdraw', txHash: TX, at: 1, vaultAddress: '0xv', amountRaw: '1' }
    captureEarnAction(ACCOUNT, 137, a)
    captureEarnAction(ACCOUNT, 137, a)
    const src = createEarnLedgerSource()
    expect(await src.list(CTX)).toHaveLength(1)
  })
})

describe('poolLedgerSource', () => {
  it('maps joins, claims, and refunds with block times in ms', async () => {
    const src = createPoolLedgerSource({
      querySubgraph: async () => ({
        poolMembers: [
          { id: 'p-m', buyIn: '1000000', joinedAt: '1700000000', joinTxHash: TX, pool: { id: '0xpool', poolId: '3', token: '0xusdc' } },
        ],
        poolClaims: [
          { id: `${TX}-1`, amount: '3000000', timestamp: '1700000100', txHash: TX, pool: { id: '0xpool', poolId: '3', token: '0xusdc' } },
        ],
        poolRefunds: [],
      }),
    })
    const entries = await src.list(CTX)
    expect(entries).toHaveLength(2)
    const join = entries.find((e) => e.kind === 'pool_join')
    expect(join.direction).toBe('out')
    expect(join.timestamp).toBe(1_700_000_000_000)
    const claim = entries.find((e) => e.kind === 'pool_claim')
    expect(claim.direction).toBe('in')
    expect(claim.refs.poolId).toBe('3')
  })

  /*
   * This used to assert that a missing subgraph "returns an honest empty list". It was not
   * honest, and the word was doing the damage: `ledgerRepository` records a class in
   * `staleClasses` only when its promise REJECTS, so a fulfilled `[]` disclosed nothing. On
   * Mordor — live WagerPoolFactory, no subgraph — every pool join, claim and refund was silently
   * absent from the tax report while the report presented its total as complete. Pools have no
   * RPC enumeration path, so this source is the only producer of LEDGER_CLASS.POOL: its silence
   * was the whole class going missing from a financial document.
   */
  it('REFUSES when the chain has pools but no subgraph, so the gap is disclosed', async () => {
    const src = createPoolLedgerSource({ querySubgraph: async () => null })
    // 137 has a wagerPoolFactory, so an empty result here would be a claim the data cannot support.
    await expect(src.list(CTX)).rejects.toThrow(/no subgraph/)
  })

  it('returns an empty list when the chain has no pool factory at all', async () => {
    // Ethereum Classic is custody-only: there are no pools, so nothing is missing and flagging a
    // gap would be a false alarm.
    const src = createPoolLedgerSource({ querySubgraph: async () => null })
    expect(await src.list({ ...CTX, chainId: 61 })).toEqual([])
  })
})

describe('membershipLedgerSource', () => {
  it('maps voucher purchases (unvalued — price not indexed) and redemptions', async () => {
    const src = createMembershipLedgerSource({
      querySubgraph: async () => ({
        minted: [{ id: '1', tokenId: '1', tier: 2, mintedAt: '1700000000', mintTxHash: TX }],
        redeemed: [{ id: '1', tokenId: '1', tier: 2, redeemedAt: '1700000500', redeemTxHash: TX }],
      }),
    })
    const entries = await src.list(CTX)
    expect(entries).toHaveLength(2)
    const purchase = entries.find((e) => e.kind === 'voucher_purchase')
    expect(purchase.valuationStatus).toBe('unvalued')
    expect(purchase.direction).toBe('out')
    const redeem = entries.find((e) => e.kind === 'voucher_redeem')
    expect(redeem.direction).toBe('none')
  })
})

/**
 * Issue #1280 — `backing` is what makes the repository's `unreadable` verdict
 * mean anything. It is declared per source, so it can silently drift; this
 * asserts the DEFAULT wiring's split rather than a hand-built seam. A new
 * source arriving without a backing counts as network-backed, which is the
 * safe direction (it can only make the ledger more cautious, never less).
 */
describe('ledger sources declare what they had to reach (#1280)', () => {
  it('network-backed sources are the ones that cross an RPC or subgraph', () => {
    expect(createWagerLedgerSource().backing).toBe('network')
    expect(createPoolLedgerSource().backing).toBe('network')
    expect(createMembershipLedgerSource().backing).toBe('network')
  })

  it('client-store sources never testify that a chain went unread', async () => {
    const [transfer, earn, staking, bridge, liquidity, miniapp] = [
      createTransferLedgerSource(),
      createEarnLedgerSource(),
      createStakingLedgerSource(),
      createBridgeLedgerSource(),
      createLiquidityLedgerSource(),
      createMiniAppLedgerSource(),
    ]
    for (const src of [transfer, earn, staking, bridge, liquidity, miniapp]) {
      expect(src.backing).toBe('client')
      // …and the claim is true: with no network at all they still FULFIL,
      // which is exactly why their answering proves nothing about the chain.
      await expect(src.list({ ...CTX, provider: null })).resolves.toBeInstanceOf(Array)
    }
  })
})
