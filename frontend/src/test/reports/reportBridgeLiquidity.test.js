/**
 * Spec 067 T107 — bridge and liquidity activity in generated reports
 * (FR-035/FR-036/FR-039a).
 *
 * The period under test deliberately contains BOTH a cross-chain bridge and a
 * liquidity supply/withdraw pair, plus a wager and a wager-pool entry, because
 * the failure modes only show up together:
 *
 *   - a bridge treated as two legs either doubles its value or nets it to zero;
 *   - a bridge treated as one leg reads as a disposal (or as income) on the
 *     network it left;
 *   - a liquidity pool and a wager pool collapse into one indistinguishable
 *     "pool" line;
 *   - a fee-free path reports "0.00 charged" and a never-reported fee reports
 *     the same thing, which are different claims.
 */
import { describe, it, expect } from 'vitest'
import { createLedgerRepository } from '../../data/ledger/ledgerRepository'
import { buildReport } from '../../data/reports/reportBuilder'
import { render as renderCsv } from '../../data/reports/csvReport'
import { render as renderPdf } from '../../data/reports/pdfReport'
import { resolveCustomPeriod } from '../../utils/reportPeriods'
import {
  classLabel,
  collapseLogical,
  crossChainOf,
  platformFeeOf,
  PLATFORM_FEE_STATUS,
} from '../../data/reports/activityClassification'

const ACCOUNT = '0xabc0000000000000000000000000000000000001'
const CHAIN_ID = 137 // Polygon — the origin network of the bridge
const DEST_CHAIN_ID = 1 // Ethereum — where the same assets arrive
const USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'
const WETH = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'
const TX = (n) => '0x' + String(n).padStart(2, '0').repeat(32)
const T0 = Date.UTC(2026, 2, 1)
const H = 3600_000

const BRIDGE_ID = 'cl:bridge-1'

/** A bridge captured at submission, then superseded by its delivered record. */
const BRIDGE_SUBMITTED = {
  entryId: BRIDGE_ID,
  chainId: CHAIN_ID,
  class: 'bridge',
  kind: 'bridge_transfer',
  direction: 'none',
  status: 'pending',
  provenance: 'client',
  tokenAddress: USDC,
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  amountRaw: '500000000', // 500 USDC
  txHash: TX(11),
  timestamp: T0 + H,
  timestampProvenance: 'device',
  recordedAt: T0 + H,
  refs: {
    bridgeId: BRIDGE_ID,
    depositId: '77',
    originChainId: CHAIN_ID,
    destinationChainId: DEST_CHAIN_ID,
    srcTxHash: TX(11),
    dstTxHash: null,
    bridgeState: 'submitted',
    feeAmountRaw: '1000000', // 1 USDC platform fee — the only cost of the move
    feeBps: 20,
    outputAmountRaw: '498500000',
    recipient: ACCOUNT,
    settlementProtocol: 'Across',
  },
}

const BRIDGE_DELIVERED = {
  ...BRIDGE_SUBMITTED,
  entryId: `${BRIDGE_ID}:delivered`,
  status: 'settled',
  recordedAt: T0 + 2 * H,
  refs: {
    ...BRIDGE_SUBMITTED.refs,
    dstTxHash: TX(12),
    bridgeState: 'delivered',
    supersedes: BRIDGE_ID,
  },
}

/** Trading-pool supply: the fee is what the router actually took, not rate × entered. */
const LP_SUPPLY = {
  entryId: `cl:liquidity:${CHAIN_ID}:supply:${TX(20)}`,
  chainId: CHAIN_ID,
  class: 'liquidity',
  kind: 'lp_supply',
  direction: 'out',
  status: 'settled',
  provenance: 'client',
  tokenAddress: USDC,
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  amountRaw: '200000000', // 200 USDC actually consumed
  txHash: TX(20),
  timestamp: T0 + 3 * H,
  timestampProvenance: 'device',
  refs: {
    action: 'supply',
    poolId: 'trading:0xpool',
    poolKind: 'trading_lp',
    poolAddress: '0xpool',
    amount1Raw: '50000000000000000',
    token1Address: WETH,
    token1Symbol: 'WETH',
    token1Decimals: 18,
    feeAmountRaw: '500000', // 0.5 USDC
    fee1AmountRaw: '0',
    feeBps: 25,
    protocol: 'Uniswap',
  },
}

