/**
 * PerpsPendingOrders (spec 083, T035, US4) — the stuck-order surface.
 *
 * The properties under test are the ones a member's collateral depends on:
 *
 *   - the recovery control is OFFERED BY NAME whenever the venue proved a timeout, and is offered
 *     under gates that would refuse an open (US4 acceptance 3 — exits are never gated);
 *   - the call it builds is `cancelOrderAfterTimeout` against the PENDING-ORDER index, and a
 *     descriptor carrying the other index space is REFUSED rather than aimed at a different object;
 *   - inclusion is never execution — a mined recovery reads "Sent to Gains.", never "cancelled";
 *   - a GMX frozen order renders as needing attention with the venue's own reason, verbatim;
 *   - nothing the venue did not report is rendered as a number, and the surface self-hides when it
 *     has nothing to say — but NEVER when a venue was unreadable, because an empty list would then
 *     be a claim we cannot support.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Interface } from 'ethers'

import PerpsPendingOrders from '../../components/perps/PerpsPendingOrders'
import { recoveryDescriptor } from '../../components/perps/pendingOrderRecovery'
import { WalletContext } from '../../contexts/WalletContext.js'
import { usePerpsOrders } from '../../hooks/usePerpsOrders'
import { GAINS_DIAMOND_ABI, GAINS_PENDING_ORDER_TYPE } from '../../abis/perps/gainsDiamond'
import { GMX_EXCHANGE_ROUTER_ABI, GMX_ORDER_TYPE } from '../../abis/perps/gmxExchangeRouter'
import { GMX_ADDRESSES_BY_CHAIN } from '../../config/perps'
import { pendingOrderIndex, tradeIndex } from '../../lib/perps/venues/gains'

const ARBITRUM = 42161
const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
const KEY = `0x${'ab'.repeat(32)}`
const TX = `0x${'11'.repeat(32)}`
const HEAD = 1_400

const diamond = new Interface(GAINS_DIAMOND_ABI)
const exchangeRouter = new Interface(GMX_EXCHANGE_ROUTER_ABI)

const src = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/* --------------------------------------------------------------------------------------------- *
 * Fixtures — the shape `usePerpsOrders#finalizeOrder` publishes
 * --------------------------------------------------------------------------------------------- */

/** A Gains market order past its timeout: recoverable, with a BRANDED pending-order index. */
const gainsStuck = (over = {}) => ({
  id: `gains:${ARBITRUM}:pending:4`,
  venue: 'gains',
  chainId: ARBITRUM,
  symbol: 'BTC/USD',
  direction: 'long',
  state: 'timed_out',
  orderState: { state: 'timed_out', venue: 'gains', chainId: ARBITRUM, action: 'open' },
  pending: false,
  statusText: 'Gains did not execute this in time.',
  reason: { code: null, text: 'Gains did not execute this order within its timeout window.', source: 'gains' },
  orderType: GAINS_PENDING_ORDER_TYPE.MARKET_OPEN,
  orderTypeName: 'MARKET_OPEN',
  returnsCollateral: true,
  timing: { createdBlock: 1_000, currentBlock: HEAD, timeoutBlocks: 200, readable: true, blocksRemaining: 0 },
  recoverable: true,
  recovery: Object.freeze({
    venue: 'gains',
    chainId: ARBITRUM,
    action: 'cancelOrderAfterTimeout',
    pendingOrderIndex: pendingOrderIndex(4),
    label: 'Recover your collateral',
  }),
  venueRef: { pendingOrderIndex: pendingOrderIndex(4) },
  txHash: null,
  raw: { requestedSizeUsd: 1_000, requestedLeverage: 10, requestedPrice: 63_000 },
  ...over,
})

