/**
 * GMX v2 venue calldata (spec 083, T014).
 *
 * Everything is asserted by DECODING the bytes a member would sign, not by inspecting the builder's
 * inputs: the failures this suite exists to catch all produce calldata that looks right and means
 * something else — a FairWins address sitting where GMX reads the position's payout target, an
 * approval aimed at the ExchangeRouter instead of the Router, a protection order that outlives its
 * position, or a 1e30 value off by a factor of anything.
 */
import { describe, it, expect } from 'vitest'
import { Interface, ZeroAddress, ZeroHash, getAddress, zeroPadValue } from 'ethers'
import {
  GMX_EXCHANGE_ROUTER_ABI,
  GMX_ORDER_TYPE,
  GMX_ORDER_EVENT_NAMES,
} from '../../abis/perps/gmxExchangeRouter'
import { GMX_READER_ABI } from '../../abis/perps/gmxReader'
import { GMX_ADDRESSES_BY_CHAIN } from '../../config/perps'
import {
  GMX_CHAIN_ID,
  GMX_EVENT_LOG2_TOPIC,
  GMX_EXECUTION_FEE_BUFFER_BPS,
  GMX_FLOAT_PRECISION,
  GMX_ORACLE_PRICE_COUNT_BASE,
  GMX_USD_DECIMALS,
  applyFactor,
  buildApprovalCall,
  buildCancelOrderCall,
  buildClosePositionCalls,
  buildOpenPositionCalls,
  buildProtectionCalls,
  buildUpdateOrderCall,
  decodeAccountPositions,
  estimateExecutionFee,
  eventTopicsForAccount,
  fromUsdUnits,
  positionKey,
  toUsdUnits,
} from '../../lib/perps/venues/gmx'

const router = new Interface(GMX_EXCHANGE_ROUTER_ABI)
const reader = new Interface(GMX_READER_ABI)
const erc20 = new Interface(['function approve(address spender, uint256 value) returns (bool)'])

const ARBITRUM = 42161
const GMX = GMX_ADDRESSES_BY_CHAIN[ARBITRUM]

const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
/** Stands in for FairWins' GMX UI-fee receiver — the only FairWins address allowed in this calldata. */
const FAIRWINS_UI_FEE_RECEIVER = '0x5250FA9f9C0E86ee3B0F35ed5B4C7D9B7b47f6e1'
/** GMX's BTC/USD market token on Arbitrum. */
const MARKET = '0x47c031236e19d024b42f8AE6780E44A573170703'
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

/** 100 USDC in the collateral token's OWN decimals (1e6) — never 1e18. */
const HUNDRED_USDC = 100_000_000n
/** 1,000 USD of notional at GMX's 1e30 scale. */
const THOUSAND_USD = 1_000n * 10n ** 30n
const EXECUTION_FEE = 1_500_000_000_000_000n // 0.0015 ETH

const ORDER_KEY = '0x1e5b7f1a2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7'

function openCall(overrides = {}) {
  return buildOpenPositionCalls({
    chainId: ARBITRUM,
    account: MEMBER,
    market: MARKET,
    collateralToken: USDC,
    collateralAmount: HUNDRED_USDC,
    sizeDeltaUsd: THOUSAND_USD,
    acceptablePrice: 63_500n * 10n ** 30n,
    executionFee: EXECUTION_FEE,
    isLong: true,
    uiFeeReceiver: FAIRWINS_UI_FEE_RECEIVER,
    ...overrides,
  })
}

function closeCall(overrides = {}) {
  return buildClosePositionCalls({
    chainId: ARBITRUM,
    account: MEMBER,
    market: MARKET,
    collateralToken: USDC,
    collateralAmount: HUNDRED_USDC,
    sizeDeltaUsd: THOUSAND_USD,
    acceptablePrice: 62_500n * 10n ** 30n,
    executionFee: EXECUTION_FEE,
    isLong: true,
    uiFeeReceiver: FAIRWINS_UI_FEE_RECEIVER,
    ...overrides,
  })
}