/** Withdrawals never carry a platform fee — the zero is a fact, not a default. */
const LP_WITHDRAW = {
  entryId: `cl:liquidity:${CHAIN_ID}:withdraw:${TX(21)}`,
  chainId: CHAIN_ID,
  class: 'liquidity',
  kind: 'lp_withdraw',
  direction: 'in',
  status: 'settled',
  provenance: 'client',
  tokenAddress: USDC,
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  amountRaw: '120000000', // 120 USDC back out of the pool
  txHash: TX(21),
  timestamp: T0 + 4 * H,
  timestampProvenance: 'device',
  refs: {
    action: 'withdraw',
    poolId: 'trading:0xpool',
    poolKind: 'trading_lp',
    feeAmountRaw: '0',
    fee1AmountRaw: '0',
    feeBps: 0,
    protocol: 'Uniswap',
  },
}

/** A wager pool in the same period — the "Pool" collision, made concrete. */
const WAGER_POOL = {
  entryId: `oc:137:${TX(30)}:0`,
  chainId: CHAIN_ID,
  class: 'pool',
  kind: 'pool_join',
  direction: 'out',
  status: 'settled',
  provenance: 'onchain',
  tokenAddress: USDC,
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  amountRaw: '25000000',
  txHash: TX(30),
  timestamp: T0 + 5 * H,
  timestampProvenance: 'chain',
  refs: { poolAddress: '0xwagerpool' },
}

const WAGER_DEPOSIT = {
  entryId: `oc:137:${TX(40)}:0`,
  chainId: CHAIN_ID,
  class: 'wager',
  kind: 'deposit',
  direction: 'out',
  status: 'settled',
  provenance: 'onchain',
  tokenAddress: USDC,
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  amountRaw: '100000000',
  txHash: TX(40),
  timestamp: T0 + 6 * H,
  timestampProvenance: 'chain',
  refs: { wagerId: '1' },
}

const FIXTURE = [
  BRIDGE_SUBMITTED,
  BRIDGE_DELIVERED,
  LP_SUPPLY,
  LP_WITHDRAW,
  WAGER_POOL,
  WAGER_DEPOSIT,
]

/** USDC 6dp valued at the par baseline; everything else stays honestly unvalued. */
const enrich = async (entries) =>
  entries.map((e) => {
    const amount = e.amountRaw != null ? Number(e.amountRaw) / 1e6 : null
    return {
      ...e,
      tokenSymbol: e.tokenSymbol || 'USDC',
      tokenDecimals: e.tokenDecimals ?? 6,
      amount,
      valueUsd: amount,
      valuationStatus: amount != null ? 'valued' : 'unvalued',
    }
  })

const PERIOD = resolveCustomPeriod(T0, T0 + 7 * H)
const NETWORK_META = { name: 'Polygon', isTestnet: false, nativeCurrency: { symbol: 'POL' } }

function makeLedger(entries = FIXTURE) {
  return createLedgerRepository({
    sources: [{ class: 'bridge', list: async () => entries }],
    enrich,
  })
}

function build(entries) {
  return buildReport({
    account: ACCOUNT,
    chainId: CHAIN_ID,
    period: PERIOD,
    dataSource: { getTransactionReceipt: async () => null },
    networkMeta: NETWORK_META,
    ledger: makeLedger(entries),
    generatedAt: T0 + 8 * H,
  })
}

