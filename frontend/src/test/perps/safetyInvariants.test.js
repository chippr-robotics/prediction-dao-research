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
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Interface, ZeroAddress, getAddress } from 'ethers'

import {
  PERPS_ENTRY_ACTIONS,
  defaultBuildCalls,
  isEntryAction,
  normalizeAction,
  normalizeDescriptor,
} from '../../hooks/usePerpsTrade'
import { recoveryDescriptor } from '../../components/perps/pendingOrderRecovery'
import { buildExitDescriptor, buildProtectDescriptor } from '../../components/perps/positionSheetActions'
import {
  buildOpenDescriptor,
  openEligibility,
  openVenueOptionsFor,
} from '../../components/perps/openPositionActions'
import {
  PERPS_ATTESTATION_ITEMS,
  attestationState,
  clearAttestation,
  hasAttested,
  recordAttestation,
} from '../../lib/perps/attestation'

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
 * (a2) Ownership, through the SHEET's own composition
 *
 * (a) proves the venue builders are safe when called correctly. This proves the phase-4 surface
 * calls them correctly: the exact chain a member's tap runs down — `positionSheetActions` builds a
 * descriptor, `usePerpsTrade` normalises it, `defaultBuildCalls` dispatches to the venue table —
 * with the FairWins address supplied at the one place the sheet supplies it. A descriptor that put
 * the fee receiver somewhere else, or a builder table wired to the wrong venue key, is invisible
 * to (a) and lands here.
 * --------------------------------------------------------------------------------------------- */

/** A GMX position in the shape `usePerpsPositions#toGmxPosition` publishes. */
const GMX_POSITION = Object.freeze({
  id: `gmx:${ARBITRUM}:key`,
  venue: 'gmx',
  chainId: ARBITRUM,
  symbol: null,
  direction: 'long',
  sizeUsd: 1000,
  venueRef: Object.freeze({ venue: 'gmx', chainId: ARBITRUM, market: MARKET, collateralToken: USDC, isLong: true }),
  raw: Object.freeze({ sizeInUsd: THOUSAND_USD, collateralAmount: 100_000_000n }),
})

/** A Gains position in the shape `usePerpsPositions#gainsVenueRef` publishes. */
const GAINS_POSITION = Object.freeze({
  id: `gains:${ARBITRUM}:7`,
  venue: 'gains',
  chainId: ARBITRUM,
  symbol: 'BTC/USD',
  direction: 'long',
  sizeUsd: 1000,
  collateralUsd: 100,
  entryPrice: 60_000,
  leverage: 10,
  liquidationPrice: 54_000,
  venueRef: Object.freeze({
    venue: 'gains',
    chainId: ARBITRUM,
    tradeIndex: gains.tradeIndex(7),
    pairIndex: 1,
    collateralIndex: 3,
    collateralToken: USDC,
    collateralDecimals: 6,
    collateralPrecision: 1_000_000n,
  }),
})

const QUOTE = Object.freeze({ executionFee: EXECUTION_FEE })

/** Descriptor → the calls a wallet would actually be handed, through the real dispatch table. */
function callsFor(built) {
  expect(built.ok, `the sheet refused to build: ${built.reason}`).toBe(true)
  const spec = normalizeDescriptor(built.descriptor, { account: MEMBER })
  expect(spec.ok, `the descriptor was refused: ${spec.reason}`).toBe(true)
  return defaultBuildCalls(spec)
}

/** Every action the sheet can produce, on both venues, with the FairWins receiver supplied. */
function everySheetAction() {
  const common = { markPrice: 63_000, quote: QUOTE, uiFeeReceiver: FAIRWINS }
  return [
    ['gains close', buildExitDescriptor({ position: GAINS_POSITION, percent: 100, ...common })],
    ['gains reduce', buildExitDescriptor({ position: GAINS_POSITION, percent: 25, ...common })],
    [
      'gains protect',
      buildProtectDescriptor({ position: GAINS_POSITION, stopLoss: 57_000, takeProfit: 70_000, ...common }),
    ],
    ['gmx close', buildExitDescriptor({ position: GMX_POSITION, percent: 100, ...common })],
    ['gmx reduce', buildExitDescriptor({ position: GMX_POSITION, percent: 50, ...common })],
    [
      'gmx protect',
      buildProtectDescriptor({ position: GMX_POSITION, stopLoss: 60_000, takeProfit: 70_000, ...common }),
    ],
  ]
}

