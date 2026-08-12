/**
 * Perps venue ABI fragments (spec 083, T010).
 *
 * The fragments are hand-maintained, so nothing but a test stands between a typo and calldata that
 * addresses the wrong function. Every selector and topic hash below was read off the DEPLOYED
 * contracts on 2026-08-11 (Gains diamond `0xFF16…f169`, GMX ExchangeRouter `0x7dE3…83f1`, Reader
 * `0xfA26…4184`, DataStore `0xFD70…92d8`, EventEmitter `0xC8ee…22Fb` on Arbitrum). If one of these
 * changes, the venue changed — re-verify against the chain, do not update the expectation.
 */
import { describe, it, expect } from 'vitest'
import { Interface } from 'ethers'
import {
  GAINS_DIAMOND_ABI,
  GAINS_CANCEL_REASON,
  GAINS_TRADING_ACTIVATED,
  GMX_EXCHANGE_ROUTER_ABI,
  GMX_EVENT_EMITTER_ABI,
  GMX_ORDER_TYPE,
  GMX_READER_ABI,
  GMX_DATA_STORE_ABI,
  GMX_SCALES,
} from '../../abis/perps'
import {
  GMX_UI_FEE_FACTOR_PER_BPS,
  GMX_MAX_UI_FEE_FACTOR,
  GMX_MAX_UI_FEE_BPS,
} from '../../lib/perps/feeUnits'

const gains = new Interface(GAINS_DIAMOND_ABI)
const gmxRouter = new Interface(GMX_EXCHANGE_ROUTER_ABI)
const gmxEvents = new Interface(GMX_EVENT_EMITTER_ABI)
const gmxReader = new Interface(GMX_READER_ABI)
const gmxDataStore = new Interface(GMX_DATA_STORE_ABI)