function protectionCalls(overrides = {}) {
  return buildProtectionCalls({
    chainId: ARBITRUM,
    account: MEMBER,
    market: MARKET,
    collateralToken: USDC,
    isLong: true,
    executionFee: EXECUTION_FEE,
    stopLoss: { triggerPrice: 60_000n * 10n ** 30n, acceptablePrice: 0n, sizeDeltaUsd: THOUSAND_USD },
    takeProfit: { triggerPrice: 70_000n * 10n ** 30n, acceptablePrice: 0n, sizeDeltaUsd: THOUSAND_USD },
    uiFeeReceiver: FAIRWINS_UI_FEE_RECEIVER,
    ...overrides,
  })
}

/** Decode a multicall call object into its inner venue calls, in order. */
function inner(call) {
  const [datas] = router.decodeFunctionData('multicall', call.data)
  return datas.map((data) => router.parseTransaction({ data }))
}

function names(call) {
  return inner(call).map((parsed) => parsed.name)
}

function createOrderParams(call) {
  const parsed = inner(call).find((p) => p.name === 'createOrder')
  return parsed.args[0]
}

describe('GMX open position calldata', () => {
  it('is one ExchangeRouter multicall of sendWnt → sendTokens → createOrder, in that order', () => {
    const call = openCall()
    expect(call.target).toBe(GMX.exchangeRouter)
    expect(names(call)).toEqual(['sendWnt', 'sendTokens', 'createOrder'])
  })

  it('carries the execution fee as value, and the sendWnt amount is the same number', () => {
    const call = openCall()
    expect(call.value).toBe(EXECUTION_FEE)
    const [sendWnt] = inner(call)
    expect(sendWnt.args[0]).toBe(GMX.orderVault)
    expect(sendWnt.args[1]).toBe(EXECUTION_FEE)
    expect(createOrderParams(call).numbers.executionFee).toBe(EXECUTION_FEE)
  })

  it('sends the collateral to the OrderVault, in the token’s own decimals', () => {
    const [, sendTokens] = inner(openCall())
    expect(sendTokens.args[0]).toBe(USDC)
    expect(sendTokens.args[1]).toBe(GMX.orderVault)
    expect(sendTokens.args[2]).toBe(HUNDRED_USDC)
  })

  it('is a MarketIncrease with no trigger and no swap path', () => {
    const params = createOrderParams(openCall())
    expect(Number(params.orderType)).toBe(GMX_ORDER_TYPE.MARKET_INCREASE)
    expect(Number(params.orderType)).toBe(2)
    expect(params.numbers.triggerPrice).toBe(0n)
    expect(params.addresses.swapPath).toEqual([])
    expect(params.numbers.sizeDeltaUsd).toBe(THOUSAND_USD)
    expect(params.numbers.initialCollateralDeltaAmount).toBe(HUNDRED_USDC)
    expect(params.isLong).toBe(true)
    expect(params.autoCancel).toBe(false)
  })

  it('refuses malformed input before a wallet prompt rather than encoding it', () => {
    expect(() => openCall({ collateralAmount: 100 })).toThrow(/bigint/)
    expect(() => openCall({ collateralAmount: 0n })).toThrow(/greater than zero/)
    expect(() => openCall({ executionFee: 0n })).toThrow(/greater than zero/)
    expect(() => openCall({ account: 'not-an-address' })).toThrow(/account/)
    expect(() => openCall({ uiFeeReceiver: 'nope' })).toThrow(/uiFeeReceiver/)
    expect(() => openCall({ chainId: 8453 })).toThrow(/not deployed/)
  })
})

