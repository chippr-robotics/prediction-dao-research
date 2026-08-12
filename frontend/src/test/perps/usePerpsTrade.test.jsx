/**
 * usePerpsTrade (spec 083, T030) — the write state machine every perps action drives.
 *
 * The progression is tested EXHAUSTIVELY rather than by example, because the failures this hook
 * exists to prevent are all "one more case someone forgot":
 *
 *   - inclusion is never execution — every submission shape the app's rails can produce, from
 *     every venue, must stop at "sent"/"the venue has it";
 *   - a rejection carries the VENUE's reason, verbatim;
 *   - a timeout lands in a state that carries the recovery handle, in the right index space;
 *   - a lost thread is `unknown` — not success, not failure;
 *   - and no exit action touches the entry gates, which is checked by BOTH behaviour (the gate
 *     dependencies throw if called) and source (this module cannot even import them).
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Interface, getAddress } from 'ethers'

import { WalletContext } from '../../contexts/WalletContext'
import { usePerpsTrade, normalizeDescriptor, isEntryAction, PERPS_REFUSAL } from '../../hooks/usePerpsTrade'
import hookSource from '../../hooks/usePerpsTrade.js?raw'
import { GAINS_DIAMOND_ABI } from '../../abis/perps/gainsDiamond'
import { GMX_EVENT_EMITTER_ABI } from '../../abis/perps/gmxExchangeRouter'
import { GAINS_DIAMOND_BY_CHAIN, GMX_ADDRESSES_BY_CHAIN } from '../../config/perps'
import * as gains from '../../lib/perps/venues/gains'

const ARBITRUM = 42161
const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
const MARKET = '0x47c031236e19d024b42f8AE6780E44A573170703'
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const ORDER_KEY = `0x${'ab'.repeat(32)}`
const TX = `0x${'11'.repeat(32)}`

const diamond = new Interface(GAINS_DIAMOND_ABI)
const emitter = new Interface(GMX_EVENT_EMITTER_ABI)

// The hook's own source, for the import assertions below. Loaded through Vite's `?raw` rather than
// `fs` + `import.meta.url`: under jsdom `import.meta.url` is not a file: URL, and a cwd-relative
// path would only resolve when the suite is run from `frontend/`.
const src = String(hookSource)

/* --------------------------------------------------------------------------------------------- *
 * Fixtures
 * --------------------------------------------------------------------------------------------- */

const wallet = { current: {} }
const wrapper = ({ children }) => (
  <WalletContext.Provider value={wallet.current}>{children}</WalletContext.Provider>
)

/** A log encoded the way the chain would encode it, so the venue decoders run for real. */
function gainsLog(name, args) {
  const encoded = diamond.encodeEventLog(diamond.getEvent(name), args)
  return { address: GAINS_DIAMOND_BY_CHAIN[ARBITRUM], topics: encoded.topics, data: encoded.data }
}

const NO_ITEMS = { items: [], arrayItems: [] }
function gmxLog(eventName, { key = ORDER_KEY, account = MEMBER, reason = null } = {}) {
  const eventData = {
    addressItems: NO_ITEMS,
    uintItems: NO_ITEMS,
    intItems: NO_ITEMS,
    boolItems: NO_ITEMS,
    bytes32Items: NO_ITEMS,
    bytesItems: NO_ITEMS,
    stringItems: { items: reason ? [{ key: 'reason', value: reason }] : [], arrayItems: [] },
  }
  const encoded = emitter.encodeEventLog(emitter.getEvent('EventLog2'), [
    MEMBER, // msgSender
    eventName,
    eventName, // indexed string → hashed by ethers
    key,
    `0x${'0'.repeat(24)}${account.slice(2).toLowerCase()}`, // Cast.toBytes32(account)
    eventData,
  ])
  return { address: GMX_ADDRESSES_BY_CHAIN[ARBITRUM].eventEmitter, topics: encoded.topics, data: encoded.data }
}

const MARKET_ORDER_INITIATED = (index = 4, open = false) =>
  gainsLog('MarketOrderInitiated', [[MEMBER, index], MEMBER, 1, open])

const MARKET_EXECUTED = (pendingIndex = 4, tradeIdx = 7) =>
  gainsLog('MarketExecuted', [
    [MEMBER, pendingIndex],
    MEMBER,
    tradeIdx,
    [MEMBER, tradeIdx, 1, 10_000, true, true, 3, 0, 100_000_000n, 630_000_000_000_000n, 0, 0, false, 0, 0],
    false,
    63_000n * 10n ** 10n,
    63_000n * 10n ** 10n,
    50_000n * 10n ** 10n,
    [0n, 0n, 0n, 0n, 0n, 0n],
    0n,
    101_000_000n,
    10n ** 8n,
  ])

/** cancelReason 3 = SLIPPAGE, which the venue module maps to a member-facing sentence. */
const MARKET_OPEN_CANCELED = (index = 4, reason = 3) =>
  gainsLog('MarketOpenCanceled', [[MEMBER, index], MEMBER, 1, reason, 100_000_000n])

const COLLATERAL_RETURNED = (index = 4) =>
  gainsLog('CollateralReturnedAfterTimeout', [[MEMBER, index], 3, MEMBER, 100_000_000n])