describe('Gains diamond fragments', () => {
  it('matches the selectors verified on the deployed diamond', () => {
    expect(gains.getFunction('openTrade').selector).toBe('0x5bfcc4f8')
    expect(gains.getFunction('closeTradeMarket').selector).toBe('0x36ce736b')
    expect(gains.getFunction('getMarketOrdersTimeoutBlocks').selector).toBe('0xa4bdee80')
  })

  it('carries exactly the management surface the contract doc names', () => {
    const names = new Set()
    gains.forEachFunction((f) => names.add(f.name))
    expect([...names].sort()).toEqual([
      'cancelOrderAfterTimeout',
      'closeTradeMarket',
      'decreasePositionSize',
      'getCollateral',
      'getCollaterals',
      'getMarketOrdersTimeoutBlocks',
      'getPendingOrders',
      'getTrade',
      'getTradeInfos',
      'getTrades',
      'getTradingActivated',
      'increasePositionSize',
      'multicall',
      'openTrade',
      'updateLeverage',
      'updateMaxClosingSlippageP',
      'updateSl',
      'updateTp',
    ])
  })

  it('the Trade tuple is the 15-field v10 shape, not the v9 one', () => {
    const [trade] = gains.getFunction('openTrade').inputs
    expect(trade.components.map((c) => c.name)).toEqual([
      'user',
      'index',
      'pairIndex',
      'leverage',
      'long',
      'isOpen',
      'collateralIndex',
      'tradeType',
      'collateralAmount',
      'openPrice',
      'tp',
      'sl',
      // v9 had a single trailing uint192 __placeholder here; v10 split it into these three.
      'isCounterTrade',
      'positionSizeToken',
      '__placeholder',
    ])
    // collateralAmount is uint120 in the collateral token's own decimals — a uint256 here would
    // encode a value the venue silently truncates.
    expect(trade.components[8].type).toBe('uint120')
  })

  it('getCollateral keeps the uint88 placeholder that positions precision correctly', () => {
    const [collateral] = gains.getFunction('getCollateral').outputs
    expect(collateral.components.map((c) => c.name)).toEqual([
      'collateral',
      'isActive',
      '__placeholder',
      'precision',
      'precisionDelta',
    ])
  })

  it('the two index spaces are distinguishable by parameter name in the ABI itself', () => {
    // cancelOrderAfterTimeout takes a PENDING-ORDER index; everything else takes a TRADE index.
    expect(gains.getFunction('cancelOrderAfterTimeout').inputs[0].name).toBe('_orderIndex')
    for (const fn of ['closeTradeMarket', 'updateTp', 'updateSl', 'updateLeverage', 'decreasePositionSize', 'increasePositionSize', 'updateMaxClosingSlippageP']) {
      expect(gains.getFunction(fn).inputs[0].name).toBe('_index')
    }
  })

  it('matches the event topic hashes observed in live diamond logs', () => {
    expect(gains.getEvent('MarketOrderInitiated').topicHash).toBe(
      '0x3a60290d7335bce64a807e90f39655517bb5fa702423fa8fac283a5ea16d3a97',
    )
    expect(gains.getEvent('MarketExecuted').topicHash).toBe(
      '0xbdc1265da95238ea4c775f66ac8fe748af83982c4b356ac4d0c28a0f512c0a8b',
    )
    expect(gains.getEvent('MarketOpenCanceled').topicHash).toBe(
      '0x7eff27ae2299e6454b6a721ec354924d1ceecda0edc94618ebfeb5b9b6483e5e',
    )
    expect(gains.getEvent('CollateralReturnedAfterTimeout').topicHash).toBe(
      '0xf7be13f33d17f250cf33acce625397fe761b23c88564ff5d92b9b0dcd5804373',
    )
  })

  it('the CancelReason values match the ones the state machine maps to text', () => {
    expect(GAINS_CANCEL_REASON.SLIPPAGE).toBe(3)
    expect(GAINS_CANCEL_REASON.EXPOSURE_LIMITS).toBe(6)
    expect(GAINS_CANCEL_REASON.PRICE_IMPACT).toBe(7)
    expect(GAINS_CANCEL_REASON.MAX_LEVERAGE).toBe(8)
    expect(GAINS_CANCEL_REASON.NOT_HIT).toBe(11)
    expect(GAINS_CANCEL_REASON.LIQ_REACHED).toBe(12)
  })

  it('CLOSE_ONLY sits between ACTIVATED and PAUSED — exits stay open in it', () => {
    expect(GAINS_TRADING_ACTIVATED).toEqual({ ACTIVATED: 0, CLOSE_ONLY: 1, PAUSED: 2 })
  })
})

