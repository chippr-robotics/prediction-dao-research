/**
 * PerpsPendingOrders WCAG 2.1 AA audits (spec 083 US4) — light and dark themes.
 *
 * Audited in the state that matters: a stuck order on each venue, with the recovery control live,
 * a venue reason, and an unreadable-venue notice. This is the surface a member reaches when their
 * collateral is in limbo — it has to be operable by everyone, in both themes.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'

import PerpsPendingOrders from '../../components/perps/PerpsPendingOrders'
import { WalletContext } from '../../contexts/WalletContext.js'
import { GAINS_PENDING_ORDER_TYPE } from '../../abis/perps/gainsDiamond'
import { GMX_ORDER_TYPE } from '../../abis/perps/gmxExchangeRouter'
import { pendingOrderIndex } from '../../lib/perps/venues/gains'
import { PERPS_GAINS_TIMEOUT_OBSERVATION } from '../../lib/perps/perpsCopy'

const ARBITRUM = 42161
const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
const KEY = `0x${'ab'.repeat(32)}`

const ORDERS = [
  {
    id: `gains:${ARBITRUM}:pending:4`,
    venue: 'gains',
    chainId: ARBITRUM,
    symbol: 'BTC/USD',
    direction: 'long',
    state: 'timed_out',
    orderState: { state: 'timed_out', venue: 'gains', chainId: ARBITRUM, action: 'open' },
    pending: false,
    statusText: 'Gains did not execute this in time.',
    // OUR observation, unattributed — the venue emitted nothing for a timeout (source `'app'`).
    reason: { code: null, text: PERPS_GAINS_TIMEOUT_OBSERVATION, source: 'app' },
    orderType: GAINS_PENDING_ORDER_TYPE.MARKET_OPEN,
    orderTypeName: 'MARKET_OPEN',
    returnsCollateral: true,
    timing: { createdBlock: 1_000, currentBlock: 1_400, timeoutBlocks: 200, readable: true, blocksRemaining: 0 },
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
  },
  {
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
  },
]

const SOURCES = {
  gains: { status: 'read', windowed: false, detail: null },
  gmx: {
    status: 'read',
    windowed: true,
    detail: 'GMX orders are read from recent chain history, so an order frozen further back is not listed here.',
  },
  hyperliquid: { status: 'unreadable', detail: 'Hyperliquid orders are managed on the venue.' },
}

/**
 * The two rows with NO recovery control, which the audit above never reaches: an order still
 * inside its timeout window (a countdown and nothing to press), and one the venue never gave a
 * handle for (a paragraph carrying a labelled link-out as the only way forward). The second is the
 * likeliest place for a violation to hide — an interactive element nested in body copy, whose
 * accessible name comes from an aria-label rather than its text.
 */
const NO_CONTROL_ORDERS = [
  {
    ...ORDERS[0],
    id: `gains:${ARBITRUM}:pending:5`,
    state: 'venue_pending',
    orderState: { state: 'venue_pending', venue: 'gains', chainId: ARBITRUM, action: 'open' },
    pending: true,
    statusText: 'Gains Network is executing this.',
    reason: null,
    timing: { createdBlock: 1_000, currentBlock: 1_100, timeoutBlocks: 200, readable: true, blocksRemaining: 100 },
    recoverable: false,
    recovery: null,
  },
  {
    ...ORDERS[1],
    id: `gmx:${ARBITRUM}:nohandle`,
    statusText: 'Needs your attention.',
    returnsCollateral: null,
    recoverable: false,
    recovery: null,
    venueRef: null,
  },
]

function renderThemed(themeClass, orders = ORDERS) {
  return render(
    <div className={themeClass}>
      <WalletContext.Provider
        value={{ address: MEMBER, isConnected: true, chainId: ARBITRUM, loginMethod: 'injected' }}
      >
        <PerpsPendingOrders
          status="ready"
          orders={orders}
          unreadableVenues={['hyperliquid']}
          sources={SOURCES}
          refresh={() => {}}
          deps={{ sendOnChain: async () => ({ receipts: [] }), getProvider: () => null }}
        />
      </WalletContext.Provider>
    </div>,
  )
}

describe('PerpsPendingOrders accessibility', () => {
  it('has no WCAG violations in the light theme', async () => {
    const { container } = renderThemed('theme-light platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations in the dark theme', async () => {
    const { container } = renderThemed('theme-dark platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations for a countdown row and a no-handle row, in both themes', async () => {
    for (const theme of ['theme-light platform-fairwins', 'theme-dark platform-fairwins']) {
      const { container, getByText, unmount } = renderThemed(theme, NO_CONTROL_ORDERS)
      // Both no-control states really are on screen — otherwise this would pass over nothing.
      expect(getByText(/you can recover your collateral in about/i)).toBeInTheDocument()
      expect(getByText(/did not report a reference for this order/i)).toBeInTheDocument()
      expect(await axe(container)).toHaveNoViolations()
      unmount()
    }
  }, 30000)
})
