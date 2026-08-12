/**
 * usePerpsOrders (spec 083, T031, US4) — pending + stuck orders per venue.
 *
 * The properties under test are the ones a stuck order depends on: the state comes from the venue
 * (never from a receipt), the recovery control appears exactly when the timeout is PROVEN, the
 * pending-order index never degrades into a raw number, an unreadable venue is named rather than
 * rendered as "nothing stuck", and NOTHING gates any of it.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Interface, ZeroAddress, getAddress, zeroPadValue } from 'ethers'

import { GAINS_DIAMOND_ABI, GAINS_PENDING_ORDER_TYPE } from '../../abis/perps/gainsDiamond'
import {
  GMX_EVENT_EMITTER_ABI,
  GMX_EXCHANGE_ROUTER_ABI,
  GMX_ORDER_TYPE,
} from '../../abis/perps/gmxExchangeRouter'
import { GMX_ADDRESSES_BY_CHAIN } from '../../config/perps'
import {
  GMX_ORDER_LOOKBACK_BLOCKS,
  ORDER_SOURCE_STATUS,
  buildRecoveryCall,
  usePerpsOrders,
} from '../../hooks/usePerpsOrders'
import { GainsIndexSpaceError, isPendingOrderIndex, tradeIndex } from '../../lib/perps/venues/gains'

const ARBITRUM = 42161
const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
const OTHER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const KEY = `0x${'ab'.repeat(32)}`
const OTHER_KEY = `0x${'cd'.repeat(32)}`

const diamond = new Interface(GAINS_DIAMOND_ABI)
const exchangeRouter = new Interface(GMX_EXCHANGE_ROUTER_ABI)
const emitter = new Interface(GMX_EVENT_EMITTER_ABI)

const HEAD = 1_400

const src = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/* --------------------------------------------------------------------------------------------- *
 * Fixtures
 * --------------------------------------------------------------------------------------------- */

/**
 * The gateway's `PerpPendingOrder` (services/relay-gateway/src/perps/normalize.js). Note there is
 * NO bare `index` field — the wire carries `venueRef.pendingOrderIndex` and `venueRef.tradeIndex`
 * by name, because JSON has no brands and the two index spaces must not be guessable from one
 * another. `timeoutBlocks` is absent here on purpose so the default fixture exercises the on-chain
 * fallback read; `gainsRowWithTimeout` covers the venue-reported path.
 */
const gainsRow = (over = {}) => ({
  id: `gains:${ARBITRUM}:pending:4`,
  venue: 'gains',
  chainId: ARBITRUM,
  symbol: 'BTC/USD',
  direction: 'long',
  orderType: GAINS_PENDING_ORDER_TYPE.MARKET_OPEN,
  orderTypeName: 'MARKET_OPEN',
  createdBlock: 1_000,
  requestedSizeUsd: 1_000,
  venueRef: { venue: 'gains', chainId: ARBITRUM, pendingOrderIndex: 4, tradeIndex: null },
  ...over,
})

const gainsSources = (over = {}) => ({
  gains: { status: 'read', chains: [ARBITRUM], pendingOrderChains: [ARBITRUM], ...over },
})

const emptyBag = () => ({ items: [], arrayItems: [] })

/** An `EventLog2` encoded the way GMX's EventEmitter emits it, so the decoder runs over real bytes. */
function gmxLog({ name, key = KEY, account = MEMBER, reason = null, orderType = null, blockNumber = 1_200, index = 0 }) {
  const eventData = {
    addressItems: emptyBag(),
    uintItems: {
      items: orderType == null ? [] : [{ key: 'orderType', value: orderType }],
      arrayItems: [],
    },
    intItems: emptyBag(),
    boolItems: emptyBag(),
    bytes32Items: emptyBag(),
    bytesItems: emptyBag(),
    stringItems: {
      items: reason == null ? [] : [{ key: 'reason', value: reason }],
      arrayItems: [],
    },
  }
  const encoded = emitter.encodeEventLog(emitter.getEvent('EventLog2'), [
    ZeroAddress,
    name,
    name,
    key,
    zeroPadValue(getAddress(account).toLowerCase(), 32),
    eventData,
  ])
  return {
    address: GMX_ADDRESSES_BY_CHAIN[ARBITRUM].eventEmitter,
    topics: encoded.topics,
    data: encoded.data,
    blockNumber,
    index,
    transactionHash: `0x${'11'.repeat(32)}`,
  }
}