describe('GMX fragments', () => {
  it('matches the selectors found in the deployed contracts', () => {
    expect(gmxRouter.getFunction('createOrder').selector).toBe('0xf59c48eb')
    expect(gmxRouter.getFunction('cancelOrder').selector).toBe('0x7489ec23')
    expect(gmxRouter.getFunction('updateOrder').selector).toBe('0xdd5baad2')
    expect(gmxRouter.getFunction('sendWnt').selector).toBe('0x7d39aaf1')
    expect(gmxRouter.getFunction('sendTokens').selector).toBe('0xe6d66ac8')
    expect(gmxRouter.getFunction('multicall').selector).toBe('0xac9650d8')
    expect(gmxRouter.getFunction('setUiFeeFactor').selector).toBe('0x5a03cd94')
    expect(gmxRouter.getFunction('claimUiFees').selector).toBe('0x01a9cbb2')
    expect(gmxReader.getFunction('getAccountPositions').selector).toBe('0x77cfb162')
    expect(gmxDataStore.getFunction('getUint').selector).toBe('0xbd02d0f5')
  })

  it('CreateOrderParamsAddresses puts uiFeeReceiver where it belongs and nowhere else', () => {
    const addresses = gmxRouter.getFunction('createOrder').inputs[0].components[0]
    expect(addresses.components.map((c) => c.name)).toEqual([
      'receiver', // the MEMBER — payout target, not ownership
      'cancellationReceiver', // the MEMBER or 0
      'callbackContract', // 0
      'uiFeeReceiver', // the ONLY FairWins address permitted in this calldata
      'market',
      'initialCollateralToken',
      'swapPath',
    ])
  })

  it('CreateOrderParamsNumbers is the 8-field shape in venue order', () => {
    const numbers = gmxRouter.getFunction('createOrder').inputs[0].components[1]
    expect(numbers.components.map((c) => c.name)).toEqual([
      'sizeDeltaUsd',
      'initialCollateralDeltaAmount',
      'triggerPrice',
      'acceptablePrice',
      'executionFee',
      'callbackGasLimit',
      'minOutputAmount',
      'validFromTime',
    ])
  })

  it('the order types are the venue enum values, not positional guesses', () => {
    expect(GMX_ORDER_TYPE).toEqual({
      MARKET_INCREASE: 2,
      MARKET_DECREASE: 4,
      LIMIT_DECREASE: 5,
      STOP_LOSS_DECREASE: 6,
    })
  })

  it('Position.Props is decoded in full — all 14 static words', () => {
    const [propsArray] = gmxReader.getFunction('getAccountPositions').outputs
    const [addresses, numbers, flags] = propsArray.arrayChildren.components
    expect(addresses.components.map((c) => c.name)).toEqual(['account', 'market', 'collateralToken'])
    expect(numbers.components.map((c) => c.name)).toEqual([
      'sizeInUsd',
      'sizeInTokens',
      'collateralAmount',
      'pendingImpactAmount',
      'borrowingFactor',
      'fundingFeeAmountPerSize',
      'longTokenClaimableFundingAmountPerSize',
      'shortTokenClaimableFundingAmountPerSize',
      'increasedAtTime',
      'decreasedAtTime',
    ])
    expect(flags.components.map((c) => c.name)).toEqual(['isLong'])
    // Props is fully static, so the array stride is the field count. Dropping a trailing field
    // would still decode — into garbage from element 1 onward.
    expect(addresses.components.length + numbers.components.length + flags.components.length).toBe(14)
    // pendingImpactAmount is routinely negative; as uint256 it reads as ~2^256.
    expect(numbers.components[3].type).toBe('int256')
  })

  it('a real Position.Props[] payload decodes to the values it was read with', () => {
    // Captured from Reader.getAccountPositions on Arbitrum, 2026-08-11 — two positions, so the
    // element stride is exercised, which a single-element fixture would not do.
    const raw =
      '0x' +
      '0000000000000000000000000000000000000000000000000000000000000020' +
      '0000000000000000000000000000000000000000000000000000000000000002' +
      '000000000000000000000000d504dc1ac094f45272f46b25a2874bdab45132da' +
      '00000000000000000000000009400d9db990d5ed3f35d7be61dfaeb900af03c9' +
      '000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e5831' +
      '0000000000000000000000000000000000013ed7f8dc314c71620f3e23f6d980' +
      '00000000000000000000000000000000000000000000000000000013ce0fbd5d' +
      '00000000000000000000000000000000000000000000000000000001818788b3' +
      'fffffffffffffffffffffffffffffffffffffffffffffffffffffffffe883b57' +
      '00000000000000000000000000000000000000041da528b32edf9211ade7f5f0' +
      '00000000000000000000000000000000000000000000001ce9d4437c41a0bb23' +
      '000000000000000000000000000000000000000000000007ef74a5a447fe2930' +
      '000000000000000000000000000000000000000000000009c1e3de07e2ac44e4' +
      '000000000000000000000000000000000000000000000000000000006a7b1392' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000001' +
      '000000000000000000000000d504dc1ac094f45272f46b25a2874bdab45132da' +
      '0000000000000000000000000df2be76f517bcf0000abffcb6344b3b2ac4cc4f' +
      '000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e5831' +
      '0000000000000000000000000000000000013e06cb95531118d774d31f295790' +
      '000000000000000000000000000000000000000000000000147511ab501ae3b2' +
      '000000000000000000000000000000000000000000000000000000018035b002' +
      'ffffffffffffffffffffffffffffffffffffffffffffffffffff6ecf4121caa0' +
      '00000000000000000000000000000000000000005c0d6606530080cc61e4bbe7' +
      '000000000000000000000000000000000000000000000002c7f524371e88e33f' +
      '000000000000000000000000000000000000000000003775ca6a9bb7b52cc691' +
      '000000000000000000000000000000000000000000000000e3a0926db2189ddb' +
      '000000000000000000000000000000000000000000000000000000006a7bbbbb' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000001'
    const [positions] = gmxReader.decodeFunctionResult('getAccountPositions', raw)
    expect(positions.length).toBe(2)
    const [first] = positions
    expect(first.addresses.account).toBe('0xd504dC1ac094F45272f46b25A2874bDab45132Da')
    expect(first.addresses.collateralToken).toBe('0xaf88d065e77c8cC2239327C5EDb3A432268e5831')
    // 1e30 notional -> ~$6,466.92, against 6,468.11 USDC (1e6) of collateral: ~1x.
    expect(first.numbers.sizeInUsd / 10n ** 30n).toBe(6466n)
    expect(first.numbers.collateralAmount).toBe(6468110515n)
    // Negative pending impact — the reason this field must be int256.
    expect(first.numbers.pendingImpactAmount).toBeLessThan(0n)
    // A timestamp, not a block number.
    expect(first.numbers.increasedAtTime).toBeGreaterThan(1_700_000_000n)
    expect(first.flags.isLong).toBe(true)
  })

  it('the EventEmitter topic hashes match live Arbitrum logs', () => {
    // EventLog1 was confirmed against a PositionIncrease log; EventLog2 against an OrderCreated
    // one. The hash covers the whole EventLogData struct, so a trimmed shape matches nothing.
    expect(gmxEvents.getEvent('EventLog1').topicHash).toBe(
      '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160',
    )
    expect(gmxEvents.getEvent('EventLog2').topicHash).toBe(
      '0x468a25a7ba624ceea6e540ad6f49171b52495b648417ae91bca21676d8a24dc5',
    )
  })
})

