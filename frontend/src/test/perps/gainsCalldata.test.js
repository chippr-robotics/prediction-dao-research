/**
 * Gains venue calldata (spec 083, T013).
 *
 * Everything here is asserted by DECODING the bytes a member would sign, not by inspecting the
 * builder's inputs: the failure this suite exists to catch is an encoding that looks right and
 * means something else — a 1000x order from a missing scale, a management call aimed at the wrong
 * object because the two uint32 index spaces were crossed, or a FairWins address sitting in the
 * ownership field.
 */
import { describe, it, expect } from 'vitest'
import { Interface, ZeroAddress, getAddress } from 'ethers'
import { GAINS_DIAMOND_ABI, GAINS_CANCEL_REASON } from '../../abis/perps/gainsDiamond'
import { GAINS_DIAMOND_BY_CHAIN } from '../../config/perps'
import {
  GAINS_DEFAULT_CLOSING_SLIPPAGE_P,
  GainsIndexSpaceError,
  CANCEL_REASON_TEXT,
  cancelReasonText,
  buildApprovalCall,
  buildCancelOrderAfterTimeoutCall,
  buildCloseTradeCall,
  buildOpenTradeCall,
  buildReducePositionCall,
  buildUpdateSlCall,
  buildUpdateTpCall,
  decodeMarketExecuted,
  decodeMarketOpenCanceled,
  decodeMarketOrderInitiated,
  isPendingOrderIndex,
  isTradeIndex,
  pendingOrderIndex,
  tradeIndex,
} from '../../lib/perps/venues/gains'

const diamond = new Interface(GAINS_DIAMOND_ABI)
const erc20 = new Interface(['function approve(address spender, uint256 value) returns (bool)'])

const ARBITRUM = 42161
const DIAMOND_ARBITRUM = GAINS_DIAMOND_BY_CHAIN[ARBITRUM]
const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
/** Stands in for FairWins' Gains referrer — the only FairWins address allowed in this calldata. */
const FAIRWINS_REFERRER = '0x5250FA9f9C0E86ee3B0F35ed5B4C7D9B7b47f6e1'
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

/** 100 USDC in the collateral token's OWN decimals (1e6) — never 1e18. */
const HUNDRED_USDC = 100_000_000n

function openCall(overrides = {}) {
  return buildOpenTradeCall({
    chainId: ARBITRUM,
    trader: MEMBER,
    pairIndex: 0,
    collateralIndex: 3,
    collateralAmount: HUNDRED_USDC,
    leverage: 10,
    long: true,
    openPrice: 63412.5,
    maxSlippageP: 1,
    referrer: FAIRWINS_REFERRER,
    ...overrides,
  })
}

function decodeOpen(call) {
  const [trade, maxSlippageP, referrer] = diamond.decodeFunctionData('openTrade', call.data)
  return { trade, maxSlippageP, referrer }
}