describe('(a2) nothing the SHEET builds can put a FairWins address on a position', () => {
  it('EXHAUSTIVE: across every action the sheet offers, the member owns every order', () => {
    for (const [name, built] of everySheetAction()) {
      for (const call of callsFor(built)) {
        // By TARGET, not by selector: the Gains diamond has a `multicall` with the identical
        // selector (it is the OpenZeppelin one), and a Gains close is a multicall of two diamond
        // calls. Selecting on `0xac9650d8` would try to parse those as GMX orders.
        if (call.target !== GMX.exchangeRouter) continue
        const addresses = gmxOrderAddresses(call)
        expect(addresses.receiver, `${name} receiver`).toBe(getAddress(MEMBER))
        expect(addresses.cancellationReceiver, `${name} cancellationReceiver`).toBe(getAddress(MEMBER))
        expect(addresses.callbackContract, `${name} callbackContract`).toBe(ZeroAddress)
        expect(addresses.uiFeeReceiver, `${name} uiFeeReceiver`).toBe(getAddress(FAIRWINS))
      }
    }
  })

  it('EXHAUSTIVE: the FairWins address appears at most ONCE in any batch, and never on Gains', () => {
    for (const [name, built] of everySheetAction()) {
      const venue = built.descriptor.venue
      const hex = callsFor(built)
        .map((call) => String(call.data).toLowerCase())
        .join('')
      const occurrences = hex.split(FAIRWINS.slice(2).toLowerCase()).length - 1
      // Gains exits carry no address at all — the diamond takes an index, and the referrer is an
      // OPEN-only parameter. One appearing here would mean an exit had grown an ownership field.
      if (venue === 'gains') expect(occurrences, `${name} put a FairWins address in Gains calldata`).toBe(0)
      // GMX: exactly one per createOrder — the uiFeeReceiver asserted above. A protect batch is two
      // orders, so the bound is per call, checked below.
      else expect(occurrences, `${name} repeated the FairWins address`).toBeLessThanOrEqual(2)
    }
  })

  it('the member’s own address is never mistaken for the fee receiver, in either direction', () => {
    // The one confusion that produces the forbidden state, reached through the sheet rather than
    // through the builder: a position whose venueRef somehow names FairWins as the holder.
    const built = buildExitDescriptor({
      position: { ...GMX_POSITION, venueRef: { ...GMX_POSITION.venueRef } },
      percent: 100,
      markPrice: 63_000,
      quote: QUOTE,
      uiFeeReceiver: FAIRWINS,
    })
    const spec = normalizeDescriptor(built.descriptor, { account: FAIRWINS })
    expect(() => defaultBuildCalls(spec)).toThrow(/FairWins UI-fee receiver/)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * (a3) Ownership, through the OPENING composition
 *
 * (a) proves the venue builders are safe; (a2) proves the EXIT surface calls them correctly. This
 * proves the same of the ENTRY surface, and it is the one that matters most: every position this
 * app will ever create is created here, so an ownership field written wrongly on this path is not
 * a position a member cannot close — it is a position they never owned.
 *
 * The chain driven is the real one, end to end and with nothing hand-written in the middle: the
 * pairs FEED → `openVenueOptionsFor` → `openEligibility` → `buildOpenDescriptor` →
 * `normalizeDescriptor` → `defaultBuildCalls`. A descriptor that grew an owner field, an
 * eligibility check that let a FairWins-owned option through, or a builder table wired to the
 * wrong venue key all land here and nowhere else.
 * --------------------------------------------------------------------------------------------- */

const USDC_COLLATERAL = Object.freeze({
  symbol: 'USDC',
  address: USDC,
  decimals: 6,
  collateralIndex: 3,
  usdPrice: 1,
})

/** The feed rows a gateway serves for one market on one chain, carrying the open handles. */
const OPEN_FEED = Object.freeze([
  Object.freeze({
    id: `gains:${ARBITRUM}:BTC/USD`,
    venue: 'gains',
    chainId: ARBITRUM,
    symbol: 'BTC/USD',
    price: 60_000,
    maxLeverage: 150,
    pairIndex: 4,
    collaterals: [USDC_COLLATERAL],
  }),
  Object.freeze({
    id: `gmx:${ARBITRUM}:BTC/USD:${MARKET}`,
    venue: 'gmx',
    chainId: ARBITRUM,
    symbol: 'BTC/USD',
    price: 60_000,
    maxLeverage: 50,
    market: MARKET,
    collaterals: [USDC_COLLATERAL],
  }),
])

const OPEN_STATUSES = Object.freeze({ gains: { status: 'open' }, gmx: { status: 'open' } })

/** Every OPEN the entry surface can compose, on both venues, with the FairWins receiver supplied. */
function everyOpenAction(uiFeeReceiver = FAIRWINS) {
  const out = []
  for (const row of OPEN_FEED) {
    for (const isLong of [true, false]) {
      const [option] = openVenueOptionsFor(row, OPEN_FEED, { statuses: OPEN_STATUSES })
      const verdict = openEligibility(option)
      expect(verdict.ok, `${row.venue} was not offered: ${verdict.reason}`).toBe(true)
      out.push([
        `${row.venue} open ${isLong ? 'long' : 'short'}`,
        buildOpenDescriptor({
          venue: option.venue,
          chainId: option.chainId,
          handle: verdict.handle,
          isLong,
          collateral: { ...USDC_COLLATERAL, balance: 10n ** 12n },
          collateralAmount: 100_000_000n,
          leverage: 5,
          entryPrice: 60_000,
          notionalUsd: 500,
          venueLimits: option.limits,
          quote: { executionFee: EXECUTION_FEE },
          uiFeeReceiver,
          // No allowance read ⇒ an approval leg rides in front, which is part of what is checked.
          allowance: null,
        }),
      ])
    }
  }
  return out
}

describe('(a3) nothing the OPENING surface builds can put a FairWins address on a position', () => {
  it('EXHAUSTIVE: across every open the sheet can compose, the member owns every order', () => {
    const actions = everyOpenAction()
    expect(actions).toHaveLength(4) // both venues × both directions — nothing silently skipped
    for (const [name, built] of actions) {
      for (const call of callsFor(built)) {
        if (call.target !== GMX.exchangeRouter) continue
        const addresses = gmxOrderAddresses(call)
        expect(addresses.receiver, `${name} receiver`).toBe(getAddress(MEMBER))
        expect(addresses.cancellationReceiver, `${name} cancellationReceiver`).toBe(getAddress(MEMBER))
        expect(addresses.callbackContract, `${name} callbackContract`).toBe(ZeroAddress)
        expect(addresses.uiFeeReceiver, `${name} uiFeeReceiver`).toBe(getAddress(FAIRWINS))
      }
    }
  })

  it('EXHAUSTIVE: Gains gets NO FairWins address at all, in any field, on an open', () => {
    // Gains' `openTrade` takes a REFERRER one field from `Trade.user`, and the venue has not
    // whitelisted FairWins — so an address there would earn nothing while sitting next to the
    // ownership field. The descriptor sends null, which encodes as the zero address.
    for (const [name, built] of everyOpenAction()) {
      if (built.descriptor.venue !== 'gains') continue
      const hex = callsFor(built)
        .map((call) => String(call.data).toLowerCase())
        .join('')
      expect(hex.split(FAIRWINS.slice(2).toLowerCase()).length - 1, `${name}`).toBe(0)
      const open = callsFor(built).find((c) => c.target === GAINS_DIAMOND_BY_CHAIN[ARBITRUM])
      const [trade, , referrer] = diamond.decodeFunctionData('openTrade', open.data)
      expect(trade.user).toBe(getAddress(MEMBER))
      expect(BigInt(referrer)).toBe(0n)
    }
  })

  it('the APPROVAL leg an open carries spends to the venue’s puller, never to FairWins', () => {
    // An open is the only action that prepends an approval, so it is the only place an allowance
    // could be granted to the wrong address — and the wrong address here is a signed permission
    // over the member's collateral.
    for (const [name, built] of everyOpenAction()) {
      const calls = callsFor(built)
      expect(calls.length, `${name} lost its approval leg`).toBe(2)
      const [spender] = erc20.decodeFunctionData('approve', calls[0].data)
      expect(spender.toLowerCase(), `${name}`).not.toBe(FAIRWINS.toLowerCase())
      expect(spender).toBe(built.descriptor.venue === 'gmx' ? GMX.router : GAINS_DIAMOND_BY_CHAIN[ARBITRUM])
    }
  })

  /**
   * THE "CONNECTED ACCOUNT IS THE FAIRWINS ADDRESS" CASE, and why the two venues answer it
   * differently. This asymmetry is real and deliberate, and writing it down is the point: a test
   * that forced both venues to throw would be asserting a guard Gains does not need and cannot
   * reach, and the next person would "fix" it by adding a referrer.
   *
   *   GMX  — the FairWins address IS in the calldata, as `uiFeeReceiver`. An order where the fee
   *          receiver is also the owner is the exact confusion `venue-calldata.md` forbids, so the
   *          builder refuses it.
   *   Gains— the descriptor deliberately sends NO referrer (the venue has not whitelisted
   *          FairWins), so there is no FairWins address in the payload for the owner to collide
   *          with. FairWins' own wallet opening its own position is not the forbidden state —
   *          FairWins holding a MEMBER's position is, and that is impossible here because
   *          `Trade.user` is overwritten with `_msgSender()`.
   */
  it('GMX REFUSES an open the FairWins receiver would own, reached through the composition', () => {
    const gmxOpens = everyOpenAction().filter(([, built]) => built.descriptor.venue === 'gmx')
    expect(gmxOpens).toHaveLength(2)
    for (const [name, built] of gmxOpens) {
      const spec = normalizeDescriptor(built.descriptor, { account: FAIRWINS })
      expect(() => defaultBuildCalls(spec), name).toThrow(/FairWins UI-fee receiver/)
    }
  })

  it('Gains carries no FairWins address to collide with — and its guard still fires if one returns', () => {
    for (const [name, built] of everyOpenAction()) {
      if (built.descriptor.venue !== 'gains') continue
      // The descriptor's own choice, asserted structurally: `null`, not "some address".
      expect(built.descriptor.params.referrer, name).toBeNull()
      const spec = normalizeDescriptor(built.descriptor, { account: FAIRWINS })
      const calls = defaultBuildCalls(spec)
      const open = calls.find((c) => c.target === GAINS_DIAMOND_BY_CHAIN[ARBITRUM])
      const [trade, , referrer] = diamond.decodeFunctionData('openTrade', open.data)
      // Whoever signs owns it — that is the invariant, and it holds for this signer too.
      expect(trade.user).toBe(getAddress(FAIRWINS))
      expect(BigInt(referrer)).toBe(0n)
    }
    // …and the guard that WOULD catch a reintroduced referrer is still live, so a future edit that
    // starts sending one cannot quietly recreate the forbidden pattern.
    expect(() =>
      gains.buildOpenTradeCall({
        chainId: ARBITRUM,
        trader: FAIRWINS,
        pairIndex: 4,
        collateralIndex: 3,
        collateralAmount: 100_000_000n,
        leverage: 5,
        long: true,
        openPrice: 60_000,
        maxSlippageP: 1,
        referrer: FAIRWINS,
      }),
    ).toThrow(/FairWins referrer/)
  })

  it('the descriptor has NOWHERE to put an owner, on either venue', () => {
    // Structural, not behavioural: a field that does not exist cannot be filled in by a future
    // edit, however the call site is written.
    for (const [name, built] of everyOpenAction()) {
      for (const field of ['trader', 'account', 'user', 'receiver', 'owner', 'cancellationReceiver', 'from']) {
        expect(built.descriptor, `${name} descriptor.${field}`).not.toHaveProperty(field)
        expect(built.descriptor.params, `${name} params.${field}`).not.toHaveProperty(field)
      }
    }
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

/* --------------------------------------------------------------------------------------------- *
 * (c2) Index spaces, through the PHASE 3/4 surfaces
 *
 * (c) proves the builders refuse the wrong space. This proves the new callers never hand them one.
 * The dangerous shape is an object that carries BOTH indices — which is exactly what a pending
 * order is, since the gateway publishes `venueRef.tradeIndex` alongside `venueRef.pendingOrderIndex`
 * for every order type that references a stored trade — so each surface is driven with both in
 * scope and asserted to reach for the right one.
 * --------------------------------------------------------------------------------------------- */

describe('(c2) the phase-3/4 surfaces cannot cross the two Gains index spaces', () => {
  /**
   * A stuck order as `usePerpsOrders#finalizeOrder` publishes it, with a TRADE index deliberately
   * planted in every other place a future edit might reach for it. Only `recovery` is legitimate.
   */
  const STUCK = Object.freeze({
    id: 'gains:42161:pending:4',
    venue: 'gains',
    chainId: ARBITRUM,
    state: 'timed_out',
    recoverable: true,
    recovery: Object.freeze({
      venue: 'gains',
      chainId: ARBITRUM,
      action: 'cancelOrderAfterTimeout',
      pendingOrderIndex: gains.pendingOrderIndex(4),
      label: 'Recover your collateral',
    }),
    // Decoys, all naming the OTHER space, all of them plausible-looking handles.
    venueRef: Object.freeze({ tradeIndex: gains.tradeIndex(9), pendingOrderIndex: gains.pendingOrderIndex(4) }),
    raw: Object.freeze({ venueRef: { tradeIndex: 9, pendingOrderIndex: 4 }, index: 9, tradeIndex: 9 }),
  })

  it('the recovery reaches the venue as cancelOrderAfterTimeout(PENDING index), decoys and all', () => {
    const descriptor = recoveryDescriptor(STUCK)
    const spec = normalizeDescriptor(descriptor, { account: MEMBER })
    const [call] = defaultBuildCalls(spec)
    expect(call.target).toBe(GAINS_DIAMOND_BY_CHAIN[ARBITRUM])
    // 4, the pending-order index — NOT 9, the trade index sitting three fields away.
    expect(call.data).toBe(diamond.encodeFunctionData('cancelOrderAfterTimeout', [4]))
    expect(call.data).not.toBe(diamond.encodeFunctionData('cancelOrderAfterTimeout', [9]))
  })

  it('a recovery aimed with the WRONG space is refused at the builder, not silently sent', () => {
    const mislabelled = { ...STUCK, recovery: { ...STUCK.recovery, pendingOrderIndex: gains.tradeIndex(4) } }
    const spec = normalizeDescriptor(recoveryDescriptor(mislabelled), { account: MEMBER })
    expect(() => defaultBuildCalls(spec)).toThrow(gains.GainsIndexSpaceError)
    // …and an unbranded number cannot get through either, which is what a JSON wire would carry.
    const raw = { ...STUCK, recovery: { ...STUCK.recovery, pendingOrderIndex: 4 } }
    expect(() => defaultBuildCalls(normalizeDescriptor(recoveryDescriptor(raw), { account: MEMBER }))).toThrow(
      gains.GainsIndexSpaceError,
    )
  })

  it('the position sheet never reaches for a pending-order index when the trade index is absent', () => {
    // A Gains position whose ref carries ONLY the other space. Refusing is the honest outcome; the
    // failure being prevented is closing whatever trade happens to hold that number.
    const position = {
      ...GAINS_POSITION,
      venueRef: { venue: 'gains', chainId: ARBITRUM, pendingOrderIndex: gains.pendingOrderIndex(7), tradeIndex: null },
    }
    for (const built of [
      buildExitDescriptor({ position, percent: 100, markPrice: 63_000 }),
      buildExitDescriptor({ position, percent: 25, markPrice: 63_000 }),
      buildProtectDescriptor({ position, stopLoss: 57_000, markPrice: 63_000 }),
    ]) {
      expect(built.ok).toBe(false)
      expect(built.reason).toMatch(/could not be read/)
    }
  })

  it('the sheet’s exits carry the TRADE index — the space those calls actually consume', () => {
    const [call] = callsFor(buildExitDescriptor({ position: GAINS_POSITION, percent: 100, markPrice: 63_000 }))
    // The close is a diamond multicall of [updateMaxClosingSlippageP, closeTradeMarket].
    const [datas] = diamond.decodeFunctionData('multicall', call.data)
    const close = datas.map((d) => diamond.parseTransaction({ data: d })).find((p) => p.name === 'closeTradeMarket')
    expect(Number(close.args[0])).toBe(7)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * (c3) One event, two meanings — the phase-3 addition to the state machine
 *
 * Both venues announce "the recovery you sent ran" and "the order you were watching never ran"
 * with the SAME event. The tracked action is the only thing that separates them, so the branch
 * that reads it is asserted in both directions: getting it backwards tells a member their close
 * executed when the venue in fact refused it.
 * --------------------------------------------------------------------------------------------- */

describe('(c3) a cancellation event is an EXECUTION only for the cancel that caused it', () => {
  const key = `0x${'ab'.repeat(32)}`

  it('GMX: OrderCancelled is executed for a `cancel`, and rejected for every other action', () => {
    expect(gmxEventSignal({ eventName: 'OrderCancelled', key }, { action: 'cancel' }).type).toBe(
      SIGNAL.VENUE_EXECUTED,
    )
    for (const action of ['open', 'close', 'reduce', 'protect', undefined, null, 'recover']) {
      expect(gmxEventSignal({ eventName: 'OrderCancelled', key }, { action }).type, `action ${action}`).toBe(
        SIGNAL.VENUE_REJECTED,
      )
    }
  })

  it('Gains: CollateralReturnedAfterTimeout reads the same way, in both directions', () => {
    const decoded = {
      name: 'CollateralReturnedAfterTimeout',
      pendingOrderIndex: gains.pendingOrderIndex(4),
      trader: MEMBER,
      collateralAmount: 100_000_000n,
    }
    expect(gainsEventSignal(decoded, { action: 'cancel' }).type).toBe(SIGNAL.VENUE_EXECUTED)
    for (const action of ['open', 'close', 'reduce', 'protect', undefined]) {
      expect(gainsEventSignal(decoded, { action }).type, `action ${action}`).toBe(SIGNAL.VENUE_REJECTED)
    }
  })

  it('neither branch is reachable without the venue’s own event', () => {
    // The exhaustive (d) sweep covers every state × signal; this pins the specific worry, which is
    // that a `cancel` action turns some NON-event input into an execution.
    for (const input of [{ state: 'included' }, { receipts: [{ status: 1 }] }, { userOpHash: key }, 'ok']) {
      const signal = submissionSignal(input, { venue: 'gmx', action: 'cancel' })
      expect(signal?.type).not.toBe(SIGNAL.VENUE_EXECUTED)
    }
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

/**
 * The modules an exit (close / reduce / protect / cancel / recover) actually runs through.
 *
 * PHASES 3 AND 4 ADDED SIX OF THESE, and adding them is the whole point: this suite asserts a
 * property of a PATH, so a path that grows a module the map does not list keeps passing while
 * covering less and less. `(h)` below now makes that impossible — every perps component, every
 * perps hook AND every `lib/perps` module must be classified, so a new file fails the run until
 * someone says which of these kinds it is. It lives at module scope so `(h)` can check that its
 * own classification and this map still name the same files.
 *
 * `hooks/usePerpsTrade.js` is deliberately NOT here: it is the shared write path and therefore
 * the one module that legitimately NAMES the gates, for the one entry action. It gets its own
 * (stricter, structural) assertions below.
 */
const EXIT_PATH = {
  'lib/perps/venues/gains.js': '../../lib/perps/venues/gains.js',
  'lib/perps/venues/gmx.js': '../../lib/perps/venues/gmx.js',
  'lib/perps/validation.js': '../../lib/perps/validation.js',
  // Naming a GMX market is what gives a GMX close a price to bound itself with, so the resolver
  // is on the exit path too: a gate reachable from here could withhold one.
  'lib/perps/gmxMarkets.js': '../../lib/perps/gmxMarkets.js',
  // And what that market's scales make of a GMX position — the entry price, leverage and P&L a
  // member reads before deciding to close. Same reason: it is on the exit path, so nothing in it
  // may consult a gate.
  'lib/perps/gmxDerived.js': '../../lib/perps/gmxDerived.js',
  'lib/perps/orderState.js': '../../lib/perps/orderState.js',
  // Phase 7: an exit REPORTS itself by queueing here (T070), so the buffer is on the exit path
  // even though it moves no money. A gate reachable from it would be a gate an exit runs
  // through — and the queue happens after the member has already committed, which is the worst
  // possible place to discover a refusal.
  'lib/perps/perpsActivityBuffer.js': '../../lib/perps/perpsActivityBuffer.js',
  // Phase 3: the reads a member exits FROM, and the write path's stuck-order half.
  'hooks/usePerpsOrders.js': '../../hooks/usePerpsOrders.js',
  'hooks/usePerpsPositions.js': '../../hooks/usePerpsPositions.js',
  // Phase 4: the two surfaces an exit is actually performed on, and their venue-work modules.
  'components/perps/PositionSheet.jsx': '../../components/perps/PositionSheet.jsx',
  'components/perps/positionSheetActions.js': '../../components/perps/positionSheetActions.js',
  'components/perps/PerpsPendingOrders.jsx': '../../components/perps/PerpsPendingOrders.jsx',
  'components/perps/pendingOrderRecovery.js': '../../components/perps/pendingOrderRecovery.js',
  // The list the exit is reached from. Its `canManage` prop is the composition's answer arriving
  // as DATA — which is the design (one file answers it) — and it never withholds the venue
  // link-out, so nothing here may import a gate either.
  'components/perps/PerpsPositions.jsx': '../../components/perps/PerpsPositions.jsx',
}

describe('(g) the attestation, the flag and venue status cannot gate an exit', () => {
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

  /**
   * A SUPERSEDED RECORD RE-ASKS FOR THE OPEN AND CHANGES NOTHING ABOUT AN EXIT — asserted through
   * the REAL store, not a stub, because the two halves are what the property actually is:
   *
   *   - a member who acknowledged v1 must be asked again for v2 (they never saw those words), and
   *   - the same member must still be able to close, reduce, protect and recover, because a
   *     wording change is a FairWins event and cannot be allowed to strand a live position.
   *
   * The structural assertions above prove no exit module can REACH the attestation. This proves
   * the state that would matter if one ever did.
   */
  it('a superseded acknowledgement re-asks for the open and withholds no exit', () => {
    clearAttestation()
    recordAttestation(Object.fromEntries(PERPS_ATTESTATION_ITEMS.map((i) => [i.id, true])), 1)
    expect(hasAttested(1)).toBe(true)
    expect(hasAttested(2)).toBe(false)
    expect(attestationState(2).superseded).toBe(true)

    // Every exit the sheet can compose still builds, with the stale record in the store.
    for (const [name, built] of everySheetAction()) {
      expect(built.ok, `${name} was refused while the attestation was superseded`).toBe(true)
      expect(() => callsFor(built), name).not.toThrow()
    }
    // …and the recovery, which is the one a member most needs while we are changing our own terms.
    const stuck = {
      venue: 'gains',
      chainId: ARBITRUM,
      recoverable: true,
      recovery: {
        venue: 'gains',
        chainId: ARBITRUM,
        action: 'cancelOrderAfterTimeout',
        pendingOrderIndex: gains.pendingOrderIndex(4),
      },
    }
    expect(() => defaultBuildCalls(normalizeDescriptor(recoveryDescriptor(stuck), { account: MEMBER }))).not.toThrow()
    clearAttestation()
  })

  /**
   * THE ENTRY PATH MUST NOT BE REACHABLE FROM THE EXIT PATH.
   *
   * Phase 5 added the opening surface, and it legitimately names both gates — it is the one place
   * they belong. That creates a NEW way to break SC-004 that no assertion above covers: an exit
   * module importing an entry module inherits the gate transitively, and none of the greps above
   * would see it, because the gate's name never appears in the exit module's own source.
   *
   * `PerpsAttestation.jsx` in particular is a rendering of the jurisdiction gate. A close sheet
   * that imported it would be putting jurisdiction in front of an exit while passing every other
   * check in this file.
   */
  const ENTRY_ONLY = [
    'components/perps/OpenPositionSheet.jsx',
    'components/perps/openPositionActions.js',
    'components/perps/PerpsAttestation.jsx',
  ]

  it('no exit-path module imports an entry-path module', () => {
    for (const [name, path] of Object.entries(EXIT_PATH)) {
      const source = src(path)
      for (const entry of ENTRY_ONLY) {
        const basename = entry.slice(entry.lastIndexOf('/') + 1).replace(/\.jsx?$/, '')
        expect(source, `${name} imports ${entry}`).not.toMatch(
          new RegExp(`from\\s+['"][^'"]*${basename}['"]`),
        )
      }
    }
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

  /* --------------------------------------------------------------------------------------- *
   * The shared write path — the one module allowed to NAME a gate
   * --------------------------------------------------------------------------------------- */

  describe('usePerpsTrade carries the gates for the ONE entry action and nowhere else', () => {
    const trade = () => src('../../hooks/usePerpsTrade.js')

    it('cannot IMPORT a gate — every one of them arrives as an injected dependency', () => {
      // Naming `deps.hasAttested` is fine; being able to reach the real one is not. A module with
      // no import of the attestation, the kill switch or the sanctions client cannot apply one to
      // an exit however badly a future edit is written.
      expect(trade()).not.toMatch(/^import .*perps\/attestation/m)
      expect(trade()).not.toMatch(/^import .*sanctions/m)
      expect(trade()).not.toMatch(/perpsManageFeatureEnabled|VITE_PERPS_MANAGE_ENABLED/)
      expect(trade()).not.toMatch(/\bcanOpen\b|openBlockedNote/)
      // …and the only venueStatus-shaped thing it could import is not imported either.
      expect(trade()).not.toMatch(/from\s+['"].*perps\/venueStatus['"]/)
    })

    it('reaches the gates from EXACTLY ONE call site, and that site is inside the entry branch', () => {
      const source = trade()
      // The declaration plus one call. A second call site is the failure this asserts against:
      // it is how a gate ends up in front of a close without anyone deciding to put it there.
      const declarations = [...source.matchAll(/^async function runEntryGates\b/gm)]
      const callSites = [...source.matchAll(/(?<!function )\brunEntryGates\(/g)]
      expect(declarations).toHaveLength(1)
      expect(callSites).toHaveLength(1)

      // And the guard immediately above that call site is the entry test itself.
      const before = source.slice(0, callSites[0].index)
      const guard = before.slice(before.lastIndexOf('if ('))
      expect(guard).toMatch(/^if \(isEntryAction\(/)
    })

    it('treats `open` as the only entry action, so every other action is structurally ungated', () => {
      expect(PERPS_ENTRY_ACTIONS).toEqual(['open'])
      for (const action of ['close', 'reduce', 'protect', 'cancel', 'recover']) {
        expect(isEntryAction(action), `${action} was treated as an entry`).toBe(false)
      }
      // The member-facing word for a recovery normalises onto the machine's `cancel`, and that is
      // still not an entry — the alias must not be a way back through the gate branch.
      expect(normalizeAction('recover')).toBe('cancel')
      expect(isEntryAction('OPEN')).toBe(true)
    })

    it('does not even validate a recovery — there is nothing between a member and their money', () => {
      // A validator here would be a gate wearing another hat: the venue's own `WaitTimeout()` is
      // the only authority on whether a recovery is due, and the timeout mapper already refuses to
      // OFFER the control before then.
      expect(trade()).toMatch(/\bcancel:\s*null\b/)
    })
  })
})

/* --------------------------------------------------------------------------------------------- *
 * (h) The maps above cover the whole surface
 *
 * The invariants in (g) are properties of a PATH, and a path is a set of files. Phases 3 and 4
 * added six modules to it, and until they were listed the suite kept passing while covering less
 * of the thing it names. This section removes that failure mode permanently: every perps component
 * and every perps hook must be classified, so a new file is a FAILING TEST until someone states
 * which of the four kinds it is.
 * --------------------------------------------------------------------------------------------- */

describe('(h) every perps module is classified, so the exit-path map cannot go stale', () => {
  /** Exit path — asserted against in (g). Nothing here may name a gate at all. */
  const EXIT = [
    'components/perps/PerpsPendingOrders.jsx',
    'components/perps/PerpsPositions.jsx',
    'components/perps/PositionSheet.jsx',
    'components/perps/pendingOrderRecovery.js',
    'components/perps/positionSheetActions.js',
    'hooks/usePerpsOrders.js',
    'hooks/usePerpsPositions.js',
  ]
  /**
   * ENTRY path — the opening surface, and the ONLY components that may name a gate.
   *
   * Opening is the one action FairWins gates (FR-014/FR-015), so these files reach the attestation
   * and the screening client on purpose. What makes that safe is the direction of the dependency:
   * nothing on the exit path may import them (asserted in `(g)`), so the gates they carry cannot
   * travel to a close, a reduce or a recovery.
   */
  const ENTRY = [
    'components/perps/OpenPositionSheet.jsx',
    'components/perps/PerpsAttestation.jsx',
    'components/perps/openPositionActions.js',
  ]
  /** The shared write path: names the gates, reaches them only for `open`. */
  const WRITE = ['hooks/usePerpsTrade.js']
  /** The composition point — the ONE file that may read the management kill switch. */
  const COMPOSITION = ['components/perps/PerpsView.jsx']
  /** Market data and presentation: no gate, no exit, nothing to assert beyond that. */
  const READ_ONLY = [
    'components/perps/PerpsPairTable.jsx',
    'components/perps/PerpsVenueBadge.jsx',
    'hooks/usePerpsMarkets.js',
  ]

  /**
   * `lib/perps/` — enumerated for the SAME reason the components are, and it was not.
   *
   * (g)'s EXIT_PATH map lists four lib modules by hand, and a hand-maintained list of files in a
   * directory nobody enumerates is exactly the staleness (h) exists to prevent: a new
   * `lib/perps/*.js` that a close runs through could import a gate and every assertion above would
   * keep passing, because the map it is checked against would simply not mention it.
   *
   * LIB_EXIT is the set an exit runs through — nothing in it may name a gate. LIB_ENTRY is the
   * gate's own home. LIB_NEUTRAL is pure presentation and transport, which an exit also touches but
   * which cannot express a decision about one.
   */
  const LIB_EXIT = [
    'lib/perps/gmxDerived.js',
    'lib/perps/gmxMarkets.js',
    'lib/perps/orderState.js',
    'lib/perps/perpsActivityBuffer.js',
    'lib/perps/validation.js',
    'lib/perps/venues/gains.js',
    'lib/perps/venues/gmx.js',
  ]
  /** The gate itself, and the module whose whole job is answering "may this venue be opened on". */
  const LIB_ENTRY = ['lib/perps/attestation.js', 'lib/perps/venueStatus.js']
  /** Formatting, copy, transport, unit maths, and the defaults an OPEN form is pre-filled with. */
  const LIB_NEUTRAL = [
    'lib/perps/defaults.js',
    'lib/perps/feeUnits.js',
    'lib/perps/format.js',
    'lib/perps/linkouts.js',
    'lib/perps/perpsClient.js',
    'lib/perps/perpsCopy.js',
  ]

  const dir = (relative) => fileURLToPath(new URL(relative, import.meta.url))

  function libModules() {
    const root = dir('../../lib/perps')
    const top = readdirSync(root)
      .filter((f) => /\.jsx?$/.test(f))
      .map((f) => `lib/perps/${f}`)
    const venues = readdirSync(dir('../../lib/perps/venues'))
      .filter((f) => /\.jsx?$/.test(f))
      .map((f) => `lib/perps/venues/${f}`)
    return [...top, ...venues].sort()
  }

  function modules() {
    const components = readdirSync(dir('../../components/perps'))
      .filter((f) => /\.jsx?$/.test(f))
      .map((f) => `components/perps/${f}`)
    const hooks = readdirSync(dir('../../hooks'))
      .filter((f) => /^usePerps.*\.js$/.test(f))
      .map((f) => `hooks/${f}`)
    return [...components, ...hooks].sort()
  }

  it('leaves nothing unclassified — a new perps module fails this until it is placed', () => {
    const classified = [...EXIT, ...ENTRY, ...WRITE, ...COMPOSITION, ...READ_ONLY].sort()
    expect(modules()).toEqual(classified)
  })

  it('leaves no lib/perps module unclassified either — the (g) map is over files, not guesses', () => {
    expect(libModules()).toEqual([...LIB_EXIT, ...LIB_ENTRY, ...LIB_NEUTRAL].sort())
  })

  it('every lib module an exit runs through is in (g)’s own EXIT_PATH map', () => {
    // The two lists are maintained separately and MUST agree: (g) asserts the property, (h)
    // asserts the list is complete. Either one drifting silently is the failure being prevented.
    for (const module of LIB_EXIT) {
      expect(Object.keys(EXIT_PATH), `${module} is classified as an exit module but (g) never checks it`)
        .toContain(module)
    }
  })

  it('no lib module on the exit path names a gate — the whole directory, not a chosen four', () => {
    for (const module of [...LIB_EXIT, ...LIB_NEUTRAL]) {
      const source = src(`../../${module}`)
      expect(source, `${module} imports the attestation`).not.toMatch(/from\s+['"].*perps\/attestation['"]/)
      expect(source, `${module} imports sanctions screening`).not.toMatch(/^import .*sanctions/m)
      expect(source, `${module} reads the kill switch`).not.toMatch(
        /perpsManageFeatureEnabled|VITE_PERPS_MANAGE_ENABLED/,
      )
    }
    // `canOpen` is exempted for the NEUTRAL set only where the module is the one that DEFINES the
    // vocabulary — and that module is in LIB_ENTRY, not here — so the exit set is checked strictly.
    for (const module of LIB_EXIT) {
      expect(src(`../../${module}`), `${module} consults canOpen`).not.toMatch(/\bcanOpen\b|openBlockedNote/)
    }
  })

  it('the attestation is reachable from the ENTRY path and from nowhere else', () => {
    const readers = modules().filter((m) => /perps\/attestation['"]|PerpsAttestation/.test(src(`../../${m}`)))
    // `usePerpsTrade` is absent on purpose: it NAMES `deps.hasAttested` but cannot import the real
    // one, which is what keeps a gate off every exit however badly a future edit is written.
    expect(readers.sort()).toEqual(
      ['components/perps/OpenPositionSheet.jsx', 'components/perps/PerpsAttestation.jsx'].sort(),
    )
  })

  it('the kill switch is read in exactly one file, and it is the composition point', () => {
    const readers = modules().filter((m) =>
      /perpsManageFeatureEnabled\(|VITE_PERPS_MANAGE_ENABLED/.test(src(`../../${m}`)),
    )
    expect(readers).toEqual(COMPOSITION)
  })

  it('no exit-path or read-only module imports the attestation, screening, or venue status', () => {
    // ENTRY is deliberately absent: those files are the gate's home. WRITE is absent because it is
    // asserted structurally above (it names the gates and cannot import them).
    for (const module of [...EXIT, ...READ_ONLY]) {
      const source = src(`../../${module}`)
      expect(source, `${module} imports the attestation`).not.toMatch(/from\s+['"].*perps\/attestation['"]/)
      expect(source, `${module} imports sanctions screening`).not.toMatch(/^import .*sanctions/m)
      expect(source, `${module} consults canOpen`).not.toMatch(/\bcanOpen\b|openBlockedNote/)
    }
  })

  /**
   * THE ENTRY MODULES ARE REACHABLE FROM EXACTLY ONE PLACE — the composition point.
   *
   * (g) asserts no EXIT module imports one. This closes the other half: no READ-ONLY module may
   * either. `PerpsPairTable` is the case that makes it matter — it now renders the control that
   * OPENS the entry sheet, and the tempting shortcut is for it to import and render the sheet
   * itself. That would put the jurisdiction gate inside the pairs table, one component away from
   * every read-only surface, and every other assertion in this file would still pass.
   */
  it('only the composition point may import an entry module — not the table that opens it', () => {
    for (const module of [...EXIT, ...READ_ONLY, ...WRITE]) {
      const source = src(`../../${module}`)
      for (const entry of ENTRY) {
        const basename = entry.slice(entry.lastIndexOf('/') + 1).replace(/\.jsx?$/, '')
        expect(source, `${module} imports ${entry}`).not.toMatch(
          new RegExp(`from\\s+['"][^'"]*${basename}['"]`),
        )
      }
    }
    // …and the composition point genuinely does import one, so the rule above is not vacuous.
    expect(src(`../../${COMPOSITION[0]}`)).toMatch(/from\s+['"]\.\/OpenPositionSheet['"]/)
  })

  /**
   * The state names belong to `orderState.js`, and nothing may spell one itself.
   *
   * This is rule 2 ("never re-derive state in a component") made checkable. A component that
   * writes `['validating', 'screening', 'switching', 'signing']` has copied the machine's state
   * list, and a copied list does not grow when the machine does — so the day a state is added the
   * copy silently stops matching, and the surface stops disabling its controls (or stops treating
   * an order as needing attention) mid-flight. `ORDER_STATE.*` cannot go stale that way.
   *
   * `switching` is deliberately NOT in this list: it is also the SEND RAIL's own `state.step`
   * word (`useEarnSend`), and `usePerpsTrade` reads that rail's vocabulary legitimately. Two
   * vocabularies sharing a word is not the same as one being copied.
   */
  const MACHINE_ONLY_STATES = [
    'validating',
    'screening',
    'signing',
    'submitted',
    'venue_pending',
    'executed',
    'rejected',
    'frozen',
    'timed_out',
  ]

  it('no perps module spells an order state itself — they all go through ORDER_STATE', () => {
    const pattern = new RegExp(`['"](${MACHINE_ONLY_STATES.join('|')})['"]`, 'g')
    for (const module of modules()) {
      const code = stripComments(src(`../../${module}`))
      expect([...code.matchAll(pattern)].map((m) => m[1]), `${module} hardcodes an order state`).toEqual([])
    }
  })

  /**
   * The same rule over the two places phase 7 put the machine's vocabulary, and neither of them is
   * a perps component or hook, so the sweep above never looked at either.
   *
   * `perpsSource.js` picks the WORDING for a state — it is the file that decides whether a member
   * reads "sent" or "closed" — so a copied state list there is how an order the venue merely
   * ACKNOWLEDGED gets reported as executed. `perpsActivityBuffer.js` decides which states are
   * reportable at all. Both are required to ask the machine.
   */
  it('the activity buffer and the activity source spell no state either', () => {
    const pattern = new RegExp(`['"](${MACHINE_ONLY_STATES.join('|')})['"]`, 'g')
    for (const module of ['lib/perps/perpsActivityBuffer.js', 'data/notifications/sources/perpsSource.js']) {
      const code = stripComments(src(`../../${module}`))
      expect([...code.matchAll(pattern)].map((m) => m[1]), `${module} hardcodes an order state`).toEqual([])
      // …and each one genuinely reaches the machine, so the absence above is delegation and not
      // simply a file that never mentions a state.
      expect(code, `${module} never consults ORDER_STATE`).toMatch(/\bORDER_STATE\b/)
    }
  })

  /**
   * NOTHING OUTSIDE THE MACHINE MAY MINT AN EXECUTION SIGNAL.
   *
   * `(d)` proves no state × signal combination reaches `executed` without `VENUE_EXECUTED`. This
   * proves the complement: that no module outside `orderState.js` can construct that signal in the
   * first place. `usePerpsTrade` is the one exception and it is deliberate — `confirmFromVenue`
   * emits it for a DIRECT-settlement action, from the venue's own re-read, and is fenced to that
   * settlement kind (asserted in `protectionConfirmation.test.js`).
   */
  it('only the write path can construct a VENUE_EXECUTED signal, and only for a direct settlement', () => {
    const emitters = [...modules(), 'lib/perps/perpsActivityBuffer.js', 'data/notifications/sources/perpsSource.js']
      .filter((m) => /SIGNAL\.VENUE_EXECUTED/.test(stripComments(src(`../../${m}`))))
    expect(emitters).toEqual(['hooks/usePerpsTrade.js'])
    const trade = stripComments(src('../../hooks/usePerpsTrade.js'))
    const sites = [...trade.matchAll(/SIGNAL\.VENUE_EXECUTED/g)]
    expect(sites).toHaveLength(1)
    // The guard immediately above it is the direct-settlement fence.
    const before = trade.slice(0, sites[0].index)
    expect(before.slice(before.lastIndexOf('if ('))).toMatch(/settlementFor\(/)
  })
})

/** Comments legitimately NAME the states — it is the code that must not spell them. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}