describe('the ownership invariant, at the ABI level', () => {
  it('Gains has no ownership parameter at all — the venue writes _msgSender()', () => {
    // Nothing in the management surface takes an owner/account/trader argument, so there is no
    // field a FairWins address could be placed in.
    const inputNames = []
    gains.forEachFunction((f) => {
      if (f.name.startsWith('get')) return
      for (const input of f.inputs) inputNames.push(input.name)
    })
    expect(inputNames.filter((n) => /user|account|trader|owner/i.test(n))).toEqual([])
  })

  it('GMX exposes exactly one FairWins-addressable field, and it is uiFeeReceiver', () => {
    const addresses = gmxRouter.getFunction('createOrder').inputs[0].components[0]
    const names = addresses.components.map((c) => c.name)
    expect(names.filter((n) => /uiFee/i.test(n))).toEqual(['uiFeeReceiver'])
    // receiver and cancellationReceiver exist, and belong to the member. Their presence is the
    // hazard; the calldata builders' tests assert what actually gets written into them.
    expect(names).toContain('receiver')
    expect(names).toContain('cancellationReceiver')
  })

  // The UI-fee scale is stated in two places: beside the ABI (documentation for a reader of the
  // fragments) and in feeUnits.js (the module that actually converts). They agree today, and two
  // sources of one number is precisely the drift this repo keeps paying for — so pin them equal
  // and let a divergence fail loudly here rather than silently misprice a member's fee by 10x.
  it('the GMX fee scale has one value, however many places state it', () => {
    expect(GMX_SCALES.UI_FEE_FACTOR_PER_BPS).toBe(GMX_UI_FEE_FACTOR_PER_BPS)
    // ...and the ceiling is exactly the per-bps scale times the venue's 10 bps limit, so a change
    // to either constant that does not keep that relation is caught too.
    expect(GMX_MAX_UI_FEE_FACTOR).toBe(GMX_UI_FEE_FACTOR_PER_BPS * BigInt(GMX_MAX_UI_FEE_BPS))
  })
})