describe('reporting: bridge + liquidity (spec 067 FR-035/FR-036)', () => {
  it('reports one line item per bridge, naming both networks and both transactions', async () => {
    const report = await build()
    const bridges = report.lineItems.filter((i) => i.class === 'bridge')
    // The superseded submission is a status snapshot, not a second movement.
    expect(bridges).toHaveLength(1)
    const [b] = bridges
    expect(b.entryId).toBe(`${BRIDGE_ID}:delivered`)
    expect(b.txHash).toBe(TX(11))
    expect(b.destinationTxHash).toBe(TX(12))
    expect(b.destinationChainId).toBe(DEST_CHAIN_ID)
    expect(b.destinationNetworkName).toBe('Ethereum')
    // A self-transfer: the member's own address on both sides, never a blank
    // counterparty.
    expect(b.fromAddress).toBe(ACCOUNT)
    expect(b.toAddress).toBe(ACCOUNT)
  })

  it('does not treat a cross-chain self-transfer as income or as a disposal (FR-036)', async () => {
    const report = await build()
    const bridge = report.totals.byClass.bridge
    expect(bridge.count).toBe(1)
    // Neither side of the income/disposal split moves.
    expect(bridge.inUsd).toBe(0)
    expect(bridge.outUsd).toBe(0)
    expect(bridge.usdValue).toBe(0)
    // The 500 USDC is reported as moved, in its own bucket.
    expect(bridge.movedUsd).toBeCloseTo(500)
    expect(report.totals.overall.movedUsd).toBeCloseTo(500)
    // …and stays out of the overall, which is exactly the other four entries:
    // liquidity 200 out + 120 in, wager pool 25, wager 100.
    expect(report.totals.overall.usdValue).toBeCloseTo(200 + 120 + 25 + 100)
    // The per-token income/disposal columns see only the wager deposit — the
    // 500 moved across networks never lands in any of them.
    const usdc = report.totals.byTicker.USDC
    expect(usdc.deposits).toBe(100)
    expect(usdc.payouts).toBe(0)
    expect(usdc.refunds).toBe(0)
    expect(usdc.net).toBe(-100)
    expect(usdc.moved).toBeCloseTo(500)
    expect(usdc.movedUsd).toBeCloseTo(500)
    expect(usdc.usdValue).toBeCloseTo(445)
  })

  it('neither double-counts the move nor nets it to zero', async () => {
    const report = await build()
    // Naive two-legged treatments: 1000 (both legs added) or 0 (legs cancelled).
    // The honest answer is one 500 movement, reported once, outside the totals
    // that mean income and disposal.
    expect(report.totals.overall.movedUsd).not.toBeCloseTo(1000)
    expect(report.totals.overall.movedUsd).toBeCloseTo(500)
    const bridgeRows = report.lineItems.filter((i) => i.selfTransfer)
    expect(bridgeRows).toHaveLength(1)
    expect(bridgeRows[0].usdValue).toBeCloseTo(500)
  })

  it('attributes the platform fee actually charged as the only cost of the move', async () => {
    const report = await build()
    const bridge = report.lineItems.find((i) => i.class === 'bridge')
    expect(bridge.platformFee.status).toBe(PLATFORM_FEE_STATUS.CHARGED)
    expect(bridge.platformFee.usd).toBeCloseTo(1)
    expect(bridge.platformFee.bps).toBe(20)
    // 1 USDC on the bridge + 0.5 USDC on the supply. Nothing else can charge one.
    expect(report.totals.overall.platformFeesUsd).toBeCloseTo(1.5)
    expect(report.totals.overall.platformFeeUnknownCount).toBe(0)
    expect(report.totals.byClass.bridge.platformFeesUsd).toBeCloseTo(1)
    expect(report.totals.byClass.liquidity.platformFeesUsd).toBeCloseTo(0.5)
  })

  it('includes the liquidity supply and withdrawal with their real fee facts', async () => {
    const report = await build()
    const supply = report.lineItems.find((i) => i.kind === 'lp_supply')
    const withdraw = report.lineItems.find((i) => i.kind === 'lp_withdraw')
    expect(supply.valueDirection).toBe('out')
    expect(supply.usdValue).toBeCloseTo(200)
    expect(supply.platformFee.status).toBe(PLATFORM_FEE_STATUS.CHARGED)
    expect(supply.platformFee.usd).toBeCloseTo(0.5)
    // An exit is fee-free by construction — reported as none, not as unknown.
    // Its value comes back IN, which the kind name alone cannot say.
    expect(withdraw.valueDirection).toBe('in')
    expect(withdraw.platformFee.status).toBe(PLATFORM_FEE_STATUS.NONE)
    expect(withdraw.platformFee.usd).toBe(0)
    expect(report.totals.byClass.liquidity.outUsd).toBeCloseTo(200)
    expect(report.totals.byClass.liquidity.inUsd).toBeCloseTo(120)
  })

  it('keeps liquidity pools and wager pools distinguishable in the totals (FR-039a)', async () => {
    const report = await build()
    expect(report.totals.byClass.pool.label).toBe('Wager Pool')
    expect(report.totals.byClass.liquidity.label).toBe('Liquidity')
    expect(classLabel('pool')).not.toBe(classLabel('liquidity'))
    const csv = renderCsv(report)
    expect(csv).toContain('Wager Pool')
    expect(csv).toContain('Liquidity')
  })

  it('never reports an unreported platform fee as zero', async () => {
    // A chargeable action whose receipt did not report what it took.
    const unreported = {
      ...LP_SUPPLY,
      entryId: `cl:liquidity:${CHAIN_ID}:supply:${TX(22)}`,
      txHash: TX(22),
      timestamp: T0 + 3.5 * H,
      refs: { ...LP_SUPPLY.refs, feeAmountRaw: null, fee1AmountRaw: null },
    }
    const report = await build([...FIXTURE, unreported])
    const row = report.lineItems.find((i) => i.entryId === unreported.entryId)
    expect(row.platformFee.status).toBe(PLATFORM_FEE_STATUS.UNKNOWN)
    expect(row.platformFee.usd).toBeNull()
    // Excluded from the fee total and disclosed, rather than counted as free.
    expect(report.totals.overall.platformFeesUsd).toBeCloseTo(1.5)
    expect(report.totals.overall.platformFeeUnknownCount).toBe(1)
    const csv = renderCsv(report)
    expect(csv).toContain('unknown')
    expect(csv).toMatch(/could not be valued in USD/i)
  })

  it('exports the cross-chain facts and the treatment on one CSV row', async () => {
    const report = await build()
    const csv = renderCsv(report)
    expect(csv).toContain('Destination Network')
    expect(csv).toContain('Destination Transaction Hash')
    expect(csv).toContain('Platform Fee')
    // Both hashes and both networks are present, untruncated.
    expect(csv).toContain(TX(11))
    expect(csv).toContain(TX(12))
    expect(csv).toContain('Ethereum')
    // …on the SAME row: one bridge, one line.
    const bridgeRows = csv.split('\n').filter((l) => l.includes('bridge_transfer'))
    expect(bridgeRows).toHaveLength(1)
    expect(bridgeRows[0]).toContain(TX(11))
    expect(bridgeRows[0]).toContain(TX(12))
    // The treatment is stated, not left to be inferred from the numbers.
    expect(csv).toMatch(/not income and not a disposal/i)
    expect(csv).toContain('Moved between your own networks')
  })

  it('states the cross-chain treatment only when the period contains one', async () => {
    const withBridge = await build()
    expect(withBridge.selfTransferNote).toMatch(/not income and not a disposal/i)
    const withoutBridge = await build([LP_SUPPLY, LP_WITHDRAW])
    expect(withoutBridge.selfTransferNote).toBeNull()
    expect(withoutBridge.totals.overall.movedUsd).toBe(0)
    expect(renderCsv(withoutBridge)).not.toContain('Moved between your own networks')
  })

  it('renders a PDF containing the bridge and liquidity period', async () => {
    const blob = renderPdf(await build())
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(500)
  })
})

