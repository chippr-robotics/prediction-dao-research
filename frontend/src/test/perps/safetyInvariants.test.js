/**
 * The spec-083 safety invariants, asserted ACROSS modules (T020).
 *
 * The per-module suites check each module against its own contract. This one checks the properties
 * that no single module owns and that a change to any of them could quietly break:
 *
 *   (a) no FairWins address can reach a position-ownership field on either venue
 *   (b) GMX approvals target the Router, never the ExchangeRouter
 *   (c) the two Gains index spaces cannot be interchanged, at any builder
 *   (d) no path in the order state machine maps transaction inclusion to `executed`
 *   (e) the fee conversions are exact at the venue ceilings, and the DataStore key is the live one
 *   (f) venue status fails CLOSED for opening and never withdraws an exit
 *   (g) the attestation cannot gate an exit
 *
 * These are written EXHAUSTIVELY (every state × every signal, every builder × the wrong index,
 * every status × both questions) rather than as examples, because the failure mode being prevented
 * is a future edit that adds one more case and only remembers the cases someone wrote down.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Interface, ZeroAddress, getAddress } from 'ethers'

import { GMX_EXCHANGE_ROUTER_ABI } from '../../abis/perps/gmxExchangeRouter'
import { GAINS_DIAMOND_ABI } from '../../abis/perps/gainsDiamond'
import { GAINS_DIAMOND_BY_CHAIN, GMX_ADDRESSES_BY_CHAIN } from '../../config/perps'
import * as gmx from '../../lib/perps/venues/gmx'
import * as gains from '../../lib/perps/venues/gains'
import {
  GMX_MAX_UI_FEE_FACTOR,
  GMX_MAX_UI_FEE_FACTOR_KEY,
  bpsToGmxUiFeeFactor,
  bpsToHyperliquidBuilderFee,
  bpsToHyperliquidMaxFeeRate,
  gmxUiFeeFactorKey,
  gmxUiFeeFactorToBps,
} from '../../lib/perps/feeUnits'
import {
  ORDER_STATE,
  ORDER_STATES,
  ORDER_TRANSITIONS,
  SIGNAL,
  createOrderState,
  gainsEventSignal,
  gainsTimeoutSignal,
  gmxEventSignal,
  reduceOrderState,
  submissionSignal,
} from '../../lib/perps/orderState'
import {
  VENUE_STATUS,
  canClose,
  canOpen,
  canReduce,
  exitAvailability,
  readGainsStatus,
  readGmxStatus,
  readVenueStatuses,
} from '../../lib/perps/venueStatus'

const ARBITRUM = 42161
const GMX = GMX_ADDRESSES_BY_CHAIN[ARBITRUM]

const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
/** The FairWins UI-fee receiver the spec-083 ops transaction registered on Arbitrum. */
const FAIRWINS = '0x52502d049571C7893447b86c4d8B38e6184bF6e1'
const MARKET = '0x47c031236e19d024b42f8AE6780E44A573170703'
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

const exchangeRouter = new Interface(GMX_EXCHANGE_ROUTER_ABI)
const diamond = new Interface(GAINS_DIAMOND_ABI)
const erc20 = new Interface(['function approve(address spender, uint256 value) returns (bool)'])

const EXECUTION_FEE = 1_500_000_000_000_000n
const THOUSAND_USD = 1_000n * 10n ** 30n

const src = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/* --------------------------------------------------------------------------------------------- *
 * (a) Ownership
 * --------------------------------------------------------------------------------------------- */

/** Every GMX call object this feature can build, with the FairWins address supplied throughout. */
function everyGmxOrder(uiFeeReceiver = FAIRWINS) {
  const common = { chainId: ARBITRUM, account: MEMBER, market: MARKET, collateralToken: USDC, isLong: true, uiFeeReceiver }
  return [
    gmx.buildOpenPositionCalls({
      ...common,
      collateralAmount: 100_000_000n,
      sizeDeltaUsd: THOUSAND_USD,
      acceptablePrice: 63_500n * 10n ** 30n,
      executionFee: EXECUTION_FEE,
    }),
    gmx.buildClosePositionCalls({
      ...common,
      sizeDeltaUsd: THOUSAND_USD,
      acceptablePrice: 62_500n * 10n ** 30n,
      executionFee: EXECUTION_FEE,
    }),
    ...gmx.buildProtectionCalls({
      ...common,
      executionFee: EXECUTION_FEE,
      stopLoss: { triggerPrice: 60_000n * 10n ** 30n, acceptablePrice: 0n, sizeDeltaUsd: THOUSAND_USD },
      takeProfit: { triggerPrice: 70_000n * 10n ** 30n, acceptablePrice: 0n, sizeDeltaUsd: THOUSAND_USD },
    }),
  ]
}