/** A GMX trigger order the venue froze, carrying GMX's own error name as the reason. */
const gmxFrozen = (over = {}) => ({
  id: `gmx:${ARBITRUM}:${KEY}`,
  venue: 'gmx',
  chainId: ARBITRUM,
  symbol: null,
  direction: null,
  state: 'frozen',
  orderState: { state: 'frozen', venue: 'gmx', chainId: ARBITRUM, action: 'protect' },
  pending: false,
  statusText: 'Needs your attention.',
  reason: { code: null, text: 'OrderNotFulfillableAtAcceptablePrice', source: 'gmx' },
  orderType: GMX_ORDER_TYPE.STOP_LOSS_DECREASE,
  orderTypeName: 'STOP_LOSS_DECREASE',
  returnsCollateral: true,
  timing: { createdBlock: null, currentBlock: null, timeoutBlocks: null, readable: false, blocksRemaining: null },
  recoverable: true,
  recovery: Object.freeze({
    venue: 'gmx',
    chainId: ARBITRUM,
    action: 'cancelOrder',
    orderKey: KEY,
    label: 'Cancel this order',
  }),
  venueRef: { orderKey: KEY },
  txHash: null,
  raw: { key: KEY, events: [] },
  ...over,
})

/* --------------------------------------------------------------------------------------------- *
 * Harness
 * --------------------------------------------------------------------------------------------- */

let sent

/**
 * The write rail, stubbed. `sleep` never resolves on purpose: the venue watcher runs in the
 * background after a send and would otherwise poll for the length of the test run. Nothing under
 * test depends on the watch — a terminal state can only come from a venue event, which is the
 * point of the "inclusion is never execution" case below.
 */
function tradeDeps(over = {}) {
  return {
    sendOnChain: vi.fn(async (chainId, calls) => {
      sent.push({ chainId, calls })
      return { receipts: [{ status: 1, hash: TX, logs: [] }], txHash: TX, blockNumber: HEAD }
    }),
    getProvider: () => ({ getBlockNumber: async () => HEAD, getLogs: async () => [] }),
    sleep: () => new Promise(() => {}),
    ...over,
  }
}

function renderList(props = {}, { wallet = {}, deps } = {}) {
  return render(
    <WalletContext.Provider
      value={{ address: MEMBER, isConnected: true, chainId: ARBITRUM, loginMethod: 'injected', ...wallet }}
    >
      <PerpsPendingOrders status="ready" orders={[]} unreadableVenues={[]} sources={{}} deps={deps ?? tradeDeps()} {...props} />
    </WalletContext.Provider>,
  )
}

beforeEach(() => {
  sent = []
})

/* --------------------------------------------------------------------------------------------- *
 * Self-hiding
 * --------------------------------------------------------------------------------------------- */