describe('GMX close position calldata', () => {
  it('omits sendTokens entirely — a decrease sends nothing but the execution fee', () => {
    const call = closeCall()
    expect(names(call)).toEqual(['sendWnt', 'createOrder'])
    // Belt and braces: the selector itself must be absent from the bytes.
    const sendTokensSelector = router.getFunction('sendTokens').selector.slice(2)
    expect(call.data.toLowerCase()).not.toContain(sendTokensSelector.toLowerCase())
  })

  it('is a MarketDecrease closing notional and withdrawing collateral', () => {
    const params = createOrderParams(closeCall())
    expect(Number(params.orderType)).toBe(GMX_ORDER_TYPE.MARKET_DECREASE)
    expect(Number(params.orderType)).toBe(4)
    expect(params.numbers.sizeDeltaUsd).toBe(THOUSAND_USD)
    expect(params.numbers.initialCollateralDeltaAmount).toBe(HUNDRED_USDC)
    expect(params.numbers.triggerPrice).toBe(0n)
  })

  it('allows a size-only reduce (no collateral withdrawn) but not an empty one', () => {
    const params = createOrderParams(closeCall({ collateralAmount: 0n }))
    expect(params.numbers.initialCollateralDeltaAmount).toBe(0n)
    expect(() => closeCall({ collateralAmount: 0n, sizeDeltaUsd: 0n })).toThrow(/sizeDeltaUsd or a collateralAmount/)
  })

  it('accepts a zero acceptablePrice — the safe bound differs by side, so it is not range-checked', () => {
    const params = createOrderParams(closeCall({ acceptablePrice: 0n }))
    expect(params.numbers.acceptablePrice).toBe(0n)
  })
})

describe('THE OWNERSHIP INVARIANT — uiFeeReceiver is the only FairWins address', () => {
  const build = () => [openCall(), closeCall(), ...protectionCalls()]

  it('names the MEMBER as receiver and cancellationReceiver on every order', () => {
    for (const call of build()) {
      const { addresses } = createOrderParams(call)
      expect(addresses.receiver).toBe(getAddress(MEMBER))
      expect(addresses.cancellationReceiver).toBe(getAddress(MEMBER))
      expect(addresses.receiver).not.toBe(getAddress(FAIRWINS_UI_FEE_RECEIVER))
      expect(addresses.cancellationReceiver).not.toBe(getAddress(FAIRWINS_UI_FEE_RECEIVER))
      // A callback contract would be a third party inside the member's order.
      expect(addresses.callbackContract).toBe(ZeroAddress)
    }
  })

  it('puts the FairWins address in uiFeeReceiver and in no other field', () => {
    for (const call of build()) {
      const { addresses } = createOrderParams(call)
      expect(addresses.uiFeeReceiver).toBe(getAddress(FAIRWINS_UI_FEE_RECEIVER))
      const fairwinsFields = [
        'receiver',
        'cancellationReceiver',
        'callbackContract',
        'market',
        'initialCollateralToken',
      ].filter((field) => addresses[field].toLowerCase() === FAIRWINS_UI_FEE_RECEIVER.toLowerCase())
      expect(fairwinsFields).toEqual([])
    }
  })

  it('mentions the FairWins address exactly once in the whole signed payload', () => {
    const needle = FAIRWINS_UI_FEE_RECEIVER.slice(2).toLowerCase()
    for (const call of build()) {
      const occurrences = call.data.toLowerCase().split(needle).length - 1
      expect(occurrences).toBe(1)
    }
  })

  it('encodes address(0) when no uiFeeReceiver is configured — GMX short-circuits that to no fee', () => {
    for (const unset of [null, undefined, '']) {
      const params = createOrderParams(openCall({ uiFeeReceiver: unset }))
      expect(params.addresses.uiFeeReceiver).toBe(ZeroAddress)
      // The member is still the member: an unset fee receiver changes nothing about ownership.
      expect(params.addresses.receiver).toBe(getAddress(MEMBER))
    }
    const unsetProtection = protectionCalls({ uiFeeReceiver: null })
    for (const call of unsetProtection) {
      expect(createOrderParams(call).addresses.uiFeeReceiver).toBe(ZeroAddress)
    }
  })

  it('derives the position key from the ACCOUNT, so no receiver can redirect it', () => {
    const key = positionKey(MEMBER, MARKET, USDC, true)
    expect(key).toMatch(/^0x[0-9a-f]{64}$/)
    // Same member, different payout target → the same position.
    expect(positionKey(MEMBER, MARKET, USDC, true)).toBe(key)
    // Different member → a different position entirely.
    expect(positionKey(FAIRWINS_UI_FEE_RECEIVER, MARKET, USDC, true)).not.toBe(key)
    expect(positionKey(MEMBER, MARKET, USDC, false)).not.toBe(key)
    expect(positionKey('nope', MARKET, USDC, true)).toBeNull()
  })
})