const deps = (over = {}) => ({
  fetchPositions: vi.fn(async () => ({
    positions: [],
    sources: gainsSources(),
    pendingOrders: [gainsRow()],
  })),
  getProvider: () => ({
    getBlockNumber: async () => HEAD,
    getLogs: async () => [],
  }),
  makeContract: () => ({ getMarketOrdersTimeoutBlocks: async () => 200n }),
  ...over,
})

const gmxProvider = (logs) => ({ getBlockNumber: async () => HEAD, getLogs: async () => logs })

const render = (over = {}, account = MEMBER) =>
  renderHook(() => usePerpsOrders(account, { deps: deps(over) }))

/* --------------------------------------------------------------------------------------------- *
 * Gains — the timeout is proven, never assumed
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsOrders — Gains pending orders', () => {
  it('lists a market order past createdBlock + timeoutBlocks as timed_out, with the recovery control', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const [order] = result.current.orders
    expect(order.venue).toBe('gains')
    // The venue's state, out of the machine — not a string this hook invented.
    expect(order.state).toBe('timed_out')
    expect(order.statusText).toBe('Gains did not execute this in time.')
    expect(order.recoverable).toBe(true)
    expect(result.current.recoverableOrders).toHaveLength(1)
    expect(order.recovery.action).toBe('cancelOrderAfterTimeout')
    expect(order.orderTypeName).toBe('MARKET_OPEN')
    expect(order.returnsCollateral).toBe(true)
    expect(order.timing).toMatchObject({ createdBlock: 1_000, currentBlock: HEAD, timeoutBlocks: 200, readable: true })
    expect(order.timing.blocksRemaining).toBe(0)
  })

  it('keeps the index BRANDED all the way to the calldata — the recovery cannot aim at a trade', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.recoverableOrders).toHaveLength(1))

    const { recovery } = result.current.recoverableOrders[0]
    expect(isPendingOrderIndex(recovery.pendingOrderIndex)).toBe(true)

    const call = buildRecoveryCall(recovery)
    expect(call.target).toBe('0xFF162c694eAA571f685030649814282eA457f169')
    expect(call.data).toBe(diamond.encodeFunctionData('cancelOrderAfterTimeout', [4]))
    expect(call.value).toBe(0n)
  })

  it('is still PENDING inside the timeout window, and says how far off recovery is', async () => {
    const { result } = render({
      getProvider: () => ({ getBlockNumber: async () => 1_100, getLogs: async () => [] }),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const [order] = result.current.orders
    expect(order.state).toBe('venue_pending')
    expect(order.recoverable).toBe(false)
    expect(order.recovery).toBeNull()
    expect(order.timing.blocksRemaining).toBe(100)
    expect(result.current.recoverableOrders).toEqual([])
  })

  it('renders "—" rather than a countdown when the timeout could not be read', async () => {
    // An unreadable timeout leaves the order pending and says the timing is unknown. It must not
    // invent a window, and must not claim a recovery that would revert WaitTimeout().
    const { result } = render({
      makeContract: () => ({
        getMarketOrdersTimeoutBlocks: async () => {
          throw new Error('execution reverted')
        },
      }),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const [order] = result.current.orders
    expect(order.timing.timeoutBlocks).toBeNull()
    expect(order.timing.blocksRemaining).toBeNull()
    expect(order.timing.readable).toBe(false)
    expect(order.state).toBe('venue_pending')
    expect(order.recoverable).toBe(false)
  })

  it('names an order type it cannot resolve rather than guessing at it', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => ({ pendingOrders: [gainsRow({ orderType: 99, orderTypeName: null })], sources: gainsSources() })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const [order] = result.current.orders
    expect(order.orderTypeName).toBeNull()
    expect(order.returnsCollateral).toBe(false)
    // The state is still the venue's, and the control is still offered — a type we cannot name is
    // not a reason to withhold a recovery.
    expect(order.recoverable).toBe(true)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Gains — absence is only absence when we actually looked
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsOrders — an absent read is never an empty list', () => {
  it('treats a payload with NO pendingOrders key as unreadable, not as "none"', async () => {
    // The sibling gateway task lands separately; until it does, this must not report zero stuck
    // orders, which is a fabricated fact.
    const { result } = render({
      fetchPositions: vi.fn(async () => ({ positions: [], sources: gainsSources() })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current.orders).toEqual([])
    expect(result.current.sources.gains.status).toBe(ORDER_SOURCE_STATUS.UNREADABLE)
    expect(result.current.sources.gains.count).toBeNull()
    expect(result.current.unreadableVenues).toContain('gains')
  })

  it('treats a venue whose pending-order read reached NO chain as unreadable', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => ({
        pendingOrders: [],
        sources: gainsSources({ status: 'degraded', chains: [], pendingOrderChains: [] }),
      })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sources.gains.status).toBe(ORDER_SOURCE_STATUS.UNREADABLE)
  })

  it('still lists stuck orders when the POSITIONS facet is degraded — the two are independent', async () => {
    // The gateway resolves positions and pending orders separately precisely so a positions outage
    // still serves the recovery handles. Reading `sources.gains.status` as the gate here would
    // throw away orders it went out of its way to send.
    const { result } = render({
      fetchPositions: vi.fn(async () => ({
        positions: [],
        pendingOrders: [gainsRow()],
        sources: gainsSources({ status: 'degraded', chains: [] }),
      })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.recoverableOrders).toHaveLength(1)
    expect(result.current.sources.gains.status).toBe(ORDER_SOURCE_STATUS.READ)
  })

  it('carries which chains the pending-order read actually covered, so a partial read can say so', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => ({
        pendingOrders: [gainsRow()],
        sources: gainsSources({ pendingOrderChains: [ARBITRUM] }),
      })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Gains runs on three chains; one covered chain is a partial read and the surface must be able
    // to name it rather than presenting the list as complete.
    expect(result.current.sources.gains.chains).toEqual([ARBITRUM])
  })

  it('uses the venue-reported timeout without a second read, and still proves the timeout', async () => {
    const makeContract = vi.fn()
    const { result } = render({
      makeContract,
      fetchPositions: vi.fn(async () => ({
        pendingOrders: [gainsRow({ timeoutBlocks: 200 })],
        sources: gainsSources(),
      })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.orders[0].state).toBe('timed_out')
    expect(result.current.orders[0].timing.timeoutBlocks).toBe(200)
    expect(makeContract).not.toHaveBeenCalled()
  })

  it('reports a read with zero orders as a READ — proven absence is allowed to be empty', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => ({ pendingOrders: [], sources: gainsSources() })),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sources.gains.status).toBe(ORDER_SOURCE_STATUS.READ)
    expect(result.current.sources.gains.count).toBe(0)
    expect(result.current.unreadableVenues).not.toContain('gains')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * GMX — frozen orders folded from the venue's own events
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsOrders — GMX frozen orders', () => {
  const frozenLogs = [
    gmxLog({ name: 'OrderCreated', orderType: GMX_ORDER_TYPE.STOP_LOSS_DECREASE, blockNumber: 1_100 }),
    gmxLog({ name: 'OrderFrozen', reason: 'OrderNotFulfillableAtAcceptablePrice', blockNumber: 1_150 }),
  ]

  it('presents a frozen order with GMX’s own reason and a cancel control', async () => {
    const { result } = render({ getProvider: () => gmxProvider(frozenLogs) })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const order = result.current.orders.find((o) => o.venue === 'gmx')
    expect(order.state).toBe('frozen')
    expect(order.statusText).toBe('Needs your attention.')
    // Verbatim — translating GMX's error name would invent a cause we have not confirmed.
    expect(order.reason.text).toBe('OrderNotFulfillableAtAcceptablePrice')
    expect(order.reason.source).toBe('gmx')
    expect(order.orderTypeName).toBe('STOP_LOSS_DECREASE')
    expect(order.recoverable).toBe(true)
    expect(buildRecoveryCall(order.recovery).data).toBe(exchangeRouter.encodeFunctionData('cancelOrder', [KEY]))
  })

  it('drops orders the venue RESOLVED, and keeps one it only acknowledged', async () => {
    const { result } = render({
      getProvider: () =>
        gmxProvider([
          gmxLog({ name: 'OrderCreated', key: KEY, blockNumber: 1_100 }),
          gmxLog({ name: 'OrderExecuted', key: KEY, blockNumber: 1_110 }),
          gmxLog({ name: 'OrderCreated', key: OTHER_KEY, orderType: GMX_ORDER_TYPE.MARKET_DECREASE, blockNumber: 1_120 }),
        ]),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const gmxOrders = result.current.orders.filter((o) => o.venue === 'gmx')
    expect(gmxOrders).toHaveLength(1)
    expect(gmxOrders[0].id).toBe(`gmx:${ARBITRUM}:${OTHER_KEY}`)
    expect(gmxOrders[0].state).toBe('venue_pending')
    expect(gmxOrders[0].recoverable).toBe(false)
  })

  it('folds events in CHAIN order, not response order', async () => {
    const { result } = render({
      getProvider: () =>
        gmxProvider([
          gmxLog({ name: 'OrderFrozen', reason: 'Frozen', blockNumber: 1_150 }),
          gmxLog({ name: 'OrderCreated', blockNumber: 1_100 }),
        ]),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.orders.find((o) => o.venue === 'gmx').state).toBe('frozen')
  })

  it('ignores another account’s events even if the endpoint returns them', async () => {
    const { result } = render({
      getProvider: () =>
        gmxProvider([
          gmxLog({ name: 'OrderCreated', account: OTHER, blockNumber: 1_100 }),
          gmxLog({ name: 'OrderFrozen', account: OTHER, reason: 'Frozen', blockNumber: 1_150 }),
        ]),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // The signals are refused, so the fold never leaves `submitted` — which is not a venue state and
    // therefore not something we would offer a cancel for.
    const order = result.current.orders.find((o) => o.venue === 'gmx')
    expect(order.state).toBe('submitted')
    expect(order.recoverable).toBe(false)
  })

  it('discloses the log window instead of presenting it as the whole history', async () => {
    const { result } = render({ getProvider: () => gmxProvider(frozenLogs) })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const source = result.current.sources.gmx
    expect(source.status).toBe(ORDER_SOURCE_STATUS.READ)
    expect(source.windowed).toBe(true)
    expect(source.fromBlock).toBe(HEAD - GMX_ORDER_LOOKBACK_BLOCKS > 0 ? HEAD - GMX_ORDER_LOOKBACK_BLOCKS : 0)
    expect(source.toBlock).toBe(HEAD)
    expect(typeof source.detail).toBe('string')
  })

  it('reports GMX unreadable — never empty — when the endpoint refuses the log range', async () => {
    const { result } = render({
      getProvider: () => ({
        getBlockNumber: async () => HEAD,
        getLogs: async () => {
          throw new Error('query returned more than 10000 results')
        },
      }),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sources.gmx.status).toBe(ORDER_SOURCE_STATUS.UNREADABLE)
    expect(result.current.sources.gmx.detail).toMatch(/could not be read/)
    expect(result.current.unreadableVenues).toContain('gmx')
  })

  it('reports GMX not-deployed where the venue does not exist, which is a different fact', async () => {
    const { result } = render({ addressesFor: () => null })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sources.gmx.status).toBe(ORDER_SOURCE_STATUS.NOT_DEPLOYED)
    expect(result.current.unreadableVenues).not.toContain('gmx')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Per-venue isolation and account hygiene
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsOrders — isolation and account hygiene', () => {
  it('a dead gateway never hides the GMX order the member is stuck in', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => {
        throw Object.assign(new Error('perps gateway unreachable'), { code: 'network_error' })
      }),
      getProvider: () =>
        gmxProvider([
          gmxLog({ name: 'OrderCreated', blockNumber: 1_100 }),
          gmxLog({ name: 'OrderFrozen', reason: 'Frozen', blockNumber: 1_150 }),
        ]),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.recoverableOrders).toHaveLength(1)
    expect(result.current.recoverableOrders[0].venue).toBe('gmx')
    expect(result.current.unreadableVenues).toEqual(['gains'])
  })

  it('a dead Arbitrum endpoint never hides the Gains order past its timeout', async () => {
    const { result } = render({
      getProvider: (chainId) => {
        if (chainId !== ARBITRUM) return null
        return {
          getBlockNumber: async () => HEAD,
          getLogs: async () => {
            throw new Error('endpoint down')
          },
        }
      },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.recoverableOrders).toHaveLength(1)
    expect(result.current.recoverableOrders[0].venue).toBe('gains')
    expect(result.current.unreadableVenues).toEqual(['gmx'])
  })

  it('is unavailable — never fake-empty — when no venue could be read at all', async () => {
    const { result } = render({
      fetchPositions: vi.fn(async () => {
        throw new Error('down')
      }),
      getProvider: () => null,
    })
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.orders).toEqual([])
    expect(result.current.unreadableVenues).toEqual(['gains', 'gmx'])
  })

  it('is idle with no read when disconnected', () => {
    const fetchPositions = vi.fn()
    const { result } = renderHook(() => usePerpsOrders(null, { deps: deps({ fetchPositions }) }))
    expect(result.current.status).toBe('idle')
    expect(result.current.orders).toEqual([])
    expect(fetchPositions).not.toHaveBeenCalled()
  })

  it('hard-resets synchronously on account change — no recovery control aimed at another account', async () => {
    let resolveOther
    const fetchPositions = vi.fn((addr) => {
      if (addr === MEMBER) return Promise.resolve({ pendingOrders: [gainsRow()], sources: gainsSources() })
      return new Promise((r) => {
        resolveOther = () => r({ pendingOrders: [], sources: gainsSources() })
      })
    })
    const { result, rerender } = renderHook(
      ({ account }) => usePerpsOrders(account, { deps: deps({ fetchPositions }) }),
      { initialProps: { account: MEMBER } },
    )
    await waitFor(() => expect(result.current.orders).toHaveLength(1))

    rerender({ account: OTHER })
    // Gone the moment the account changes — before the other account's read resolves.
    expect(result.current.orders).toEqual([])
    expect(result.current.recoverableOrders).toEqual([])
    // The venue loaders run on a microtask, so the second read starts a tick after the reset — which
    // is exactly why the reset has to be synchronous rather than waiting for it.
    await waitFor(() => expect(fetchPositions).toHaveBeenCalledWith(OTHER))
    resolveOther()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.orders).toEqual([])
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Nothing gates an exit (rule 3 / SC-004)
 * --------------------------------------------------------------------------------------------- */