describe('openTrade calldata', () => {
  it('targets the diamond and carries no value', () => {
    const call = openCall()
    expect(call.target).toBe(DIAMOND_ARBITRUM)
    expect(call.value).toBe(0n)
    expect(call.data.slice(0, 10)).toBe(diamond.getFunction('openTrade').selector)
  })

  it('encodes every field at the venue scale it is read at', () => {
    const { trade, maxSlippageP } = decodeOpen(openCall())
    expect(trade.pairIndex).toBe(0n)
    // 10x at 1e3.
    expect(trade.leverage).toBe(10_000n)
    expect(trade.long).toBe(true)
    expect(trade.isOpen).toBe(true)
    // collateralIndex is 1-BASED and passed through untouched.
    expect(trade.collateralIndex).toBe(3n)
    expect(trade.tradeType).toBe(0n)
    // The collateral token's own decimals (USDC 1e6). At 1e18 this would be 1e12 times too large.
    expect(trade.collateralAmount).toBe(100_000_000n)
    // 63,412.5 at 1e10.
    expect(trade.openPrice).toBe(634_125_000_000_000n)
    // 1% at 1e3.
    expect(maxSlippageP).toBe(1_000n)
  })

  it('scales tp and sl at 1e10 and encodes an absent one as the venue’s own 0', () => {
    const { trade } = decodeOpen(openCall({ tp: 70000, sl: 60000.25 }))
    expect(trade.tp).toBe(700_000_000_000_000n)
    expect(trade.sl).toBe(600_002_500_000_000n)
    const bare = decodeOpen(openCall())
    expect(bare.trade.tp).toBe(0n)
    expect(bare.trade.sl).toBe(0n)
  })

  it('takes a bigint in venue units unchanged, so a value read back from the diamond round-trips', () => {
    // A tp read from getTrades comes back already at 1e10; re-sending it must not rescale it.
    const { trade } = decodeOpen(openCall({ tp: 700_000_000_000_000n }))
    expect(trade.tp).toBe(700_000_000_000_000n)
  })

  it('leaves the fields the venue overwrites at their documented zeros', () => {
    const { trade } = decodeOpen(openCall())
    expect(trade.index).toBe(0n)
    expect(trade.positionSizeToken).toBe(0n)
    expect(trade.__placeholder).toBe(0n)
    expect(trade.isCounterTrade).toBe(false)
  })

  it('refuses a JS number for the collateral amount', () => {
    // 100 here would mean 100 base units — 0.0001 USDC — not 100 USDC.
    expect(() => openCall({ collateralAmount: 100 })).toThrow(/bigint/i)
  })

  it('refuses an open with no price to bound slippage against', () => {
    expect(() => openCall({ openPrice: 0 })).toThrow(/greater than zero/)
  })
})

describe('the ownership invariant in constructed calldata', () => {
  it('writes the MEMBER into Trade.user', () => {
    const { trade } = decodeOpen(openCall())
    expect(getAddress(trade.user)).toBe(getAddress(MEMBER))
  })

  it('puts no FairWins address anywhere inside the Trade tuple', () => {
    const { trade, referrer } = decodeOpen(openCall())
    const inTuple = trade
      .toArray()
      .filter((v) => typeof v === 'string' && v.startsWith('0x') && v.length === 42)
      .map((v) => getAddress(v))
    expect(inTuple).toEqual([getAddress(MEMBER)])
    // The referrer is FairWins' — and it lives in its own argument, which is not an ownership field.
    expect(getAddress(referrer)).toBe(getAddress(FAIRWINS_REFERRER))
    expect(inTuple).not.toContain(getAddress(FAIRWINS_REFERRER))
  })

  it('degrades an unset referrer to the zero address rather than blocking the open', () => {
    const { referrer, trade } = decodeOpen(openCall({ referrer: null }))
    expect(referrer).toBe(ZeroAddress)
    expect(getAddress(trade.user)).toBe(getAddress(MEMBER))
  })
})

describe('approval', () => {
  it('approves THE DIAMOND on the collateral token, for the exact amount', () => {
    const call = buildApprovalCall({ chainId: ARBITRUM, token: USDC_ARBITRUM, amount: HUNDRED_USDC })
    // The target is the token; the SPENDER is the diamond — the same address the trade call goes to.
    expect(call.target).toBe(USDC_ARBITRUM)
    const [spender, amount] = erc20.decodeFunctionData('approve', call.data)
    expect(getAddress(spender)).toBe(getAddress(DIAMOND_ARBITRUM))
    expect(amount).toBe(HUNDRED_USDC)
    expect(spender).toBe(openCall().target)
  })
})