describe('GMX protection orders', () => {
  it('emits StopLossDecrease and LimitDecrease, stop-loss first', () => {
    const calls = protectionCalls()
    expect(calls).toHaveLength(2)
    expect(Number(createOrderParams(calls[0]).orderType)).toBe(GMX_ORDER_TYPE.STOP_LOSS_DECREASE)
    expect(Number(createOrderParams(calls[0]).orderType)).toBe(6)
    expect(Number(createOrderParams(calls[1]).orderType)).toBe(GMX_ORDER_TYPE.LIMIT_DECREASE)
    expect(Number(createOrderParams(calls[1]).orderType)).toBe(5)
  })

  it('sets autoCancel TRUE on every leg so the order dies with the position', () => {
    for (const call of protectionCalls()) {
      expect(createOrderParams(call).autoCancel).toBe(true)
    }
    // Even when only one leg is asked for.
    const [only] = protectionCalls({ takeProfit: null })
    expect(createOrderParams(only).autoCancel).toBe(true)
  })

  it('carries the trigger price and its own execution fee per leg', () => {
    const [stopLoss, takeProfit] = protectionCalls()
    expect(createOrderParams(stopLoss).numbers.triggerPrice).toBe(60_000n * 10n ** 30n)
    expect(createOrderParams(takeProfit).numbers.triggerPrice).toBe(70_000n * 10n ** 30n)
    expect(stopLoss.value).toBe(EXECUTION_FEE)
    expect(names(stopLoss)).toEqual(['sendWnt', 'createOrder'])
  })

  it('builds only the legs it was given, and refuses an empty request', () => {
    expect(protectionCalls({ takeProfit: null })).toHaveLength(1)
    expect(protectionCalls({ stopLoss: null })).toHaveLength(1)
    expect(() => protectionCalls({ stopLoss: null, takeProfit: null })).toThrow(/stopLoss, a takeProfit/)
  })

  it('requires an explicit acceptablePrice and a positive trigger', () => {
    expect(() => protectionCalls({ stopLoss: { triggerPrice: 60_000n * 10n ** 30n, sizeDeltaUsd: THOUSAND_USD } }))
      .toThrow(/acceptablePrice is required/)
    expect(() => protectionCalls({ stopLoss: { triggerPrice: 0n, acceptablePrice: 0n, sizeDeltaUsd: THOUSAND_USD } }))
      .toThrow(/triggerPrice must be greater than zero/)
  })
})

describe('GMX approval', () => {
  it('approves GMX’s Router, NOT the ExchangeRouter this module calls', () => {
    const call = buildApprovalCall({ chainId: ARBITRUM, token: USDC, amount: HUNDRED_USDC })
    const [spender, amount] = erc20.decodeFunctionData('approve', call.data)
    expect(call.target).toBe(USDC)
    expect(call.value).toBe(0n)
    expect(spender).toBe(GMX.router)
    expect(spender).toBe('0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6')
    expect(spender).not.toBe(GMX.exchangeRouter)
    // Exact amount — never an unlimited allowance for collateral.
    expect(amount).toBe(HUNDRED_USDC)
  })

  it('never approves a FairWins address for collateral', () => {
    const call = buildApprovalCall({ chainId: ARBITRUM, token: USDC, amount: HUNDRED_USDC })
    const [spender] = erc20.decodeFunctionData('approve', call.data)
    expect(spender.toLowerCase()).not.toBe(FAIRWINS_UI_FEE_RECEIVER.toLowerCase())
    expect(spender.toLowerCase()).not.toBe(MEMBER.toLowerCase())
  })
})