/** A classic-rail result: one awaited receipt per call. */
const receipt = (logs = [], blockNumber = 100) => ({
  route: 'direct',
  txHash: TX,
  receipts: [{ status: 1, hash: TX, blockNumber, logs }],
})

/**
 * A provider whose head advances and whose log batches are served one poll at a time. `now`
 * advances on every read so a watch that finds nothing is guaranteed to hit its deadline instead
 * of spinning.
 */
function fakeChain({ batches = [], headStart = 100, headStep = 1 } = {}) {
  let poll = 0
  return {
    getLogs: vi.fn(async () => {
      const batch = batches[poll] ?? []
      poll += 1
      return batch
    }),
    getBlockNumber: vi.fn(async () => headStart + poll * headStep),
  }
}

/**
 * A sleep that never resolves: the watcher parks after its first poll, so a test can assert the
 * state the member actually SEES at that moment instead of racing the background watch to its
 * deadline. (With an instant sleep the whole watch runs inside one `act` flush.)
 */
const parked = () => new Promise(() => {})

/** Gate dependencies that FAIL the test if an exit ever reaches them. */
function forbiddenGates() {
  return {
    hasAttested: vi.fn(() => {
      throw new Error('an exit consulted the attestation')
    }),
    screenAccount: vi.fn(() => {
      throw new Error('an exit consulted sanctions screening')
    }),
  }
}

function makeDeps(over = {}) {
  let clock = 0
  return {
    sendOnChain: vi.fn(async () => receipt()),
    getProvider: () => fakeChain(),
    sleep: async () => {},
    now: () => (clock += 1_000),
    ...over,
  }
}

const CLOSE = {
  action: 'close',
  venue: 'gains',
  chainId: ARBITRUM,
  params: { tradeIndex: gains.tradeIndex(7), expectedPrice: 63_000 },
  validate: { position: { sizeUsd: 1000 }, closeFraction: 1 },
}

const GMX_CLOSE = {
  action: 'close',
  venue: 'gmx',
  chainId: ARBITRUM,
  params: {
    market: MARKET,
    collateralToken: USDC,
    sizeDeltaUsd: 1_000n * 10n ** 30n,
    acceptablePrice: 62_500n * 10n ** 30n,
    executionFee: 1_500_000_000_000_000n,
    isLong: true,
  },
  validate: { position: { sizeInUsd: 1_000n * 10n ** 30n }, closeFraction: 1 },
}

const OPEN = {
  action: 'open',
  venue: 'gains',
  chainId: ARBITRUM,
  params: {
    pairIndex: 0,
    collateralIndex: 3,
    collateralAmount: 100_000_000n,
    leverage: 10,
    long: true,
    openPrice: 63_000,
    maxSlippageP: 1,
  },
  validate: {
    collateralAmount: 100_000_000n,
    balance: 500_000_000n,
    leverage: 10,
    venueLimits: { maxLeverage: 150 },
  },
}

async function run(result, descriptor) {
  let out
  await act(async () => {
    out = await result.current.submit(descriptor)
  })
  return out
}

async function settle(out) {
  await act(async () => {
    await out.watched
  })
}

beforeEach(() => {
  wallet.current = { address: MEMBER, chainId: ARBITRUM, loginMethod: 'wallet', signer: {}, sendCalls: vi.fn() }
})

/* --------------------------------------------------------------------------------------------- *
 * Descriptor + calldata
 * --------------------------------------------------------------------------------------------- */

describe('the action descriptor', () => {
  it('normalises "recover" to the machine’s "cancel" — the word two mappers key on', () => {
    // gainsEventSignal and gmxEventSignal both read `action === 'cancel'` to tell a member's own
    // recovery executing from the order it recovered never running. 'recover' must not miss it.
    const spec = normalizeDescriptor({ action: 'recover', venue: 'gains', chainId: ARBITRUM, account: MEMBER })
    expect(spec.ok).toBe(true)
    expect(spec.action).toBe('cancel')
  })

  it('treats open as the ONLY entry action', () => {
    expect(isEntryAction('open')).toBe(true)
    for (const action of ['close', 'reduce', 'protect', 'cancel', 'recover', 'nonsense', null, undefined, 7]) {
      expect(isEntryAction(action), `${String(action)} was treated as an entry`).toBe(false)
    }
  })

  it('refuses an unknown venue, an unknown action, a missing chain and a missing account', () => {
    const cases = [
      [{ action: 'sell', venue: 'gains', chainId: ARBITRUM, account: MEMBER }, PERPS_REFUSAL.ACTION_UNSUPPORTED],
      [{ action: 'close', venue: 'hyperliquid', chainId: ARBITRUM, account: MEMBER }, PERPS_REFUSAL.VENUE_UNSUPPORTED],
      [{ action: 'close', venue: 'gains', account: MEMBER }, PERPS_REFUSAL.CHAIN_MISSING],
      [{ action: 'close', venue: 'gains', chainId: ARBITRUM }, PERPS_REFUSAL.ACCOUNT_MISSING],
    ]
    for (const [input, code] of cases) {
      const spec = normalizeDescriptor(input)
      expect(spec.ok).toBe(false)
      expect(spec.code).toBe(code)
    }
  })
})