describe('closing', () => {
  it('emits the bare close when no tolerance is supplied', () => {
    const call = buildCloseTradeCall({
      chainId: ARBITRUM,
      tradeIndex: tradeIndex(7),
      expectedPrice: 63412.5,
    })
    expect(call.target).toBe(DIAMOND_ARBITRUM)
    const [index, price] = diamond.decodeFunctionData('closeTradeMarket', call.data)
    expect(index).toBe(7n)
    expect(price).toBe(634_125_000_000_000n)
  })

  it('emits multicall([updateMaxClosingSlippageP, closeTradeMarket]) when one is', () => {
    // closeTradeMarket has no slippage parameter; the venue's own SDK pairs the two calls.
    const call = buildCloseTradeCall({
      chainId: ARBITRUM,
      tradeIndex: tradeIndex(7),
      expectedPrice: 63412.5,
      maxSlippageP: GAINS_DEFAULT_CLOSING_SLIPPAGE_P,
    })
    const [inner] = diamond.decodeFunctionData('multicall', call.data)
    expect(inner.length).toBe(2)
    const [slipIndex, slippage] = diamond.decodeFunctionData('updateMaxClosingSlippageP', inner[0])
    expect(slipIndex).toBe(7n)
    expect(slippage).toBe(1_000n)
    const [closeIndex, price] = diamond.decodeFunctionData('closeTradeMarket', inner[1])
    expect(closeIndex).toBe(7n)
    expect(price).toBe(634_125_000_000_000n)
    // Order matters: the tolerance must be stored before the close reads it.
    expect(inner[0].slice(0, 10)).toBe(diamond.getFunction('updateMaxClosingSlippageP').selector)
    expect(inner[1].slice(0, 10)).toBe(diamond.getFunction('closeTradeMarket').selector)
  })

  it('refuses a close with no price to bound slippage against', () => {
    expect(() =>
      buildCloseTradeCall({ chainId: ARBITRUM, tradeIndex: tradeIndex(7), expectedPrice: 0 }),
    ).toThrow(/greater than zero/)
  })
})

describe('reduce, take-profit and stop-loss', () => {
  it('encodes decreasePositionSize with the collateral in token units and leverage at 1e3', () => {
    const call = buildReducePositionCall({
      chainId: ARBITRUM,
      tradeIndex: tradeIndex(2),
      collateralDelta: 50_000_000n,
      expectedPrice: 63412.5,
    })
    const [index, collateralDelta, leverageDelta, price] = diamond.decodeFunctionData(
      'decreasePositionSize',
      call.data,
    )
    expect(index).toBe(2n)
    expect(collateralDelta).toBe(50_000_000n)
    expect(leverageDelta).toBe(0n)
    expect(price).toBe(634_125_000_000_000n)
  })

  it('encodes a leverage-only reduction at 1e3', () => {
    const call = buildReducePositionCall({
      chainId: ARBITRUM,
      tradeIndex: tradeIndex(2),
      leverageDelta: 2.5,
      expectedPrice: 63412.5,
    })
    const [, collateralDelta, leverageDelta] = diamond.decodeFunctionData('decreasePositionSize', call.data)
    expect(collateralDelta).toBe(0n)
    expect(leverageDelta).toBe(2_500n)
  })

  it('refuses a reduction that changes nothing', () => {
    expect(() =>
      buildReducePositionCall({ chainId: ARBITRUM, tradeIndex: tradeIndex(2), expectedPrice: 1 }),
    ).toThrow(/collateralDelta or a leverageDelta/)
  })

  it('encodes updateTp / updateSl at 1e10, and a removal as 0', () => {
    const tp = buildUpdateTpCall({ chainId: ARBITRUM, tradeIndex: tradeIndex(1), tp: 70000 })
    expect(diamond.decodeFunctionData('updateTp', tp.data)[1]).toBe(700_000_000_000_000n)
    const sl = buildUpdateSlCall({ chainId: ARBITRUM, tradeIndex: tradeIndex(1), sl: 60000 })
    expect(diamond.decodeFunctionData('updateSl', sl.data)[1]).toBe(600_000_000_000_000n)
    const cleared = buildUpdateSlCall({ chainId: ARBITRUM, tradeIndex: tradeIndex(1), sl: null })
    expect(diamond.decodeFunctionData('updateSl', cleared.data)[1]).toBe(0n)
  })
})