describe('GMX recovery calls', () => {
  it('cancelOrder targets the ExchangeRouter with no value and the given key', () => {
    const call = buildCancelOrderCall({ chainId: ARBITRUM, key: ORDER_KEY })
    expect(call.target).toBe(GMX.exchangeRouter)
    expect(call.value).toBe(0n)
    expect(router.decodeFunctionData('cancelOrder', call.data)[0]).toBe(ORDER_KEY)
  })

  it('accepts a bare key, exactly as the contract doc names it', () => {
    expect(buildCancelOrderCall(ORDER_KEY)).toEqual(buildCancelOrderCall({ key: ORDER_KEY }))
  })

  it('defaults chainId to Arbitrum, the only chain GMX v2 runs on here', () => {
    expect(GMX_CHAIN_ID).toBe(42161)
    expect(buildCancelOrderCall({ key: ORDER_KEY }).target).toBe(GMX.exchangeRouter)
  })

  it('updateOrder keeps autoCancel true by default — it OVERWRITES the stored flag', () => {
    const call = buildUpdateOrderCall({
      key: ORDER_KEY,
      sizeDeltaUsd: THOUSAND_USD,
      acceptablePrice: 0n,
      triggerPrice: 61_000n * 10n ** 30n,
    })
    const args = router.decodeFunctionData('updateOrder', call.data)
    expect(args[0]).toBe(ORDER_KEY)
    expect(args[1]).toBe(THOUSAND_USD)
    expect(args[3]).toBe(61_000n * 10n ** 30n)
    expect(args[6]).toBe(true)
    expect(call.value).toBe(0n)
    expect(
      router.decodeFunctionData(
        'updateOrder',
        buildUpdateOrderCall({
          key: ORDER_KEY,
          sizeDeltaUsd: THOUSAND_USD,
          acceptablePrice: 0n,
          triggerPrice: 61_000n * 10n ** 30n,
          autoCancel: false,
        }).data,
      )[6],
    ).toBe(false)
  })

  it('rejects a key that is not 32 bytes', () => {
    expect(() => buildCancelOrderCall('0xdeadbeef')).toThrow(/32-byte/)
    expect(() => buildCancelOrderCall({ key: null })).toThrow(/32-byte/)
  })
})

describe('1e30 scaling', () => {
  it('scales human units to 1e30 and back without drift', () => {
    expect(GMX_USD_DECIMALS).toBe(30)
    expect(toUsdUnits('1')).toBe(10n ** 30n)
    expect(toUsdUnits('1234.56')).toBe(1_234_560_000_000_000_000_000_000_000_000_000n)
    expect(fromUsdUnits(toUsdUnits('1234.56'))).toBe('1234.56')
    expect(toUsdUnits(fromUsdUnits(THOUSAND_USD))).toBe(THOUSAND_USD)
    expect(toUsdUnits(63_412.5)).toBe(63_412_500_000_000_000_000_000_000_000_000_000n)
  })

  it('passes a bigint through unchanged — a value read back from GMX is already in venue units', () => {
    expect(toUsdUnits(THOUSAND_USD)).toBe(THOUSAND_USD)
    expect(createOrderParams(closeCall({ sizeDeltaUsd: THOUSAND_USD })).numbers.sizeDeltaUsd).toBe(THOUSAND_USD)
  })

  it('truncates below venue precision rather than rounding up', () => {
    const tiny = `0.${'0'.repeat(30)}9`
    expect(toUsdUnits(tiny)).toBe(0n)
  })

  it('fromUsdUnits is total — junk renders as null, never as a number', () => {
    for (const junk of [null, undefined, NaN, 'nope', {}, [], true]) {
      expect(fromUsdUnits(junk)).toBeNull()
    }
  })

  it('toUsdUnits refuses junk rather than encoding a zero into an order', () => {
    for (const junk of [null, undefined, NaN, 'nope', {}, true, -1, -1n]) {
      expect(() => toUsdUnits(junk, 'sizeDeltaUsd')).toThrow()
    }
  })
})

