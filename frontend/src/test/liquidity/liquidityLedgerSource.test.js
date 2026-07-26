/**
 * liquidityLedgerSource tests (spec 067, T104 — data-model.md "LiquidityEntry").
 *
 * The rules worth breaking a build over:
 *   - class is `'liquidity'`, never `'pool'` (that is a WAGER pool — research R6);
 *   - `poolId` and `poolKind` ride on every entry, so bridge and trading positions stay
 *     distinguishable forever;
 *   - a platform fee is recorded ONLY where one can be charged: zero for every withdrawal and
 *     every fee claim (FR-030), zero for a bridge supply (fee-free — research R3), the amount
 *     actually charged for a trading supply;
 *   - an unreported fee is `null` (unknown), never `0` — those are different claims;
 *   - one transaction can carry both a withdrawal and a fees claim, and they are two entries.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  LIQUIDITY_ACTION,
  chargesPlatformFee,
  liquidityEntryId,
  captureLiquidityAction,
  readLiquidityEntry,
  listLiquidityEntries,
  createLiquidityLedgerSource,
} from '../../data/ledger/sources/liquidityLedgerSource'
import { listClientRecords } from '../../data/ledger/ledgerClientStore'
import { normalizeEntry } from '../../data/ledger/normalize'
import { LEDGER_CLASS, LEDGER_STATUS, LEDGER_DIRECTION } from '../../data/ledger/constants'
import { LIQUIDITY_POOL_KIND } from '../../lib/liquidity/liquidityCopy'

const ACCOUNT = '0x3333333333333333333333333333333333333333'
const CHAIN = 1
const TX = '0x' + 'a1'.repeat(32)
const TX2 = '0x' + 'b2'.repeat(32)
const POOL_ID = '0x' + 'cd'.repeat(32)
const POOL_ADDRESS = '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const TRADING_SUPPLY = {
  type: LIQUIDITY_ACTION.SUPPLY,
  txHash: TX,
  at: 1_800_000_000_000,
  poolId: POOL_ID,
  poolKind: LIQUIDITY_POOL_KIND.TRADING_LP,
  poolAddress: POOL_ADDRESS,
  tokenId: '48211',
  amountRaw: '250000000',
  tokenAddress: USDC,
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  amount1Raw: '80000000000000000',
  token1Address: WETH,
  token1Symbol: 'WETH',
  token1Decimals: 18,
  // What the router ACTUALLY charged, against the amounts Uniswap consumed.
  feeAmountRaw: '625000',
  fee1AmountRaw: '200000000000000',
  feeBps: 25,
}

const BRIDGE_SUPPLY = {
  type: LIQUIDITY_ACTION.SUPPLY,
  txHash: TX2,
  at: 1_800_000_100_000,
  poolId: POOL_ID,
  poolKind: LIQUIDITY_POOL_KIND.BRIDGE_LP,
  poolAddress: '0xc186fA914353c44b2E33eBE05f21846F1048bEda',
  amountRaw: '500000000',
  tokenAddress: USDC,
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  lpTokenAmountRaw: '495000000000000000000',
}

const records = (chainId = CHAIN) =>
  listClientRecords(ACCOUNT, chainId).filter((r) => r.class === LEDGER_CLASS.LIQUIDITY)

beforeEach(() => {
  localStorage.clear()
})

describe('captureLiquidityAction — identity and shape', () => {
  it('records a trading supply as class liquidity, direction out', () => {
    const entryId = captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    expect(entryId).toBe(liquidityEntryId(CHAIN, LIQUIDITY_ACTION.SUPPLY, TX))
    expect(entryId).toBe(`cl:liquidity:1:supply:${TX}`)

    const [r] = records()
    expect(r.class).toBe(LEDGER_CLASS.LIQUIDITY)
    // NOT LEDGER_CLASS.POOL — that means a wager pool (research R6).
    expect(r.class).not.toBe(LEDGER_CLASS.POOL)
    expect(r.kind).toBe('lp_supply')
    expect(r.direction).toBe(LEDGER_DIRECTION.OUT)
    expect(r.status).toBe(LEDGER_STATUS.SETTLED)
    expect(r.txHash).toBe(TX)
    expect(r.chainId).toBe(CHAIN)
    expect(r.timestamp).toBe(1_800_000_000_000)
  })

  it('carries poolId and poolKind so the two kinds stay distinguishable', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    captureLiquidityAction(ACCOUNT, CHAIN, BRIDGE_SUPPLY)
    const kinds = records().map((r) => r.refs.poolKind)
    expect(kinds).toContain(LIQUIDITY_POOL_KIND.TRADING_LP)
    expect(kinds).toContain(LIQUIDITY_POOL_KIND.BRIDGE_LP)
    expect(records().every((r) => r.refs.poolId === POOL_ID)).toBe(true)
  })

  it('names the protocol per kind, without being told', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    captureLiquidityAction(ACCOUNT, CHAIN, BRIDGE_SUPPLY)
    const byTx = Object.fromEntries(records().map((r) => [r.txHash, r.refs.protocol]))
    expect(byTx[TX]).toBe('Uniswap')
    expect(byTx[TX2]).toBe('Across')
  })

  it('keeps the pair’s second leg and the Uniswap token id in refs', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    const [r] = records()
    expect(r.amountRaw).toBe('250000000')
    expect(r.tokenSymbol).toBe('USDC')
    expect(r.refs.amount1Raw).toBe('80000000000000000')
    expect(r.refs.token1Symbol).toBe('WETH')
    expect(r.refs.tokenId).toBe('48211')
  })

  it('normalizes the pool kind from the contract enum too', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, { ...BRIDGE_SUPPLY, poolKind: 1 })
    expect(records()[0].refs.poolKind).toBe(LIQUIDITY_POOL_KIND.BRIDGE_LP)
  })

  it('survives normalizeEntry with its refs intact', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    const normalized = normalizeEntry(records()[0], { account: ACCOUNT, chainId: CHAIN })
    expect(normalized.class).toBe(LEDGER_CLASS.LIQUIDITY)
    expect(normalized.refs.poolId).toBe(POOL_ID)
    expect(normalized.refs.poolKind).toBe(LIQUIDITY_POOL_KIND.TRADING_LP)
    expect(normalized.refs.feeAmountRaw).toBe('625000')
  })

  it('is idempotent — the same action on the same transaction is one entry', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    expect(records()).toHaveLength(1)
  })

  it('keeps a withdrawal and a fees claim from the SAME transaction apart', () => {
    // `decreaseLiquidity` + `collect` in one transaction is two different things in a
    // member's history and in a tax report.
    captureLiquidityAction(ACCOUNT, CHAIN, {
      type: LIQUIDITY_ACTION.WITHDRAW,
      txHash: TX,
      poolId: POOL_ID,
      poolKind: LIQUIDITY_POOL_KIND.TRADING_LP,
      amountRaw: '100000000',
    })
    captureLiquidityAction(ACCOUNT, CHAIN, {
      type: LIQUIDITY_ACTION.FEES_CLAIM,
      txHash: TX,
      poolId: POOL_ID,
      poolKind: LIQUIDITY_POOL_KIND.TRADING_LP,
      amountRaw: '412345',
    })
    const kinds = records().map((r) => r.kind).sort()
    expect(kinds).toEqual(['lp_fees_claim', 'lp_withdraw'])
    expect(new Set(records().map((r) => r.entryId)).size).toBe(2)
  })

  it('refuses to record what it cannot identify, without throwing', () => {
    expect(captureLiquidityAction(null, CHAIN, TRADING_SUPPLY)).toBeNull()
    expect(captureLiquidityAction(ACCOUNT, CHAIN, { ...TRADING_SUPPLY, txHash: null })).toBeNull()
    expect(captureLiquidityAction(ACCOUNT, CHAIN, { ...TRADING_SUPPLY, type: 'rebalance' })).toBeNull()
    // Bitcoin ids are strings and hold no pools (FR-006).
    expect(captureLiquidityAction(ACCOUNT, 'bitcoin', TRADING_SUPPLY)).toBeNull()
    expect(records()).toHaveLength(0)
  })

  it('records a reverted action as FAILED, which moves no value', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, {
      ...TRADING_SUPPLY,
      status: LEDGER_STATUS.FAILED,
      failureReason: 'reverted: PoolRetired',
    })
    const normalized = normalizeEntry(records()[0], { account: ACCOUNT, chainId: CHAIN })
    expect(normalized.status).toBe(LEDGER_STATUS.FAILED)
    expect(normalized.direction).toBe(LEDGER_DIRECTION.NONE)
  })
})

describe('the platform fee is recorded only where one can be charged', () => {
  it('records what a TRADING supply was actually charged', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    const [r] = records()
    expect(r.refs.feeAmountRaw).toBe('625000')
    expect(r.refs.fee1AmountRaw).toBe('200000000000000')
    expect(r.refs.feeBps).toBe(25)
  })

  it('records ZERO for a bridge supply — fee-free, not merely unbilled (research R3)', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, BRIDGE_SUPPLY)
    const [r] = records()
    expect(r.refs.feeAmountRaw).toBe('0')
    expect(r.refs.feeBps).toBe(0)
    expect(chargesPlatformFee(LIQUIDITY_ACTION.SUPPLY, LIQUIDITY_POOL_KIND.BRIDGE_LP)).toBe(false)
  })

  it('records ZERO for every withdrawal and every fees claim (FR-030)', () => {
    for (const type of [LIQUIDITY_ACTION.WITHDRAW, LIQUIDITY_ACTION.FEES_CLAIM]) {
      localStorage.clear()
      captureLiquidityAction(ACCOUNT, CHAIN, {
        type,
        txHash: TX,
        poolId: POOL_ID,
        poolKind: LIQUIDITY_POOL_KIND.TRADING_LP,
        amountRaw: '100000000',
        // A caller that wrongly reports a fee on an exit does not get it recorded: no code
        // path can charge one, so the ledger states zero rather than repeating the claim.
        feeAmountRaw: '999999',
        feeBps: 250,
      })
      const [r] = records()
      expect(r.refs.feeAmountRaw).toBe('0')
      expect(r.refs.fee1AmountRaw).toBe('0')
      expect(r.refs.feeBps).toBe(0)
      expect(chargesPlatformFee(type, LIQUIDITY_POOL_KIND.TRADING_LP)).toBe(false)
    }
  })

  it('records a bridge supply as zero even when a fee is wrongly reported', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, { ...BRIDGE_SUPPLY, feeAmountRaw: '4200', feeBps: 10 })
    expect(records()[0].refs.feeAmountRaw).toBe('0')
    expect(records()[0].refs.feeBps).toBe(0)
  })

  it('records an UNREPORTED chargeable fee as null, never as zero', () => {
    // "You were charged nothing" and "we do not know what you were charged" are different
    // claims, and only one of them can be made from an absent value.
    captureLiquidityAction(ACCOUNT, CHAIN, {
      ...TRADING_SUPPLY,
      feeAmountRaw: undefined,
      fee1AmountRaw: undefined,
      feeBps: undefined,
    })
    const [r] = records()
    expect(r.refs.feeAmountRaw).toBeNull()
    expect(r.refs.fee1AmountRaw).toBeNull()
    expect(r.refs.feeBps).toBeNull()
  })

  it('records a genuine zero rate as zero, with no fee to show', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, {
      ...TRADING_SUPPLY,
      feeAmountRaw: '0',
      fee1AmountRaw: '0',
      feeBps: 0,
    })
    const [r] = records()
    expect(r.refs.feeAmountRaw).toBe('0')
    expect(r.refs.feeBps).toBe(0)
  })
})

describe('reading liquidity activity back', () => {
  it('flattens an entry for the Supply view', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    const entry = readLiquidityEntry(records()[0])
    expect(entry).toMatchObject({
      action: LIQUIDITY_ACTION.SUPPLY,
      kind: 'lp_supply',
      poolId: POOL_ID,
      poolKind: LIQUIDITY_POOL_KIND.TRADING_LP,
      poolAddress: POOL_ADDRESS.toLowerCase(),
      tokenId: '48211',
      amountRaw: '250000000',
      amount1Raw: '80000000000000000',
      feeAmountRaw: '625000',
      protocol: 'Uniswap',
      txHash: TX,
    })
  })

  it('returns null for anything that is not a liquidity entry', () => {
    expect(readLiquidityEntry(null)).toBeNull()
    expect(readLiquidityEntry({ class: LEDGER_CLASS.POOL })).toBeNull()
  })

  it('lists a chain’s entries and narrows to one pool', () => {
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    captureLiquidityAction(ACCOUNT, CHAIN, { ...BRIDGE_SUPPLY, poolId: '0x' + 'ef'.repeat(32) })
    expect(listLiquidityEntries(ACCOUNT, CHAIN)).toHaveLength(2)
    expect(listLiquidityEntries(ACCOUNT, CHAIN, { poolId: POOL_ID })).toHaveLength(1)
    expect(listLiquidityEntries(ACCOUNT, 137)).toEqual([])
    expect(listLiquidityEntries(ACCOUNT, 'bitcoin')).toEqual([])
  })

  it('exposes a ledger source that yields only liquidity records', async () => {
    captureLiquidityAction(ACCOUNT, CHAIN, TRADING_SUPPLY)
    const source = createLiquidityLedgerSource()
    expect(source.class).toBe(LEDGER_CLASS.LIQUIDITY)
    const listed = await source.list({ account: ACCOUNT, chainId: CHAIN })
    expect(listed).toHaveLength(1)
    expect(listed[0].class).toBe(LEDGER_CLASS.LIQUIDITY)
  })
})