describe('usePerpsOrders — the recovery list is never gated', () => {
  const source = () => src('../../hooks/usePerpsOrders.js')

  it('does not import screening, the attestation, or the management kill switch', () => {
    expect(source()).not.toMatch(/from\s+['"].*perps\/attestation['"]/)
    expect(source()).not.toMatch(/hasAttested|attestationState|PERPS_ATTESTATION/)
    expect(source()).not.toMatch(/perpsManageFeatureEnabled|VITE_PERPS_MANAGE_ENABLED/)
    expect(source()).not.toMatch(/useAddressScreening|screenAddress|sanction/i)
  })

  it('does not consult whether the venue would accept an OPEN', () => {
    // `canOpen` / `openBlockedNote` answer a question about entering. Reading either here would make
    // a venue's close-only or paused state silently gate a member's exit.
    expect(source()).not.toMatch(/\bcanOpen\b|openBlockedNote|perpsManageEnabled/)
    expect(source()).not.toMatch(/from\s+['"].*perps\/venueStatus['"]/)
  })

  it('returns recoverable orders with the management feature flag off (its default)', async () => {
    // The flag is unset in this environment — the surface it hides is the ENTRY surface. A member
    // holding a stuck order must still be handed the control that returns their collateral.
    expect(import.meta.env.VITE_PERPS_MANAGE_ENABLED).toBeFalsy()
    const { result } = render({
      getProvider: () =>
        gmxProvider([
          gmxLog({ name: 'OrderCreated', blockNumber: 1_100 }),
          gmxLog({ name: 'OrderFrozen', reason: 'Frozen', blockNumber: 1_150 }),
        ]),
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // One from each venue, both offered with no attestation stored and nothing screened.
    expect(result.current.recoverableOrders.map((o) => o.venue).sort()).toEqual(['gains', 'gmx'])
  })
})

/* --------------------------------------------------------------------------------------------- *
 * The recovery builder
 * --------------------------------------------------------------------------------------------- */

describe('buildRecoveryCall', () => {
  it('refuses a raw number and a trade index — a recovery may only be aimed by NAME', () => {
    for (const index of [4, '4', 4n, null, tradeIndex(4)]) {
      expect(() =>
        buildRecoveryCall({ action: 'cancelOrderAfterTimeout', chainId: ARBITRUM, pendingOrderIndex: index }),
      ).toThrow(GainsIndexSpaceError)
    }
  })

  it('refuses a descriptor it does not recognise rather than building something', () => {
    expect(() => buildRecoveryCall(null)).toThrow(TypeError)
    expect(() => buildRecoveryCall({ action: 'closeEverything' })).toThrow(TypeError)
  })
})