describe('PerpsPendingOrders — when it renders at all', () => {
  it('renders nothing when there is nothing waiting', () => {
    const { container } = renderList({ status: 'ready', orders: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while disconnected or still loading with nothing yet', () => {
    expect(renderList({ status: 'idle' }).container).toBeEmptyDOMElement()
    expect(renderList({ status: 'loading' }).container).toBeEmptyDOMElement()
  })

  it('ALWAYS renders when a venue was unreadable — an empty list would be a claim we cannot make', () => {
    renderList({
      status: 'ready',
      orders: [],
      unreadableVenues: ['gains'],
      sources: { gains: { status: 'unreadable', detail: 'Gains Network could not be read just now.' } },
    })
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent(/Gains orders could not be read just now/)
    expect(notice).toHaveTextContent(/not proof that nothing is waiting/)
    // The venue's own detail is carried through rather than replaced by ours.
    expect(notice).toHaveTextContent('Gains Network could not be read just now.')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * US4 acceptance 1 — a Gains market order past its timeout
 * --------------------------------------------------------------------------------------------- */

describe('PerpsPendingOrders — a timed-out Gains order', () => {
  it('lists it with the venue’s state, what was requested, and the named recovery control', () => {
    renderList({ orders: [gainsStuck()] })

    expect(screen.getByRole('heading', { name: 'Orders waiting at the venue' })).toBeInTheDocument()
    expect(screen.getByText('BTC/USD')).toBeInTheDocument()
    expect(screen.getByText('Needs your attention')).toBeInTheDocument()
    // The machine's own line — not a status this component derived.
    expect(screen.getByText('Gains did not execute this in time.')).toBeInTheDocument()

    // Pre-execution values, and LABELLED as requested (rule 4): the venue never executed this, so
    // there is no position for these to be the state of.
    expect(screen.getByText('Requested size')).toBeInTheDocument()
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByText('10×')).toBeInTheDocument()
    // How long it has been waiting, in the only unit we can prove.
    expect(screen.getByText('400 blocks')).toBeInTheDocument()

    const button = screen.getByRole('button', { name: 'Recover your collateral' })
    expect(button).toBeEnabled()
    expect(screen.getByText('This returns your collateral to your wallet.')).toBeInTheDocument()
  })

  it('sends cancelOrderAfterTimeout against the PENDING-ORDER index', async () => {
    renderList({ orders: [gainsStuck()] })
    await userEvent.click(screen.getByRole('button', { name: 'Recover your collateral' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    const [{ chainId, calls }] = sent
    expect(chainId).toBe(ARBITRUM)
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe('0xFF162c694eAA571f685030649814282eA457f169')
    expect(calls[0].data).toBe(diamond.encodeFunctionData('cancelOrderAfterTimeout', [4]))
    expect(calls[0].value).toBe(0n)
  })

  it('REFUSES a descriptor carrying the other index space instead of acting on another object', async () => {
    // The failure this guards: a trade index and a pending-order index are both small integers, and
    // passing one where the other belongs does not revert — it cancels a DIFFERENT order. The
    // builder is the enforcement; this proves the component surfaces the refusal rather than
    // sending something, and that nothing here "helpfully" converts between the spaces.
    const tampered = gainsStuck({
      recovery: Object.freeze({
        venue: 'gains',
        chainId: ARBITRUM,
        action: 'cancelOrderAfterTimeout',
        pendingOrderIndex: tradeIndex(4),
        label: 'Recover your collateral',
      }),
    })
    renderList({ orders: [tampered] })
    await userEvent.click(screen.getByRole('button', { name: 'Recover your collateral' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be prepared/i)
    expect(sent).toHaveLength(0)
  })

  it('says how far off recovery still is, and offers no control until the venue proved the timeout', () => {
    renderList({
      orders: [
        gainsStuck({
          state: 'venue_pending',
          orderState: { state: 'venue_pending', venue: 'gains', chainId: ARBITRUM, action: 'open' },
          statusText: 'Gains is executing this.',
          reason: null,
          recoverable: false,
          recovery: null,
          timing: { createdBlock: 1_000, currentBlock: 1_100, timeoutBlocks: 200, readable: true, blocksRemaining: 100 },
        }),
      ],
    })

    expect(screen.getByText('Gains is executing this.')).toBeInTheDocument()
    expect(screen.getByText(/recover your collateral in about 100 more blocks/i)).toBeInTheDocument()
    // A control offered before the venue's own timeout would revert WaitTimeout().
    expect(screen.queryByRole('button', { name: 'Recover your collateral' })).not.toBeInTheDocument()
    expect(screen.queryByText('Needs your attention')).not.toBeInTheDocument()
  })

  it('never renders a dead control: a stuck order with no venue handle names the venue instead', () => {
    renderList({ orders: [gainsStuck({ recoverable: false, recovery: null })] })

    expect(screen.queryByRole('button', { name: /recover/i })).not.toBeInTheDocument()
    expect(screen.getByText(/did not report a reference for this order/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Gains in a new tab/i })).toHaveAttribute(
      'href',
      'https://gains.trade',
    )
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Rule 2 — inclusion is never execution
 * --------------------------------------------------------------------------------------------- */

describe('PerpsPendingOrders — inclusion is never execution', () => {
  it('reports a mined recovery as SENT, never as cancelled or recovered', async () => {
    renderList({ orders: [gainsStuck()] })
    await userEvent.click(screen.getByRole('button', { name: 'Recover your collateral' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    const progress = await screen.findByText('Sent to Gains.')
    // The state came out of the machine; the receipt did not buy any stronger claim than this.
    expect(progress).toHaveAttribute('data-state', 'submitted')
    expect(screen.queryByText(/order cancelled|collateral returned|recovered/i)).not.toBeInTheDocument()
  })
})

/* --------------------------------------------------------------------------------------------- *
 * US4 acceptance 3 — nothing gates an exit
 * --------------------------------------------------------------------------------------------- */

describe('PerpsPendingOrders — exits are never gated', () => {
  it('offers AND SENDS the recovery with gates that would refuse an open outright', async () => {
    // Both entry gates wired to their refusing answers. A recovery is a `cancel`, which
    // `usePerpsTrade` never routes through `runEntryGates` — the one line that can reach them sits
    // inside `if (isEntryAction(...))`. Screening and the attestation are therefore invisible here.
    const hasAttested = vi.fn(() => false)
    const screenAccount = vi.fn(async () => 'restricted')
    renderList({ orders: [gainsStuck()] }, { deps: tradeDeps({ hasAttested, screenAccount }) })

    const button = screen.getByRole('button', { name: 'Recover your collateral' })
    expect(button).toBeEnabled()
    await userEvent.click(button)

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(hasAttested).not.toHaveBeenCalled()
    expect(screenAccount).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not import screening, the attestation, or the feature flag AT ALL', () => {
    // The same defence `test/perps/safetyInvariants.test.js` applies to the lib modules: a module
    // that cannot reference a gate cannot apply one to an exit by accident. Both files this
    // surface's exit path is made of are covered — adding a third means adding it here.
    for (const path of [
      '../../components/perps/PerpsPendingOrders.jsx',
      '../../components/perps/pendingOrderRecovery.js',
    ]) {
      const source = src(path)
      expect(source, `${path} imports the attestation`).not.toMatch(/from\s+['"].*perps\/attestation['"]/)
      expect(source, path).not.toMatch(/hasAttested|attestationState|PERPS_ATTESTATION/)
      expect(source, `${path} reads the kill switch`).not.toMatch(
        /perpsManageFeatureEnabled|VITE_PERPS_MANAGE_ENABLED/,
      )
      expect(source, path).not.toMatch(/screenAccount|sanction|useSanctions|screeningStatus/i)
      expect(source, `${path} consults canOpen`).not.toMatch(/\bcanOpen\b|openBlockedNote/)
    }
  })
})

/* --------------------------------------------------------------------------------------------- *
 * US4 acceptance 2 — a GMX frozen order
 * --------------------------------------------------------------------------------------------- */

describe('PerpsPendingOrders — a frozen GMX order', () => {
  it('presents it as needing attention with GMX’s own reason, verbatim', () => {
    renderList({ orders: [gmxFrozen()] })

    expect(screen.getByText('Needs your attention')).toBeInTheDocument()
    expect(screen.getByText('Needs your attention.')).toBeInTheDocument()
    // Verbatim — translating a venue's error name would mean inventing a cause we cannot confirm.
    expect(screen.getByText('OrderNotFulfillableAtAcceptablePrice')).toBeInTheDocument()
    expect(screen.getByText('GMX said:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel this order' })).toBeEnabled()
  })

  it('cancels by order key, returning the collateral to the member', async () => {
    renderList({ orders: [gmxFrozen()] })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel this order' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    const [{ calls }] = sent
    expect(calls[0].target).toBe(GMX_ADDRESSES_BY_CHAIN[ARBITRUM].exchangeRouter)
    expect(calls[0].data).toBe(exchangeRouter.encodeFunctionData('cancelOrder', [KEY]))
  })

  it('discloses that the GMX list is windowed rather than presenting it as the whole truth', () => {
    renderList({
      orders: [gmxFrozen()],
      sources: {
        gmx: {
          status: 'read',
          windowed: true,
          detail: 'GMX orders are read from recent chain history, so an order frozen further back is not listed here.',
        },
      },
    })
    expect(screen.getByText(/read from recent chain history/i)).toBeInTheDocument()
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Rule 4 — honest numbers
 * --------------------------------------------------------------------------------------------- */

describe('PerpsPendingOrders — honest numbers', () => {
  it('renders — for everything the venue did not report, and never a 0', () => {
    renderList({ orders: [gmxFrozen()] })

    // symbol, requested size, requested leverage, requested price, waiting — five values GMX's
    // order events genuinely do not carry, and not one of them may become a zero.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5)
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
    expect(screen.queryByText('0 blocks')).not.toBeInTheDocument()
  })

  it('names an order type the venue reported, in words a member can read', () => {
    renderList({ orders: [gainsStuck({ orderTypeName: 'MARKET_PARTIAL_OPEN' })] })
    expect(screen.getByText('Market partial open')).toBeInTheDocument()
  })

  it('groups by venue and lists both venues’ stuck orders together', () => {
    renderList({ orders: [gmxFrozen(), gainsStuck()] })
    const groups = screen.getAllByRole('heading', { level: 5 }).map((h) => h.textContent)
    // Table order, not arrival order.
    expect(groups).toEqual(['Gains', 'GMX'])
  })
})

/* --------------------------------------------------------------------------------------------- *
 * The descriptor — the narrow data flow that makes the index mistake hard
 * --------------------------------------------------------------------------------------------- */

describe('recoveryDescriptor', () => {
  it('reads ONLY order.recovery — a trade index elsewhere on the order is unreachable', () => {
    const order = gainsStuck({ venueRef: { tradeIndex: tradeIndex(99) }, raw: { pendingOrderIndex: 99 } })
    const descriptor = recoveryDescriptor(order)
    expect(descriptor.action).toBe('cancel') // never 'recover' — orderState.js keys its mappers on it
    expect(descriptor.params.pendingOrderIndex).toBe(order.recovery.pendingOrderIndex)
    expect(descriptor.params.tradeIndex).toBeUndefined()
  })

  it('is total: an order with nothing to recover yields no descriptor', () => {
    for (const input of [null, undefined, {}, { recovery: null }, { recovery: { action: 'somethingElse' } }]) {
      expect(recoveryDescriptor(input)).toBeNull()
    }
  })
})

/* --------------------------------------------------------------------------------------------- *
 * End to end with the real hook — the brand survives every hop
 * --------------------------------------------------------------------------------------------- */

describe('PerpsPendingOrders + usePerpsOrders', () => {
  it('carries the branded pending-order index from the gateway payload into the calldata', async () => {
    const { result } = renderHook(() =>
      usePerpsOrders(MEMBER, {
        deps: {
          fetchPositions: async () => ({
            positions: [],
            sources: { gains: { status: 'read', chains: [ARBITRUM], pendingOrderChains: [ARBITRUM] } },
            pendingOrders: [
              {
                id: `gains:${ARBITRUM}:pending:4`,
                venue: 'gains',
                chainId: ARBITRUM,
                symbol: 'BTC/USD',
                direction: 'long',
                orderType: GAINS_PENDING_ORDER_TYPE.MARKET_OPEN,
                createdBlock: 1_000,
                requestedSizeUsd: 1_000,
                // The wire carries the index BY NAME; there is deliberately no bare `index` field.
                venueRef: { venue: 'gains', chainId: ARBITRUM, pendingOrderIndex: 4, tradeIndex: null },
              },
            ],
          }),
          getProvider: () => ({ getBlockNumber: async () => HEAD, getLogs: async () => [] }),
          makeContract: () => ({ getMarketOrdersTimeoutBlocks: async () => 200n }),
        },
      }),
    )
    await waitFor(() => expect(result.current.recoverableOrders).toHaveLength(1))

    renderList({ status: result.current.status, orders: result.current.orders })
    await userEvent.click(screen.getByRole('button', { name: 'Recover your collateral' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].calls[0].data).toBe(diamond.encodeFunctionData('cancelOrderAfterTimeout', [4]))
  })
})