describe('THE INDEX TRAP', () => {
  it('brands the two spaces distinctly', () => {
    expect(isTradeIndex(tradeIndex(4))).toBe(true)
    expect(isPendingOrderIndex(tradeIndex(4))).toBe(false)
    expect(isPendingOrderIndex(pendingOrderIndex(4))).toBe(true)
    expect(isTradeIndex(pendingOrderIndex(4))).toBe(false)
    // Same number, different objects — which is exactly why a bare 4 may never cross a boundary.
    expect(tradeIndex(4).value).toBe(pendingOrderIndex(4).value)
  })

  it('refuses a TRADE index in cancelOrderAfterTimeout', () => {
    expect(() =>
      buildCancelOrderAfterTimeoutCall({ chainId: ARBITRUM, pendingOrderIndex: tradeIndex(4) }),
    ).toThrow(GainsIndexSpaceError)
    expect(() =>
      buildCancelOrderAfterTimeoutCall({ chainId: ARBITRUM, pendingOrderIndex: tradeIndex(4) }),
    ).toThrow(/different order/)
  })

  it('refuses a PENDING-ORDER index in every trade call', () => {
    const bad = pendingOrderIndex(4)
    const builders = [
      () => buildCloseTradeCall({ chainId: ARBITRUM, tradeIndex: bad, expectedPrice: 1 }),
      () => buildReducePositionCall({ chainId: ARBITRUM, tradeIndex: bad, collateralDelta: 1n, expectedPrice: 1 }),
      () => buildUpdateTpCall({ chainId: ARBITRUM, tradeIndex: bad, tp: 1 }),
      () => buildUpdateSlCall({ chainId: ARBITRUM, tradeIndex: bad, sl: 1 }),
    ]
    for (const build of builders) {
      expect(build).toThrow(GainsIndexSpaceError)
      expect(build).toThrow(/pending-order index/)
    }
  })

  it('refuses a raw number in either space', () => {
    expect(() => buildCloseTradeCall({ chainId: ARBITRUM, tradeIndex: 4, expectedPrice: 1 })).toThrow(
      GainsIndexSpaceError,
    )
    expect(() => buildCancelOrderAfterTimeoutCall({ chainId: ARBITRUM, pendingOrderIndex: 4 })).toThrow(
      GainsIndexSpaceError,
    )
  })

  it('encodes the recovery call from a pending-order index', () => {
    const call = buildCancelOrderAfterTimeoutCall({
      chainId: ARBITRUM,
      pendingOrderIndex: pendingOrderIndex(4),
    })
    expect(call.target).toBe(DIAMOND_ARBITRUM)
    expect(diamond.decodeFunctionData('cancelOrderAfterTimeout', call.data)[0]).toBe(4n)
  })

  it('refuses an index outside uint32', () => {
    expect(() => tradeIndex(-1)).toThrow(GainsIndexSpaceError)
    expect(() => pendingOrderIndex(2 ** 32)).toThrow(GainsIndexSpaceError)
    expect(() => tradeIndex('nope')).toThrow(GainsIndexSpaceError)
  })
})

describe('unsupported chains', () => {
  it('refuses to build for a chain Gains is not deployed on', () => {
    // A null target would be a transaction to the zero address with the member's collateral on it.
    expect(() => buildApprovalCall({ chainId: 1, token: USDC_ARBITRUM, amount: 1n })).toThrow(
      /not deployed on chain 1/,
    )
    expect(() => openCall({ chainId: 63 })).toThrow(/not deployed/)
  })
})