describe('activityClassification (spec 067 T107)', () => {
  it('collapses a supersede chain and any duplicate record for one bridge', () => {
    const kept = collapseLogical([BRIDGE_SUBMITTED, BRIDGE_DELIVERED, LP_SUPPLY])
    expect(kept.map((e) => e.entryId)).toEqual([`${BRIDGE_ID}:delivered`, LP_SUPPLY.entryId])

    // Safety net: two surviving records for the same bridge with no supersede
    // link are still ONE bridge, and the furthest-progressed one wins.
    const orphan = { ...BRIDGE_DELIVERED, entryId: 'cl:bridge-1:orphan', refs: { ...BRIDGE_DELIVERED.refs, supersedes: undefined } }
    const collapsed = collapseLogical([BRIDGE_SUBMITTED, orphan])
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].status).toBe('settled')
  })

  it('is idempotent over an already-collapsed set', () => {
    const once = collapseLogical(FIXTURE)
    expect(collapseLogical(once)).toEqual(once)
  })

  it('does not rename an unknown destination network into a known one', () => {
    const cross = crossChainOf({
      ...BRIDGE_DELIVERED,
      refs: { ...BRIDGE_DELIVERED.refs, destinationChainId: 999_999 },
    })
    expect(cross.destinationNetworkName).toBe('Chain 999999')
  })

  it('reports no platform fee concept for activities that have none', () => {
    expect(platformFeeOf(WAGER_DEPOSIT).status).toBe(PLATFORM_FEE_STATUS.NOT_APPLICABLE)
    expect(platformFeeOf(WAGER_DEPOSIT).usd).toBeNull()
  })

  it('values a fee on the entry’s own basis and leaves an unvaluable leg out of USD', () => {
    // Leg 1 is denominated in the pair's other token; the entry carries no basis
    // for it, so the USD total is withheld rather than valued at the wrong price.
    const pairFee = platformFeeOf({
      ...LP_SUPPLY,
      amount: 200,
      valueUsd: 200,
      refs: { ...LP_SUPPLY.refs, fee1AmountRaw: '1000000000000000' },
    })
    expect(pairFee.status).toBe(PLATFORM_FEE_STATUS.CHARGED)
    expect(pairFee.legs).toHaveLength(2)
    expect(pairFee.legs[0].usd).toBeCloseTo(0.5)
    expect(pairFee.legs[1].usd).toBeNull()
    expect(pairFee.usd).toBeNull()
  })
})