describe('the call batch comes from the venue builders', () => {
  it('sends the venue’s own close call, on the venue’s chain, through the app’s send rail', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    await run(result, CLOSE)

    expect(deps.sendOnChain).toHaveBeenCalledTimes(1)
    const [chainId, calls] = deps.sendOnChain.mock.calls[0]
    expect(chainId).toBe(ARBITRUM)
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe(GAINS_DIAMOND_BY_CHAIN[ARBITRUM])
    const [index, price] = diamond.decodeFunctionData('closeTradeMarket', calls[0].data)
    expect(Number(index)).toBe(7)
    expect(price).toBe(630_000_000_000_000n)
  })

  it('writes the MEMBER into the order it builds — never any FairWins address', async () => {
    const deps = makeDeps({ hasAttested: () => true, screenAccount: async () => 'clear' })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    await run(result, OPEN)
    const [, calls] = deps.sendOnChain.mock.calls[0]
    const [trade] = diamond.decodeFunctionData('openTrade', calls[0].data)
    expect(trade.user).toBe(getAddress(MEMBER))
  })

  it('prepends an approval to an OPEN and never to an exit', async () => {
    const deps = makeDeps({ hasAttested: () => true, screenAccount: async () => 'clear' })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })

    await run(result, { ...OPEN, approval: { token: USDC, amount: 100_000_000n } })
    expect(deps.sendOnChain.mock.calls[0][1]).toHaveLength(2)
    expect(deps.sendOnChain.mock.calls[0][1][0].target).toBe(getAddress(USDC))

    // An exit returns collateral; an approval there would be a signature for nothing.
    await run(result, { ...CLOSE, approval: { token: USDC, amount: 100_000_000n } })
    expect(deps.sendOnChain.mock.calls[1][1]).toHaveLength(1)
  })

  it('emits the stop-loss leg before the take-profit leg', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    await run(result, {
      action: 'protect',
      venue: 'gains',
      chainId: ARBITRUM,
      params: { tradeIndex: gains.tradeIndex(7), sl: 60_000, tp: 70_000 },
      validate: { position: { markPrice: 63_000, isLong: true, liquidationPrice: 57_000 }, stopLoss: 60_000, takeProfit: 70_000 },
    })
    const [, calls] = deps.sendOnChain.mock.calls[0]
    expect(calls).toHaveLength(2)
    expect(diamond.parseTransaction({ data: calls[0].data }).name).toBe('updateSl')
    expect(diamond.parseTransaction({ data: calls[1].data }).name).toBe('updateTp')
  })

  it('surfaces a builder refusal (the wrong Gains index space) instead of signing it', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    const out = await run(result, { ...CLOSE, params: { ...CLOSE.params, tradeIndex: gains.pendingOrderIndex(7) } })
    expect(out.ok).toBe(false)
    expect(out.code).toBe(PERPS_REFUSAL.BUILD_FAILED)
    expect(deps.sendOnChain).not.toHaveBeenCalled()
    expect(result.current.status).toBe('rejected')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Validation before the wallet prompt
 * --------------------------------------------------------------------------------------------- */

describe('validation runs BEFORE a signature is requested', () => {
  it('refuses a close of more than the whole position, with the validator’s own words', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    const out = await run(result, { ...CLOSE, validate: { position: { sizeUsd: 1000 }, closeFraction: 2 } })

    expect(deps.sendOnChain).not.toHaveBeenCalled()
    expect(out.code).toBe(PERPS_REFUSAL.VALIDATION)
    expect(out.reason).toBe('You cannot close more than the whole position.')
    expect(result.current.refusal.reason).toBe('You cannot close more than the whole position.')
    expect(result.current.status).toBe('rejected')
  })

  it('refuses a stop-loss beyond the liquidation price before any wallet prompt', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    const out = await run(result, {
      action: 'protect',
      venue: 'gains',
      chainId: ARBITRUM,
      params: { tradeIndex: gains.tradeIndex(7), sl: 56_000 },
      validate: { position: { markPrice: 63_000, isLong: true, liquidationPrice: 57_000 }, stopLoss: 56_000 },
    })
    expect(deps.sendOnChain).not.toHaveBeenCalled()
    expect(out.reason).toMatch(/liquidation price/)
  })

  it('refuses an OPEN with nothing to check — but lets an exit through with nothing to check', async () => {
    const deps = makeDeps({ hasAttested: () => true, screenAccount: async () => 'clear' })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })

    const opened = await run(result, { ...OPEN, validate: null })
    expect(opened.code).toBe(PERPS_REFUSAL.VALIDATION_MISSING)
    expect(deps.sendOnChain).not.toHaveBeenCalled()

    // An exit is never blocked on a check we were not given the material for.
    await run(result, { ...CLOSE, validate: null })
    expect(deps.sendOnChain).toHaveBeenCalledTimes(1)
  })

  it('never validates a recovery away', async () => {
    const deps = makeDeps({ ...forbiddenGates() })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    const out = await run(result, {
      action: 'recover',
      venue: 'gains',
      chainId: ARBITRUM,
      params: { pendingOrderIndex: gains.pendingOrderIndex(4) },
    })
    expect(out.ok).toBe(true)
    expect(deps.sendOnChain).toHaveBeenCalledTimes(1)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * The gates — entry only
 * --------------------------------------------------------------------------------------------- */

describe('the entry gates', () => {
  const EXITS = [
    ['close', CLOSE],
    ['reduce', { ...CLOSE, action: 'reduce', params: { tradeIndex: gains.tradeIndex(7), collateralDelta: 10_000_000n, expectedPrice: 63_000 }, validate: { position: { sizeUsd: 1000 }, closeFraction: 0.5 } }],
    [
      'protect',
      {
        action: 'protect',
        venue: 'gains',
        chainId: ARBITRUM,
        params: { tradeIndex: gains.tradeIndex(7), sl: 60_000 },
        validate: { position: { markPrice: 63_000, isLong: true, liquidationPrice: 57_000 }, stopLoss: 60_000 },
      },
    ],
    ['cancel', { action: 'cancel', venue: 'gains', chainId: ARBITRUM, params: { pendingOrderIndex: gains.pendingOrderIndex(4) } }],
    ['recover', { action: 'recover', venue: 'gains', chainId: ARBITRUM, params: { pendingOrderIndex: gains.pendingOrderIndex(4) } }],
    ['gmx close', GMX_CLOSE],
    [
      'gmx cancel',
      { action: 'cancel', venue: 'gmx', chainId: ARBITRUM, params: { key: ORDER_KEY } },
    ],
  ]

  it('EXHAUSTIVE: no exit action consults screening or the attestation', async () => {
    for (const [label, descriptor] of EXITS) {
      const gates = forbiddenGates()
      const deps = makeDeps(gates)
      const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
      const out = await run(result, descriptor)
      expect(gates.hasAttested, `${label} consulted the attestation`).not.toHaveBeenCalled()
      expect(gates.screenAccount, `${label} consulted screening`).not.toHaveBeenCalled()
      expect(out.ok, `${label} was refused`).toBe(true)
      expect(deps.sendOnChain, `${label} was not sent`).toHaveBeenCalledTimes(1)
    }
  })

  it('an entry action DOES consult both, and proceeds when both are satisfied', async () => {
    const hasAttested = vi.fn(() => true)
    const screenAccount = vi.fn(async () => 'clear')
    const deps = makeDeps({ hasAttested, screenAccount })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    const out = await run(result, OPEN)
    expect(hasAttested).toHaveBeenCalled()
    expect(screenAccount).toHaveBeenCalledWith(MEMBER, ARBITRUM)
    expect(out.ok).toBe(true)
  })

  it('fails CLOSED for an open: missing, restricted, uncertain, throwing, and unwired', async () => {
    const cases = [
      ['attestation not given', { hasAttested: () => false, screenAccount: async () => 'clear' }, PERPS_REFUSAL.ATTESTATION_MISSING],
      ['attestation unwired', { screenAccount: async () => 'clear' }, PERPS_REFUSAL.ATTESTATION_UNAVAILABLE],
      ['restricted', { hasAttested: () => true, screenAccount: async () => 'restricted' }, PERPS_REFUSAL.SCREENING_RESTRICTED],
      ['uncertain', { hasAttested: () => true, screenAccount: async () => 'uncertain' }, PERPS_REFUSAL.SCREENING_UNCONFIRMED],
      [
        'screening threw',
        {
          hasAttested: () => true,
          screenAccount: async () => {
            throw new Error('endpoint down')
          },
        },
        PERPS_REFUSAL.SCREENING_UNCONFIRMED,
      ],
      ['screening unwired', { hasAttested: () => true }, PERPS_REFUSAL.SCREENING_UNCONFIRMED],
    ]
    for (const [label, gates, code] of cases) {
      const deps = makeDeps(gates)
      const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
      const out = await run(result, OPEN)
      expect(out.code, label).toBe(code)
      expect(deps.sendOnChain, `${label} still signed`).not.toHaveBeenCalled()
      expect(result.current.status).toBe('rejected')
      // A refused open never claims the member did anything wrong about their existing positions.
      expect(result.current.refusal.reason).toMatch(/still|confirm|acknowledgements/i)
    }
  })

  it('this module cannot even IMPORT a gate — the exit path has nothing to call', () => {
    // The same property safetyInvariants.test.js asserts for the other exit-path modules: gates are
    // injected, so applying one to an exit is not a discipline, it is unreachable.
    expect(src).not.toMatch(/from\s+['"].*perps\/attestation['"]/)
    expect(src).not.toMatch(/hasAttested\s*\(\s*\)\s*from|PERPS_ATTESTATION|attestationState/)
    expect(src).not.toMatch(/perpsManageFeatureEnabled|VITE_PERPS_MANAGE_ENABLED/)
    expect(src).not.toMatch(/\bcanOpen\b|openBlockedNote/)
    expect(src).not.toMatch(/from\s+['"].*sanctionsScreen['"]|useAddressScreening/)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Inclusion is never execution
 * --------------------------------------------------------------------------------------------- */

describe('inclusion is never execution', () => {
  it('a receipt with no venue log reports SENT — never closed', async () => {
    const deps = makeDeps({ sendOnChain: async () => receipt([]), getProvider: () => fakeChain(), sleep: parked })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 30_000 }), { wrapper })
    const out = await run(result, CLOSE)

    expect(out.state).toBe('submitted')
    expect(result.current.statusText).toBe('Sent to Gains.')
    expect(result.current.pending).toBe(true)
    expect(result.current.terminal).toBe(false)
  })

  it('the venue’s acknowledgement in the receipt reaches venue_pending, and stops there', async () => {
    const deps = makeDeps({ sendOnChain: async () => receipt([MARKET_ORDER_INITIATED()]), sleep: parked })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 30_000 }), { wrapper })
    const out = await run(result, CLOSE)

    expect(out.state).toBe('venue_pending')
    expect(result.current.statusText).toBe('Gains is executing this.')
    expect(result.current.terminal).toBe(false)
  })

  it('EXHAUSTIVE: no submission outcome any rail produces reports executed', async () => {
    const outcomes = [
      ['included receipt', receipt([MARKET_ORDER_INITIATED()])],
      ['bare hash', TX],
      ['passkey included', { state: 'included', txHash: TX }],
      ['passkey submitted', { state: 'submitted', userOpHash: TX }],
      ['passkey stalled', { state: 'stalled', userOpHash: TX }],
      ['a word we do not know', { state: 'confirmed' }],
      ['no reference at all', {}],
    ]
    for (const [label, sent] of outcomes) {
      const deps = makeDeps({ sendOnChain: async () => sent, getProvider: () => null })
      const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 0 }), { wrapper })
      const out = await run(result, CLOSE)
      await settle(out)
      expect(result.current.status, `${label} reported execution`).not.toBe('executed')
    }
  })

  it('a stalled operation is `unknown` — not success, and pointed at the venue', async () => {
    const deps = makeDeps({ sendOnChain: async () => ({ state: 'stalled', userOpHash: TX }) })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    await run(result, CLOSE)
    expect(result.current.status).toBe('unknown')
    expect(result.current.statusText).toMatch(/can’t confirm this — check on Gains/)
  })

  it('a reverted receipt is a rejection, not a pending order', async () => {
    const deps = makeDeps({ sendOnChain: async () => ({ route: 'direct', receipts: [{ status: 0 }] }) })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    const out = await run(result, CLOSE)
    expect(out.state).toBe('rejected')
    expect(out.reason).toBe('The transaction was reverted by the network.')
  })

  it('a wallet refusal never reaches the venue at all', async () => {
    const deps = makeDeps({
      sendOnChain: async () => {
        throw new Error('Could not switch to Arbitrum One — approve the network change and try again.')
      },
    })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    const out = await run(result, CLOSE)
    expect(out.code).toBe(PERPS_REFUSAL.SEND_FAILED)
    // The rail already speaks in member-facing sentences; they are kept verbatim.
    expect(out.reason).toMatch(/approve the network change/)
    expect(result.current.status).toBe('rejected')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * The venue's own terminal events
 * --------------------------------------------------------------------------------------------- */

describe('only a venue event moves an order past pending', () => {
  it('Gains: MarketExecuted is what reports the position closed', async () => {
    const deps = makeDeps({
      sendOnChain: async () => receipt([MARKET_ORDER_INITIATED()]),
      getProvider: () => fakeChain({ batches: [[], [MARKET_EXECUTED()]] }),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 30_000 }), { wrapper })
    const out = await run(result, CLOSE)
    expect(out.state).toBe('venue_pending')

    await settle(out)
    expect(result.current.status).toBe('executed')
    expect(result.current.statusText).toBe('Position closed.')
    // The venue's own numbers, in venue units — nothing derived here.
    expect(result.current.order.execution.amountSentToTrader).toBe(101_000_000n)
  })

  it('Gains: a cancellation carries the VENUE’s reason, verbatim', async () => {
    const deps = makeDeps({
      sendOnChain: async () => receipt([MARKET_ORDER_INITIATED()]),
      getProvider: () => fakeChain({ batches: [[MARKET_OPEN_CANCELED(4, 3)]] }),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 30_000 }), { wrapper })
    const out = await run(result, CLOSE)
    await settle(out)

    expect(result.current.status).toBe('rejected')
    expect(result.current.order.reason.source).toBe('gains')
    expect(result.current.order.reason.code).toBe(3)
    expect(result.current.statusText).toBe('The price moved more than your slippage allowed.')
  })

  it('GMX: OrderCreated then OrderExecuted, with the reason of a cancellation kept verbatim', async () => {
    const executed = makeDeps({
      sendOnChain: async () => receipt([gmxLog('OrderCreated')]),
      getProvider: () => fakeChain({ batches: [[gmxLog('OrderExecuted')]] }),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps: executed, watchMs: 30_000 }), { wrapper })
    const out = await run(result, GMX_CLOSE)
    expect(out.state).toBe('venue_pending')
    await settle(out)
    expect(result.current.status).toBe('executed')

    const cancelled = makeDeps({
      sendOnChain: async () => receipt([gmxLog('OrderCreated')]),
      getProvider: () =>
        fakeChain({ batches: [[gmxLog('OrderCancelled', { reason: 'OrderNotFulfillableAtAcceptablePrice' })]] }),
    })
    const second = renderHook(() => usePerpsTrade({ deps: cancelled, watchMs: 30_000 }), { wrapper })
    const out2 = await run(second.result, GMX_CLOSE)
    await settle(out2)
    expect(second.result.current.status).toBe('rejected')
    // GMX states its reason as its own error name. Translating it would invent a cause (FR-008).
    expect(second.result.current.statusText).toBe('OrderNotFulfillableAtAcceptablePrice')
  })

  it('GMX: a frozen trigger order needs attention and nothing auto-clears it', async () => {
    const deps = makeDeps({
      sendOnChain: async () => receipt([gmxLog('OrderCreated')]),
      getProvider: () => fakeChain({ batches: [[gmxLog('OrderFrozen', { reason: 'InsufficientFundsForFee' })]] }),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 30_000 }), { wrapper })
    const out = await run(result, GMX_CLOSE)
    await settle(out)
    expect(result.current.status).toBe('frozen')
    expect(result.current.terminal).toBe(true)
  })

  it('GMX protection rests at the venue instead of timing out as unknown', async () => {
    // A stop-loss that has not fired is an order doing its job, not a stalled one. The watch stops
    // at the acknowledgement, so the deadline can never turn a healthy stop into "we can't confirm".
    const deps = makeDeps({
      sendOnChain: async () => receipt([gmxLog('OrderCreated')]),
      getProvider: () => fakeChain({ batches: [] }),
      now: () => 10_000_000, // long past any deadline
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 1 }), { wrapper })
    const out = await run(result, {
      action: 'protect',
      venue: 'gmx',
      chainId: ARBITRUM,
      params: {
        market: MARKET,
        collateralToken: USDC,
        isLong: true,
        executionFee: 1_500_000_000_000_000n,
        stopLoss: { triggerPrice: 60_000n * 10n ** 30n, acceptablePrice: 59_000n * 10n ** 30n, sizeDeltaUsd: 1_000n * 10n ** 30n },
      },
      validate: { position: { markPrice: 63_000, isLong: true, liquidationPrice: 57_000 }, stopLoss: 60_000 },
    })
    await settle(out)
    expect(result.current.status).toBe('venue_pending')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Recovery
 * --------------------------------------------------------------------------------------------- */

describe('a timeout produces a recoverable state', () => {
  it('Gains: past the venue’s own timeout window the order is timed_out, carrying the PENDING-ORDER index', async () => {
    const deps = makeDeps({
      sendOnChain: async () => receipt([MARKET_ORDER_INITIATED(4)], 100),
      // No further events, and the head runs well past createdBlock + timeoutBlocks.
      getProvider: () => fakeChain({ batches: [[], []], headStart: 100, headStep: 60 }),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 30_000 }), { wrapper })
    const out = await run(result, { ...CLOSE, timeoutBlocks: 30 })
    await settle(out)

    expect(result.current.status).toBe('timed_out')
    expect(result.current.statusText).toBe('Gains did not execute this in time.')
    const ref = result.current.order.venueRef.pendingOrderIndex
    // The recovery builder accepts it UNWRAPPED — the brand survived the whole walk, so the control
    // cannot be aimed at a trade index by accident (the index trap).
    expect(gains.isPendingOrderIndex(ref)).toBe(true)
    expect(() => gains.buildCancelOrderAfterTimeoutCall({ chainId: ARBITRUM, pendingOrderIndex: ref })).not.toThrow()
  })

  it('Gains: never claims a timeout the venue has not published a window for', async () => {
    const deps = makeDeps({
      sendOnChain: async () => receipt([MARKET_ORDER_INITIATED(4)], 100),
      getProvider: () => fakeChain({ batches: [[], []], headStart: 100, headStep: 60 }),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 3_000 }), { wrapper })
    // No `timeoutBlocks` — offering recovery here would hand the member a call that reverts.
    const out = await run(result, CLOSE)
    await settle(out)
    expect(result.current.status).toBe('unknown')
  })

  it('Gains: a recovery executing is reported as done, not as a rejection', async () => {
    // CollateralReturnedAfterTimeout means opposite things to two orders; the tracked action decides.
    const deps = makeDeps({
      sendOnChain: async () => receipt([COLLATERAL_RETURNED(4)]),
      getProvider: () => fakeChain(),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 3_000 }), { wrapper })
    const out = await run(result, {
      action: 'recover',
      venue: 'gains',
      chainId: ARBITRUM,
      params: { pendingOrderIndex: gains.pendingOrderIndex(4) },
    })
    await settle(out)
    expect(result.current.status).toBe('executed')
    expect(result.current.statusText).toBe('Order cancelled.')
  })

  it('GMX: cancelling a frozen order reports the cancel as done, not as GMX refusing', async () => {
    const deps = makeDeps({
      sendOnChain: async () => receipt([gmxLog('OrderCancelled', { reason: 'UserInitiatedCancel' })]),
      getProvider: () => fakeChain(),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 3_000 }), { wrapper })
    const out = await run(result, { action: 'recover', venue: 'gmx', chainId: ARBITRUM, params: { key: ORDER_KEY } })
    await settle(out)
    expect(result.current.status).toBe('executed')
    expect(result.current.statusText).toBe('Order cancelled.')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Losing the thread
 * --------------------------------------------------------------------------------------------- */

describe('a lost thread is `unknown`, never success or failure', () => {
  it('gives up honestly after the watch deadline', async () => {
    const deps = makeDeps({
      sendOnChain: async () => receipt([MARKET_ORDER_INITIATED()]),
      getProvider: () => fakeChain({ batches: [] }),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 2_000 }), { wrapper })
    const out = await run(result, CLOSE)
    await settle(out)
    expect(result.current.status).toBe('unknown')
    expect(result.current.statusText).toMatch(/check on Gains/)
  })

  it('says so when there is no read connection to follow the order with', async () => {
    const deps = makeDeps({ sendOnChain: async () => receipt([]), getProvider: () => null })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    const out = await run(result, CLOSE)
    await settle(out)
    expect(result.current.status).toBe('unknown')
  })

  it('a failing poll is not an outcome — the watch survives it and still resolves', async () => {
    let poll = 0
    const provider = {
      getBlockNumber: async () => 100 + poll,
      getLogs: async () => {
        poll += 1
        if (poll === 1) throw new Error('endpoint down')
        return [MARKET_EXECUTED()]
      },
    }
    const deps = makeDeps({
      sendOnChain: async () => receipt([MARKET_ORDER_INITIATED()]),
      getProvider: () => provider,
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 30_000 }), { wrapper })
    const out = await run(result, CLOSE)
    await settle(out)
    expect(result.current.status).toBe('executed')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * The send seam, direct settlement, and abandonment
 * --------------------------------------------------------------------------------------------- */

describe('the send rail drives the pre-submission states', () => {
  it('reports switching, then the wallet prompt, then sent — in that order', async () => {
    const seen = []
    const deps = makeDeps({
      sendOnChain: async (_chainId, _calls, { onState }) => {
        onState({ step: 'switching' })
        onState({ step: 'sending' })
        return receipt([])
      },
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 0 }), { wrapper })
    const out = await run(result, CLOSE)
    seen.push(...out.order.path)
    expect(seen).toEqual(['idle', 'validating', 'switching', 'signing', 'submitted'])
  })

  it('a Gains protection update is confirmed by re-reading the venue, never by inclusion', async () => {
    // updateSl/updateTp change the diamond's own state in the member's transaction and emit no
    // order event, so there is nothing to watch — and inclusion still must not claim success.
    const getProvider = vi.fn(() => fakeChain())
    const deps = makeDeps({ sendOnChain: async () => receipt([]), getProvider })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    const out = await run(result, {
      action: 'protect',
      venue: 'gains',
      chainId: ARBITRUM,
      params: { tradeIndex: gains.tradeIndex(7), sl: 60_000 },
      validate: { position: { markPrice: 63_000, isLong: true, liquidationPrice: 57_000 }, stopLoss: 60_000 },
    })
    await settle(out)
    expect(result.current.status).toBe('submitted')
    expect(getProvider).not.toHaveBeenCalled()

    // Only the venue's STORED values move it on (US2 acceptance 3).
    await act(async () => result.current.confirmFromVenue({ sl: 600_000_000_000_000n }))
    expect(result.current.status).toBe('executed')
    expect(result.current.statusText).toBe('Protection updated.')
    expect(result.current.order.execution.sl).toBe(600_000_000_000_000n)
  })

  it('refuses to mint an execution for a keeper-settled order from a re-read', async () => {
    const deps = makeDeps({ sendOnChain: async () => receipt([MARKET_ORDER_INITIATED()]), getProvider: () => fakeChain() })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 0 }), { wrapper })
    const out = await run(result, CLOSE)
    await settle(out)
    const before = result.current.status
    await act(async () => result.current.confirmFromVenue({ anything: true }))
    expect(result.current.status).toBe(before)
    expect(result.current.status).not.toBe('executed')
  })
})

describe('abandonment', () => {
  it('reset clears the machine back to idle', async () => {
    const deps = makeDeps({ sendOnChain: async () => receipt([MARKET_ORDER_INITIATED()]), sleep: parked })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 30_000 }), { wrapper })
    await run(result, CLOSE)
    expect(result.current.status).toBe('venue_pending')
    await act(async () => result.current.reset())
    expect(result.current.status).toBe('idle')
    expect(result.current.refusal).toBeNull()
  })

  it('an account change clears an in-flight confirmation immediately', async () => {
    const other = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
    const deps = makeDeps({ sendOnChain: async () => receipt([MARKET_ORDER_INITIATED()]), sleep: parked })
    const { result, rerender } = renderHook(() => usePerpsTrade({ deps, watchMs: 30_000 }), { wrapper })
    await run(result, CLOSE)
    expect(result.current.status).toBe('venue_pending')

    wallet.current = { ...wallet.current, address: other }
    await act(async () => rerender())
    expect(result.current.status).toBe('idle')
  })

  it('a run abandoned mid-flight never publishes over the newer state', async () => {
    let release
    const deps = makeDeps({
      sendOnChain: () =>
        new Promise((resolve) => {
          release = () => resolve(receipt([MARKET_EXECUTED()]))
        }),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 0 }), { wrapper })
    let pending
    await act(async () => {
      pending = result.current.submit(CLOSE)
    })
    await act(async () => result.current.reset())
    await act(async () => {
      release()
      await pending
    })
    expect(result.current.status).toBe('idle')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Nothing fabricated
 * --------------------------------------------------------------------------------------------- */

describe('honest numbers', () => {
  it('carries no execution payload until the venue has executed', async () => {
    const deps = makeDeps({ sendOnChain: async () => receipt([MARKET_ORDER_INITIATED()]), getProvider: () => fakeChain() })
    const { result } = renderHook(() => usePerpsTrade({ deps, watchMs: 0 }), { wrapper })
    const out = await run(result, CLOSE)
    expect(out.order.execution).toBeNull()
    expect(out.order.state).toBe('venue_pending')
  })

  it('never attaches a FairWins fee receiver the sheet did not disclose', () => {
    // fee-rails.md §1: the fee line appears before any signature, so attaching the fee is the
    // disclosing surface's decision. This hook must have no default for it.
    expect(src).not.toMatch(/perpsUiFeeReceiver|PERPS_UI_FEE_RECEIVER/)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * REPORTING (T070 / FR-023) — the producer half of the activity feed
 *
 * `perpsActivityBuffer` had a CONSUMER (`data/notifications/sources/perpsSource.js` drains it every
 * cycle) and NO PRODUCER: nothing in the app ever queued a record, so the whole action half of the
 * feed silently reported nothing while every one of its own tests passed. That is the same defect
 * class as the phase-4 `markPrice` one — a well-tested consumer of a value nobody emits — and the
 * only thing that catches it is an assertion that the two ends are connected.
 *
 * The producer is HERE because this is the one write path: an action that ran cannot fail to report
 * itself, and no surface can report an action that did not run.
 * --------------------------------------------------------------------------------------------- */

describe('every action reports itself to the activity buffer', () => {
  const reporter = () => vi.fn(() => null)

  it('queues the machine’s state — a submission as SENT, and never as done', async () => {
    const recordAction = reporter()
    const deps = makeDeps({ recordAction, sleep: parked })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    await run(result, CLOSE)

    expect(recordAction).toHaveBeenCalled()
    const [account, order] = recordAction.mock.calls.at(-1)
    expect(account).toBe(MEMBER)
    expect(order.venue).toBe('gains')
    expect(order.action).toBe('close')
    // Inclusion is not execution: the state queued after a successful receipt is the machine's
    // pre-execution one, whatever it is called — asked of the machine, never spelled here.
    expect(order.state).toBe(result.current.status)
    expect(result.current.terminal).toBe(false)
    expect(order.txHash).toBe(TX)
  })

  it('queues the TERMINAL state too, once the venue has spoken', async () => {
    const recordAction = reporter()
    const deps = makeDeps({
      recordAction,
      sendOnChain: vi.fn(async () => receipt([MARKET_ORDER_INITIATED(4), MARKET_EXECUTED(4, 7)])),
    })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    await run(result, CLOSE)

    const states = recordAction.mock.calls.map(([, order]) => order.state)
    // The terminal state the machine reached is the LAST thing reported — that is the line a member
    // actually wants in their feed, and it arrives after `submit` already resolved.
    expect(states.at(-1)).toBe(result.current.status)
    expect(result.current.terminal).toBe(true)
  })

  it('reports a RECOVERY, which is the action a member most needs a record of', async () => {
    const recordAction = reporter()
    const deps = makeDeps({ recordAction, sleep: parked, ...forbiddenGates() })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    await run(result, {
      action: 'recover',
      venue: 'gains',
      chainId: ARBITRUM,
      params: { pendingOrderIndex: gains.pendingOrderIndex(4) },
    })
    expect(recordAction.mock.calls.at(-1)[1].action).toBe('cancel')
  })

  it('files the record under the account that ACTED, never a bare truthy check', async () => {
    const recordAction = reporter()
    const deps = makeDeps({ recordAction, sleep: parked })
    renderHook(() => usePerpsTrade({ deps }), { wrapper })
    // Idle mount with a connected wallet: the machine has a state, and it is not a reportable one,
    // so the buffer's own filter drops it. What must NOT happen is a call with no account.
    for (const [account] of recordAction.mock.calls) expect(account).toBe(MEMBER)
  })

  it('a reporter that throws never breaks the action — an exit outranks its own bookkeeping', async () => {
    const recordAction = vi.fn(() => {
      throw new Error('storage full')
    })
    const deps = makeDeps({ recordAction, sleep: parked })
    const { result } = renderHook(() => usePerpsTrade({ deps }), { wrapper })
    // The real `recordPerpsOrder` swallows its own failures; this asserts the hook does not depend
    // on that, because a full localStorage must never be able to fail a close.
    await expect(run(result, CLOSE)).resolves.not.toThrow?.()
    expect(deps.sendOnChain).toHaveBeenCalled()
  })
})