describe('event decoding', () => {
  const initiated = diamond.encodeEventLog('MarketOrderInitiated', [[MEMBER, 9], MEMBER, 0, true])
  const canceled = diamond.encodeEventLog('MarketOpenCanceled', [
    [MEMBER, 9],
    MEMBER,
    0,
    GAINS_CANCEL_REASON.SLIPPAGE,
    HUNDRED_USDC,
  ])
  const executedTrade = [
    MEMBER, 5, 0, 10_000, true, true, 3, 0, HUNDRED_USDC, 634_125_000_000_000n, 0, 0, false, 0, 0,
  ]
  const executed = diamond.encodeEventLog('MarketExecuted', [
    [MEMBER, 9],
    MEMBER,
    5,
    executedTrade,
    true,
    634_125_000_000_000n,
    634_130_000_000_000n,
    570_000_000_000_000n,
    [0, 0, 0, 0, 0, 0],
    0,
    0,
    100_000_000n,
  ])

  it('MarketOrderInitiated yields a PENDING-ORDER index', () => {
    const decoded = decodeMarketOrderInitiated(initiated)
    expect(isPendingOrderIndex(decoded.pendingOrderIndex)).toBe(true)
    expect(decoded.pendingOrderIndex.value).toBe(9)
    expect(decoded.open).toBe(true)
    expect(getAddress(decoded.trader)).toBe(getAddress(MEMBER))
  })

  it('MarketExecuted yields a TRADE index and the venue’s own numbers', () => {
    const decoded = decodeMarketExecuted(executed)
    expect(isTradeIndex(decoded.tradeIndex)).toBe(true)
    expect(decoded.tradeIndex.value).toBe(5)
    // Venue units, unscaled: 1e10 prices, 1e3 leverage, collateral in the token's own decimals.
    expect(decoded.trade.openPrice).toBe(634_125_000_000_000n)
    expect(decoded.trade.leverage).toBe(10_000n)
    expect(decoded.trade.collateralAmount).toBe(HUNDRED_USDC)
    expect(decoded.liqPrice).toBe(570_000_000_000_000n)
  })

  it('MarketOpenCanceled carries the venue’s reason, mapped to its own words', () => {
    const decoded = decodeMarketOpenCanceled(canceled)
    expect(decoded.cancelReason).toBe(GAINS_CANCEL_REASON.SLIPPAGE)
    expect(decoded.cancelReasonText).toBe(CANCEL_REASON_TEXT[GAINS_CANCEL_REASON.SLIPPAGE])
    expect(decoded.collateralReturned).toBe(HUNDRED_USDC)
    // Recovery from a cancelled open is by pending-order index.
    expect(isPendingOrderIndex(decoded.pendingOrderIndex)).toBe(true)
  })

  it('every decoder is total over foreign, mismatched and malformed logs', () => {
    const junk = [
      null,
      undefined,
      {},
      { topics: [], data: '0x' },
      { topics: ['0x' + '11'.repeat(32)], data: '0xdead' },
      // A real event from this very ABI, but not the one being asked for.
      initiated,
    ]
    for (const log of junk) {
      expect(() => decodeMarketExecuted(log)).not.toThrow()
      expect(decodeMarketExecuted(log)).toBeNull()
      expect(decodeMarketOpenCanceled(log)).toBeNull()
    }
    expect(decodeMarketOrderInitiated(executed)).toBeNull()
  })
})

describe('cancel reason text', () => {
  it('maps exactly the six reasons the contract doc names', () => {
    expect(Object.keys(CANCEL_REASON_TEXT).map(Number).sort((a, b) => a - b)).toEqual([3, 6, 7, 8, 11, 12])
  })

  it('renders an unmapped reason as its number rather than inventing a cause', () => {
    expect(cancelReasonText(9)).toBe('Gains cancel reason 9')
    expect(cancelReasonText(GAINS_CANCEL_REASON.LIQ_REACHED)).toBe(
      'The position would have been liquidated immediately.',
    )
    // Total: junk in, null out — the caller renders '—'.
    expect(cancelReasonText(null)).toBeNull()
    expect(cancelReasonText('nope')).toBeNull()
  })
})