describe('execution fee estimate', () => {
  const inputs = {
    gasPrice: 10_000_000n, // 0.01 gwei — Arbitrum
    baseGasLimit: 600_000n,
    gasPerOraclePrice: 250_000n,
    orderGasLimit: 3_000_000n,
    multiplierFactor: (GMX_FLOAT_PRECISION * 12n) / 10n, // 1.2x
  }

  it('follows the documented formula, with oraclePriceCount = 3 + swapPath.length', () => {
    const estimate = estimateExecutionFee({ ...inputs, bufferBps: 0 })
    expect(estimate.oraclePriceCount).toBe(GMX_ORACLE_PRICE_COUNT_BASE)
    expect(estimate.gasLimit).toBe(600_000n + 250_000n * 3n + 3_600_000n)
    expect(estimate.fee).toBe(estimate.gasLimit * inputs.gasPrice)
    // A swap hop raises the oracle-price count AND adds `singleSwapGasLimit` of gas, so the two
    // travel together — an estimate given hops but no swap limit is short and comes back null
    // instead (asserted in `gmxExecutionFee.test.js`, where the live constants live).
    const swapped = estimateExecutionFee({ ...inputs, swapPathLength: 2, singleSwapGasLimit: 1_000_000n })
    expect(swapped.oraclePriceCount).toBe(5)
    expect(estimateExecutionFee({ ...inputs, swapPathLength: 2 })).toBeNull()
  })

  it('biases HIGH by default — GMX refunds the remainder, underpaying cancels the order', () => {
    const estimate = estimateExecutionFee(inputs)
    expect(estimate.bufferBps).toBe(GMX_EXECUTION_FEE_BUFFER_BPS)
    expect(estimate.fee).toBeGreaterThan(estimate.baseFee)
    expect(estimate.fee).toBe(estimate.baseFee + (estimate.baseFee * 1000n) / 10_000n)
  })

  it('returns null rather than inventing a venue constant it was not given', () => {
    expect(estimateExecutionFee()).toBeNull()
    for (const key of ['gasPrice', 'baseGasLimit', 'gasPerOraclePrice', 'orderGasLimit', 'multiplierFactor']) {
      expect(estimateExecutionFee({ ...inputs, [key]: undefined })).toBeNull()
      expect(estimateExecutionFee({ ...inputs, [key]: 'nope' })).toBeNull()
    }
    expect(estimateExecutionFee({ ...inputs, swapPathLength: -1 })).toBeNull()
    // An EXPLICIT null — the DataStore constants arrive asynchronously, so "not fetched yet" is the
    // normal first render. A parameter-list default would only have covered `undefined`.
    expect(() => estimateExecutionFee(null)).not.toThrow()
    expect(estimateExecutionFee(null)).toBeNull()
  })

  it('applyFactor divides by GMX’s 1e30 float precision, and is total', () => {
    expect(applyFactor(3_000_000n, GMX_FLOAT_PRECISION)).toBe(3_000_000n)
    expect(applyFactor(3_000_000n, GMX_FLOAT_PRECISION / 2n)).toBe(1_500_000n)
    expect(applyFactor('nope', GMX_FLOAT_PRECISION)).toBeNull()
    expect(applyFactor(3_000_000n, null)).toBeNull()
  })
})