function gmxOrderAddresses(call) {
  const [datas] = exchangeRouter.decodeFunctionData('multicall', call.data)
  const created = datas.map((data) => exchangeRouter.parseTransaction({ data })).find((p) => p.name === 'createOrder')
  return created.args[0].addresses
}

describe('(a) no FairWins address reaches a position-ownership field', () => {
  it('GMX: the member owns every order, whatever the fee receiver is set to', () => {
    for (const receiver of [FAIRWINS, null, ZeroAddress]) {
      for (const call of everyGmxOrder(receiver)) {
        const addresses = gmxOrderAddresses(call)
        expect(addresses.receiver).toBe(getAddress(MEMBER))
        expect(addresses.cancellationReceiver).toBe(getAddress(MEMBER))
        expect(addresses.callbackContract).toBe(ZeroAddress)
      }
    }
  })

  it('GMX: uiFeeReceiver is the ONLY field the FairWins address may occupy', () => {
    const ownershipFields = ['receiver', 'cancellationReceiver', 'callbackContract']
    for (const call of everyGmxOrder()) {
      const addresses = gmxOrderAddresses(call)
      for (const field of ownershipFields) {
        expect(addresses[field].toLowerCase()).not.toBe(FAIRWINS.toLowerCase())
      }
      expect(addresses.uiFeeReceiver).toBe(getAddress(FAIRWINS))
      // Once, and only once, in the entire signed payload — a swap with `receiver` would keep the
      // count at one, which is why the field assertions above exist as well.
      expect(call.data.toLowerCase().split(FAIRWINS.slice(2).toLowerCase()).length - 1).toBe(1)
    }
  })

  it('GMX: REFUSES to build an order the FairWins receiver would own', () => {
    // The one confusion that produces the forbidden state: the fee receiver passed as the account.
    expect(() =>
      gmx.buildOpenPositionCalls({
        chainId: ARBITRUM,
        account: FAIRWINS,
        market: MARKET,
        collateralToken: USDC,
        collateralAmount: 100_000_000n,
        sizeDeltaUsd: THOUSAND_USD,
        acceptablePrice: 63_500n * 10n ** 30n,
        executionFee: EXECUTION_FEE,
        isLong: true,
        uiFeeReceiver: FAIRWINS,
      }),
    ).toThrow(/FairWins UI-fee receiver/)
    // Case must not be an escape hatch.
    expect(() =>
      gmx.buildClosePositionCalls({
        chainId: ARBITRUM,
        account: FAIRWINS.toLowerCase(),
        market: MARKET,
        collateralToken: USDC,
        sizeDeltaUsd: THOUSAND_USD,
        acceptablePrice: 62_500n * 10n ** 30n,
        executionFee: EXECUTION_FEE,
        isLong: true,
        uiFeeReceiver: FAIRWINS.toUpperCase().replace('0X', '0x'),
      }),
    ).toThrow(/FairWins UI-fee receiver/)
  })

  it('Gains: the member is written into Trade.user, and the referrer can never be', () => {
    const open = gains.buildOpenTradeCall({
      chainId: ARBITRUM,
      trader: MEMBER,
      pairIndex: 0,
      collateralIndex: 3,
      collateralAmount: 100_000_000n,
      leverage: 10,
      long: true,
      openPrice: 63_000,
      maxSlippageP: 1,
      referrer: FAIRWINS,
    })
    const [trade, , referrer] = diamond.decodeFunctionData('openTrade', open.data)
    expect(trade.user).toBe(getAddress(MEMBER))
    expect(referrer).toBe(getAddress(FAIRWINS))
    expect(trade.user).not.toBe(referrer)

    expect(() =>
      gains.buildOpenTradeCall({
        chainId: ARBITRUM,
        trader: FAIRWINS,
        pairIndex: 0,
        collateralIndex: 3,
        collateralAmount: 100_000_000n,
        leverage: 10,
        long: true,
        openPrice: 63_000,
        maxSlippageP: 1,
        referrer: FAIRWINS,
      }),
    ).toThrow(/FairWins referrer/)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * (b) Approval targets
 * --------------------------------------------------------------------------------------------- */

describe('(b) approvals target the contract that actually pulls the collateral', () => {
  it('GMX approves the Router — never the ExchangeRouter, the vault, or anything else it calls', () => {
    const call = gmx.buildApprovalCall({ chainId: ARBITRUM, token: USDC, amount: 100_000_000n })
    const [spender] = erc20.decodeFunctionData('approve', call.data)
    expect(spender).toBe(GMX.router)
    expect(spender).toBe('0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6')
    // Everything else in the GMX address set is a wrong answer here — the ExchangeRouter most of all,
    // because it is the address this module CALLS and therefore the one a "simplification" reaches for.
    for (const [name, address] of Object.entries(GMX)) {
      if (name === 'router') continue
      expect(spender).not.toBe(address)
    }
    expect(spender.toLowerCase()).not.toBe(FAIRWINS.toLowerCase())
  })

  it('Gains approves the diamond — the same contract the trade call goes to', () => {
    const call = gains.buildApprovalCall({ chainId: ARBITRUM, token: USDC, amount: 100_000_000n })
    const [spender] = erc20.decodeFunctionData('approve', call.data)
    expect(spender).toBe(GAINS_DIAMOND_BY_CHAIN[ARBITRUM])
    expect(spender.toLowerCase()).not.toBe(FAIRWINS.toLowerCase())
  })

  it('no perps approval anywhere grants an unlimited allowance', () => {
    const calls = [
      gmx.buildApprovalCall({ chainId: ARBITRUM, token: USDC, amount: 100_000_000n }),
      gains.buildApprovalCall({ chainId: ARBITRUM, token: USDC, amount: 100_000_000n }),
    ]
    for (const call of calls) {
      const [, amount] = erc20.decodeFunctionData('approve', call.data)
      expect(amount).toBe(100_000_000n)
    }
  })
})

/* --------------------------------------------------------------------------------------------- *
 * (c) Index spaces
 * --------------------------------------------------------------------------------------------- */

describe('(c) the two Gains index spaces cannot be interchanged', () => {
  const base = { chainId: ARBITRUM, expectedPrice: 63_000, tp: 64_000, sl: 62_000, collateralDelta: 1_000_000n }

  /** Every builder, paired with the space it legitimately consumes. */
  const builders = [
    ['closeTradeMarket', (index) => gains.buildCloseTradeCall({ ...base, tradeIndex: index }), 'trade'],
    ['decreasePositionSize', (index) => gains.buildReducePositionCall({ ...base, tradeIndex: index }), 'trade'],
    ['updateTp', (index) => gains.buildUpdateTpCall({ ...base, tradeIndex: index }), 'trade'],
    ['updateSl', (index) => gains.buildUpdateSlCall({ ...base, tradeIndex: index }), 'trade'],
    [
      'cancelOrderAfterTimeout',
      (index) => gains.buildCancelOrderAfterTimeoutCall({ ...base, pendingOrderIndex: index }),
      'pending',
    ],
  ]

  it('every builder accepts its own space and REFUSES the other, with no exceptions', () => {
    for (const [name, build, space] of builders) {
      const right = space === 'trade' ? gains.tradeIndex(7) : gains.pendingOrderIndex(7)
      const wrong = space === 'trade' ? gains.pendingOrderIndex(7) : gains.tradeIndex(7)
      expect(() => build(right), `${name} rejected its own index space`).not.toThrow()
      expect(() => build(wrong), `${name} ACCEPTED the wrong index space`).toThrow(gains.GainsIndexSpaceError)
    }
  })

  it('every builder refuses a raw number, so a value can only cross a boundary NAMED', () => {
    for (const [name, build] of builders) {
      for (const raw of [7, '7', 7n, { value: 7 }, { __gainsIndexSpace: 'gains:tradeIndex', value: 7 }.value]) {
        expect(() => build(raw), `${name} accepted an unbranded ${typeof raw}`).toThrow(gains.GainsIndexSpaceError)
      }
    }
  })

  it('a brand cannot be re-labelled after the fact', () => {
    const index = gains.tradeIndex(7)
    expect(Object.isFrozen(index)).toBe(true)
    expect(() => {
      index.__gainsIndexSpace = 'gains:pendingOrderIndex'
    }).toThrow(TypeError)
    expect(gains.isPendingOrderIndex(index)).toBe(false)
  })

  it('the decoders hand back the space their event actually carries', () => {
    // MarketOrderInitiated → pending-order (recoverable); MarketExecuted → trade (manageable).
    const initiated = gains.decodeMarketOrderInitiated(
      buildLog(diamond, 'MarketOrderInitiated', [[MEMBER, 4], MEMBER, 1, true]),
    )
    expect(gains.isPendingOrderIndex(initiated.pendingOrderIndex)).toBe(true)
    expect(gains.isTradeIndex(initiated.pendingOrderIndex)).toBe(false)
  })

  it('the timeout mapper refuses a trade index rather than aiming recovery at another object', () => {
    const timing = { createdBlock: 100, currentBlock: 400, timeoutBlocks: 200 }
    expect(gainsTimeoutSignal({ ...timing, pendingOrderIndex: gains.pendingOrderIndex(4) })).toBeTruthy()
    expect(gainsTimeoutSignal({ ...timing, pendingOrderIndex: gains.tradeIndex(4) })).toBeNull()
  })

  it('the state machine passes a branded index through without stripping the brand', () => {
    const signal = gainsEventSignal(buildLog(diamond, 'MarketOrderInitiated', [[MEMBER, 4], MEMBER, 1, true]))
    // The legal walk — an order reaches the venue through signing, not straight from idle.
    const state = [{ type: SIGNAL.SIGN }, { type: SIGNAL.SUBMITTED }, signal].reduce(reduceOrderState, createOrderState())
    expect(state.state).toBe(ORDER_STATE.VENUE_PENDING)
    expect(gains.isPendingOrderIndex(state.venueRef.pendingOrderIndex)).toBe(true)
    // …and the builder therefore accepts what came out of the machine, unwrapped by nobody.
    expect(() =>
      gains.buildCancelOrderAfterTimeoutCall({ chainId: ARBITRUM, pendingOrderIndex: state.venueRef.pendingOrderIndex }),
    ).not.toThrow()
  })
})

/** Encode a log the way the chain would, so decoders are exercised over real topics. */
function buildLog(iface, name, args) {
  const fragment = iface.getEvent(name)
  const encoded = iface.encodeEventLog(fragment, args)
  return { topics: encoded.topics, data: encoded.data }
}

/* --------------------------------------------------------------------------------------------- *
 * (d) Inclusion is never execution
 * --------------------------------------------------------------------------------------------- */

describe('(d) no path maps transaction inclusion to `executed`', () => {
  it('EXHAUSTIVE: across every state × every signal type, only VENUE_EXECUTED reaches executed', () => {
    const offenders = []
    for (const from of ORDER_STATES) {
      for (const type of Object.values(SIGNAL)) {
        const start = { ...createOrderState({ venue: 'gains' }), state: from }
        const next = reduceOrderState(start, { type })
        if (next.state === ORDER_STATE.EXECUTED && from !== ORDER_STATE.EXECUTED && type !== SIGNAL.VENUE_EXECUTED) {
          offenders.push(`${from} --${type}--> executed`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the `submitted` row of the transition table does not contain executed', () => {
    expect(ORDER_TRANSITIONS[ORDER_STATE.SUBMITTED]).not.toContain(ORDER_STATE.EXECUTED)
    // Only states the venue has already spoken about may lead there.
    const rows = Object.entries(ORDER_TRANSITIONS)
      .filter(([, tos]) => tos.includes(ORDER_STATE.EXECUTED))
      .map(([from]) => from)
      .sort()
    expect(rows).toEqual(
      [ORDER_STATE.FROZEN, ORDER_STATE.TIMED_OUT, ORDER_STATE.UNKNOWN, ORDER_STATE.VENUE_PENDING].sort(),
    )
  })

  it('FUZZ: no submission outcome this app can produce yields a venue signal, from any state', () => {
    const hash = (b) => `0x${String(b).repeat(64).slice(0, 64)}`
    const corpus = [
      hash(1),
      'not-a-hash',
      '',
      null,
      undefined,
      0,
      1,
      true,
      [],
      {},
      { state: 'included', txHash: hash(2) },
      { state: 'submitted' },
      { state: 'stalled' },
      { state: 'failed' },
      { state: 'draft' },
      { state: 'ceremony-signed' },
      // Words a future integration might invent for success. None may become `executed`.
      { state: 'confirmed' },
      { state: 'success' },
      { state: 'executed' },
      { state: 'mined' },
      { state: 'complete' },
      { status: 1, hash: hash(3) },
      { status: 0 },
      { receipts: [{ status: 1, hash: hash(4) }] },
      { receipts: [{ status: 0 }] },
      { receipts: [] },
      { txHash: hash(5) },
      { userOpHash: hash(6) },
      { ok: true, result: 'executed' },
    ]
    const venueSignals = new Set([
      SIGNAL.VENUE_EXECUTED,
      SIGNAL.VENUE_ACKNOWLEDGED,
      SIGNAL.VENUE_REJECTED,
      SIGNAL.VENUE_FROZEN,
      SIGNAL.VENUE_TIMED_OUT,
    ])
    for (const input of corpus) {
      const signal = submissionSignal(input, { venue: 'gmx' })
      if (signal) expect(venueSignals.has(signal.type), `${JSON.stringify(input)} → ${signal.type}`).toBe(false)
      for (const from of ORDER_STATES) {
        const start = { ...createOrderState(), state: from }
        const next = reduceOrderState(start, signal)
        if (from !== ORDER_STATE.EXECUTED) {
          expect(next.state, `${from} + ${JSON.stringify(input)}`).not.toBe(ORDER_STATE.EXECUTED)
        }
      }
    }
  })

  it('only the venue mappers can emit an execution signal at all', () => {
    // Gains and GMX execution events are the two sources, and they are the venue's own words.
    expect(
      gainsEventSignal(
        buildLog(diamond, 'MarketOrderInitiated', [[MEMBER, 4], MEMBER, 1, true]),
      ).type,
    ).toBe(SIGNAL.VENUE_ACKNOWLEDGED)
    expect(gmxEventSignal({ eventName: 'OrderExecuted', key: `0x${'ab'.repeat(32)}` }).type).toBe(SIGNAL.VENUE_EXECUTED)
    expect(gmxEventSignal({ eventName: 'OrderCreated', key: `0x${'ab'.repeat(32)}` }).type).toBe(
      SIGNAL.VENUE_ACKNOWLEDGED,
    )
  })
})

/* --------------------------------------------------------------------------------------------- *
 * (e) Fee units
 * --------------------------------------------------------------------------------------------- */

describe('(e) the fee conversions are exact at the venue ceilings', () => {
  it('5 bps is 5e26 on GMX and 50 / "0.05%" on Hyperliquid — the launch rate, hand-checked', () => {
    expect(bpsToGmxUiFeeFactor(5).factor).toBe(500_000_000_000_000_000_000_000_000n)
    expect(bpsToGmxUiFeeFactor(5).factor).toBe(5n * 10n ** 26n)
    expect(bpsToGmxUiFeeFactor(5).clamped).toBe(false)
    expect(bpsToHyperliquidBuilderFee(5).f).toBe(50)
    expect(bpsToHyperliquidMaxFeeRate(5).maxFeeRate).toBe('0.05%')
    // The percent string is a STRING with the sign — a bare number is rejected by the venue.
    expect(bpsToHyperliquidMaxFeeRate(5).maxFeeRate).toMatch(/%$/)
  })

  it('10 bps is exactly each venue ceiling, and 11 clamps to it and says so', () => {
    expect(bpsToGmxUiFeeFactor(10).factor).toBe(GMX_MAX_UI_FEE_FACTOR)
    expect(bpsToGmxUiFeeFactor(10).factor).toBe(10n ** 27n)
    expect(bpsToHyperliquidBuilderFee(10).f).toBe(100)
    expect(bpsToHyperliquidMaxFeeRate(10).maxFeeRate).toBe('0.1%')

    for (const over of [bpsToGmxUiFeeFactor(11), bpsToHyperliquidBuilderFee(11), bpsToHyperliquidMaxFeeRate(11)]) {
      expect(over.clamped).toBe(true)
      expect(over.requestedBps).toBe(11)
      expect(over.bps).toBe(10)
    }
  })

  it('the GMX read direction recovers the rate the venue actually stores', () => {
    // 5e26 is what the live Arbitrum DataStore holds for the FairWins receiver (checked 2026-08-11).
    expect(gmxUiFeeFactorToBps(5n * 10n ** 26n)).toBe(5)
    expect(gmxUiFeeFactorToBps(GMX_MAX_UI_FEE_FACTOR)).toBe(10)
    expect(gmxUiFeeFactorToBps(0n)).toBe(0)
  })

  it('the DataStore keys match the ones the live contract answers to', () => {
    // Pinned against reads of the deployed Arbitrum DataStore on 2026-08-11: MAX_UI_FEE_FACTOR
    // returned 1e27, and the FairWins receiver's key returned 5e26. A mis-derived key returns 0,
    // which is indistinguishable from "no fee configured" — hence the exact hashes.
    expect(GMX_MAX_UI_FEE_FACTOR_KEY).toBe('0xab045c9d202ad7ee7dd9fa7ab3c082d9835872721eaf03397e59b961fe399329')
    expect(gmxUiFeeFactorKey(FAIRWINS)).toBe('0x4250a5646e3b385f82087f9a2c6b20b498244a2e55973a3c08480653e44e0cfe')
    // Checksum-insensitive, address-sensitive.
    expect(gmxUiFeeFactorKey(FAIRWINS.toLowerCase())).toBe(gmxUiFeeFactorKey(FAIRWINS))
    expect(gmxUiFeeFactorKey(MEMBER)).not.toBe(gmxUiFeeFactorKey(FAIRWINS))
    // Total — an unconfigured receiver yields no key, and the caller discloses an unknown rate.
    for (const junk of [null, undefined, '', 'nope', 0, {}]) expect(gmxUiFeeFactorKey(junk)).toBeNull()
  })
})

/* --------------------------------------------------------------------------------------------- *
 * (f) Venue status
 * --------------------------------------------------------------------------------------------- */

describe('(f) venue status fails CLOSED for opening and never withdraws an exit', () => {
  const everyStatus = [...Object.values(VENUE_STATUS), 'a-status-from-a-future-release', '', null, undefined, 0, {}, []]

  it('EXHAUSTIVE: opening is permitted in exactly one status and nothing else', () => {
    const permitted = everyStatus.filter((status) => canOpen(status))
    expect(permitted).toEqual([VENUE_STATUS.OPEN])
  })

  it('EXHAUSTIVE: the exit is offered in every status, including the ones that refuse an open', () => {
    for (const status of everyStatus) {
      const availability = exitAvailability(status)
      expect(availability.offer, `exit withheld for status ${String(status)}`).toBe(true)
      // A status that will not accept the exit must SAY so — never withhold silently.
      if (!availability.venueWillAccept) expect(typeof availability.note).toBe('string')
    }
  })

  it('an UNREADABLE venue blocks the open and keeps the close — uncertainty is ours, not theirs', () => {
    expect(canOpen(VENUE_STATUS.UNREADABLE)).toBe(false)
    expect(canClose(VENUE_STATUS.UNREADABLE)).toBe(true)
    expect(canReduce(VENUE_STATUS.UNREADABLE)).toBe(true)
    expect(canOpen(VENUE_STATUS.CLOSE_ONLY)).toBe(false)
    expect(canClose(VENUE_STATUS.CLOSE_ONLY)).toBe(true)
  })

  it('every read failure resolves to a status that refuses opening, never to open', async () => {
    const failures = {
      'no provider': { getProvider: () => null },
      'provider throws': {
        getProvider: () => {
          throw new Error('endpoint down')
        },
      },
      'call reverts': {
        getProvider: () => ({ getCode: async () => '0x60' }),
        makeContract: () => ({
          getTradingActivated: async () => {
            throw new Error('execution reverted')
          },
          getMarketOrdersTimeoutBlocks: async () => 200n,
        }),
      },
      'unmapped enum': {
        getProvider: () => ({ getCode: async () => '0x60' }),
        makeContract: () => ({
          getTradingActivated: async () => 9n,
          getMarketOrdersTimeoutBlocks: async () => 200n,
        }),
      },
    }
    for (const [label, deps] of Object.entries(failures)) {
      const gainsStatus = await readGainsStatus(ARBITRUM, deps)
      expect(canOpen(gainsStatus), `${label} permitted an open`).toBe(false)
      expect(gainsStatus.status).toBe(VENUE_STATUS.UNREADABLE)
      // …and the exit survives every one of them.
      expect(exitAvailability(gainsStatus).offer).toBe(true)
    }
    // A codeless GMX Router (a stale pin) is unreadable, not open.
    const stale = await readGmxStatus(ARBITRUM, { getProvider: () => ({ getCode: async () => '0x' }) })
    expect(canOpen(stale)).toBe(false)
    expect(exitAvailability(stale).offer).toBe(true)
  })

  it('the readers never reject, even handed a null dependency bag', async () => {
    await expect(readGainsStatus(ARBITRUM, null)).resolves.toBeTruthy()
    await expect(readGmxStatus(ARBITRUM, null)).resolves.toBeTruthy()
    await expect(readVenueStatuses(ARBITRUM, null)).resolves.toBeTruthy()
  })
})

/* --------------------------------------------------------------------------------------------- *
 * (g) Nothing gates an exit
 * --------------------------------------------------------------------------------------------- */

describe('(g) the attestation, the flag and venue status cannot gate an exit', () => {
  /** The modules an exit (close / reduce / protect / cancel / recover) actually runs through. */
  const EXIT_PATH = {
    'lib/perps/venues/gains.js': '../../lib/perps/venues/gains.js',
    'lib/perps/venues/gmx.js': '../../lib/perps/venues/gmx.js',
    'lib/perps/validation.js': '../../lib/perps/validation.js',
    'lib/perps/orderState.js': '../../lib/perps/orderState.js',
  }

  it('no exit-path module imports the attestation at all', () => {
    for (const [name, path] of Object.entries(EXIT_PATH)) {
      expect(src(path), `${name} imports the attestation`).not.toMatch(/from\s+['"].*perps\/attestation['"]/)
      expect(src(path)).not.toMatch(/hasAttested|attestationState|PERPS_ATTESTATION/)
    }
  })

  it('no exit-path module reads the management feature flag', () => {
    // The flag hides the whole surface at the top level; it must never appear as a per-action gate,
    // because a member holding a position opened while it was on must still be able to exit.
    for (const [name, path] of Object.entries(EXIT_PATH)) {
      expect(src(path), `${name} reads the kill switch`).not.toMatch(/perpsManageFeatureEnabled|VITE_PERPS_MANAGE_ENABLED/)
    }
  })

  it('no exit-path module asks whether the venue will accept an open', () => {
    for (const [name, path] of Object.entries(EXIT_PATH)) {
      expect(src(path), `${name} consults canOpen`).not.toMatch(/\bcanOpen\b|openBlockedNote/)
    }
  })

  it('the attestation exports nothing an exit could read as permission', () => {
    const source = src('../../lib/perps/attestation.js')
    const exported = [...source.matchAll(/export (?:function|const) (\w+)/g)].map((m) => m[1])
    expect(exported.filter((name) => /close|reduce|cancel|exit|recover|manage|trade|open/i.test(name))).toEqual([])
  })

  it('the exit validators have no parameter a gate could be wired into', () => {
    // Not "accepts and ignores" — there is nowhere to put one, so a future caller cannot pass one.
    const source = src('../../lib/perps/validation.js')
    const close = source.slice(source.indexOf('export function validateClose'))
    const closeBody = close.slice(0, close.indexOf('\n}'))
    for (const gate of ['attest', 'screen', 'sanction', 'killswitch', 'featureEnabled', 'venueStatus', 'region']) {
      expect(closeBody.toLowerCase(), `validateClose reads ${gate}`).not.toContain(gate.toLowerCase())
    }
  })
})