describe('Reader position decoding', () => {
  const position = (over = {}) => ({
    account: MEMBER,
    market: MARKET,
    collateralToken: USDC,
    sizeInUsd: THOUSAND_USD,
    sizeInTokens: 15_000_000_000_000_000n,
    collateralAmount: HUNDRED_USDC,
    pendingImpactAmount: -1_234n,
    borrowingFactor: 7n,
    fundingFeeAmountPerSize: 8n,
    longTokenClaimableFundingAmountPerSize: 9n,
    shortTokenClaimableFundingAmountPerSize: 10n,
    increasedAtTime: 1_754_000_000n,
    decreasedAtTime: 0n,
    isLong: true,
    ...over,
  })

  const encode = (positions) =>
    reader.encodeFunctionResult('getAccountPositions', [
      positions.map((p) => [
        [p.account, p.market, p.collateralToken],
        [
          p.sizeInUsd,
          p.sizeInTokens,
          p.collateralAmount,
          p.pendingImpactAmount,
          p.borrowingFactor,
          p.fundingFeeAmountPerSize,
          p.longTokenClaimableFundingAmountPerSize,
          p.shortTokenClaimableFundingAmountPerSize,
          p.increasedAtTime,
          p.decreasedAtTime,
        ],
        [p.isLong],
      ]),
    ])

  it('normalizes a Reader result, preserving venue units', () => {
    const [decoded] = decodeAccountPositions(encode([position()]))
    expect(decoded.account).toBe(getAddress(MEMBER))
    expect(decoded.market).toBe(getAddress(MARKET))
    expect(decoded.collateralToken).toBe(getAddress(USDC))
    expect(decoded.isLong).toBe(true)
    expect(decoded.sizeInUsd).toBe(THOUSAND_USD)
    expect(decoded.collateralAmount).toBe(HUNDRED_USDC)
    expect(decoded.key).toBe(positionKey(MEMBER, MARKET, USDC, true))
    expect(decoded.increasedAtTime).toBe(1_754_000_000)
  })

  it('keeps pendingImpactAmount signed — decoding it unsigned makes a small debit astronomical', () => {
    const [decoded] = decodeAccountPositions(encode([position()]))
    expect(decoded.pendingImpactAmount).toBe(-1_234n)
  })

  it('decodes every element of a multi-position result, not just the first', () => {
    const second = position({ isLong: false, sizeInUsd: 2n * THOUSAND_USD, collateralAmount: 42n })
    const decoded = decodeAccountPositions(encode([position(), second]))
    expect(decoded).toHaveLength(2)
    expect(decoded[1].isLong).toBe(false)
    expect(decoded[1].sizeInUsd).toBe(2n * THOUSAND_USD)
    expect(decoded[1].collateralAmount).toBe(42n)
    expect(decoded[1].key).not.toBe(decoded[0].key)
  })

  it('accepts an already-decoded array of tuples as well as raw returndata', () => {
    const rows = [
      [
        [MEMBER, MARKET, USDC],
        [THOUSAND_USD, 1n, HUNDRED_USDC, -5n, 0n, 0n, 0n, 0n, 1_754_000_000n, 0n],
        [true],
      ],
    ]
    const [decoded] = decodeAccountPositions(rows)
    expect(decoded.sizeInUsd).toBe(THOUSAND_USD)
    expect(decoded.pendingImpactAmount).toBe(-5n)
  })

  it('is TOTAL: an empty account is an empty array, and junk never throws', () => {
    expect(decodeAccountPositions(encode([]))).toEqual([])
    for (const junk of [null, undefined, '0xdeadbeef', 'nope', 42, {}, [[]], [null]]) {
      expect(() => decodeAccountPositions(junk)).not.toThrow()
      expect(decodeAccountPositions(junk)).toEqual([])
    }
  })
})

describe('EventLog2 filtering', () => {
  it('filters the EventEmitter by the address-padded account in topic2', () => {
    const filter = eventTopicsForAccount(MEMBER)
    expect(filter.address).toBe(GMX.eventEmitter)
    expect(filter.topics[0]).toBe(GMX_EVENT_LOG2_TOPIC)
    expect(filter.topics[2]).toBeNull() // topic1 = the order key, deliberately unconstrained
    expect(filter.topics[3]).toBe(zeroPadValue(MEMBER.toLowerCase(), 32))
    expect(filter.topics[3]).toBe(`0x000000000000000000000000${MEMBER.slice(2).toLowerCase()}`)
  })

  it('ORs across the order event names by default', () => {
    const filter = eventTopicsForAccount(MEMBER)
    expect(filter.topics[1]).toHaveLength(GMX_ORDER_EVENT_NAMES.length)
    expect(eventTopicsForAccount(MEMBER, { eventNames: ['OrderFrozen'] }).topics[1]).toHaveLength(1)
    expect(eventTopicsForAccount(MEMBER, { eventNames: [] }).topics[1]).toBeNull()
  })

  it('is TOTAL: null for a bad address or a chain without GMX, never a throw', () => {
    for (const junk of [null, undefined, 'nope', 42, {}, ZeroHash]) {
      expect(() => eventTopicsForAccount(junk)).not.toThrow()
      expect(eventTopicsForAccount(junk)).toBeNull()
    }
    expect(eventTopicsForAccount(MEMBER, { chainId: 8453 })).toBeNull()
    // An explicit null options object degrades to the defaults rather than throwing.
    expect(eventTopicsForAccount(MEMBER, null)).toEqual(eventTopicsForAccount(MEMBER))
  })
})
