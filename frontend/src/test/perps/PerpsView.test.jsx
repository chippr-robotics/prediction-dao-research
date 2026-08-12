/**
 * PerpsView (spec 082, extended by spec 083) — view states: ready (merged table + badges),
 * per-venue degraded banner, unavailable, testnet cohort, fee disclosure (zero ⇒ absent; non-zero ⇒
 * named line; unreadable ⇒ honest note), external marking + risk disclosure on link-outs.
 *
 * Spec 083 adds the COMPOSITION assertions, which are the ones a reviewer cannot make by eye:
 *
 *   - with the management flag OFF — the state CI runs in and the state most members will see —
 *     the view is the phase-0 read-only surface: no manage control, no sheet, nothing to click;
 *   - with it ON, a row on a venue this build can manage opens the PositionSheet, and a row on
 *     Hyperliquid does not (FR-021: read-only this release, and never a dead control);
 *   - the stuck-order list sits ABOVE the positions list, and — deliberately — is NOT behind the
 *     flag, because a recovery control may never be gated by one (US4 acceptance 3 / SC-004).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WalletContext } from '../../contexts/WalletContext.js'
import PerpsView from '../../components/perps/PerpsView'
import { perpsManageEnabled } from '../../config/perps'

const TRADER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const OTHER_TRADER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'

// Cohort + management-flag control: mocked per-test via these switches. Both default to the state
// a CI build actually has — mainnet cohort, management OFF.
let cohortMainnet = true
let manageFlag = false
vi.mock('../../config/perps', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    perpsCohortSupported: () => cohortMainnet,
    perpsGatewayUrl: () => 'https://gateway.test',
    // `perpsManageEnabled` stays REAL: the per-venue capability is the thing that must keep
    // Hyperliquid out, and a stubbed one would prove nothing about it.
    perpsManageFeatureEnabled: () => manageFlag,
  }
})

const PAIRS = [
  {
    id: 'gains:137:BTC/USD',
    venue: 'gains',
    chainId: 137,
    symbol: 'BTC/USD',
    base: 'BTC',
    price: 63000,
    fundingRate: 0.0000125,
    fundingIntervalHours: 1,
    openInterestUsd: 8000,
    maxLeverage: 200,
    volume24hUsd: null,
  },
  {
    id: 'hyperliquid:ETH',
    venue: 'hyperliquid',
    chainId: null,
    symbol: 'ETH/USD',
    base: 'ETH',
    price: 3000,
    fundingRate: -0.00002,
    fundingIntervalHours: 1,
    openInterestUsd: 90_000_000,
    maxLeverage: 25,
    volume24hUsd: 4_000_000,
  },
]

const marketsDeps = (over = {}) => ({
  available: () => true,
  fetchPairs: vi.fn(async () => ({
    pairs: PAIRS,
    sources: { gains: { status: 'read', chains: [137] }, hyperliquid: { status: 'read', chains: [] } },
    asOf: 'now',
  })),
  ...over,
})
const positionsDeps = (over = {}) => ({
  available: () => true,
  fetchPositions: vi.fn(async () => ({ positions: [], sources: {} })),
  // The hook also reads GMX positions from its Reader on Arbitrum (spec 083 T032). Stubbed here so
  // a component test never reaches a live endpoint; the read itself is covered in
  // `usePerpsPositions.test.jsx`.
  getProvider: () => ({}),
  makeContract: () => ({ getAccountPositions: async () => [] }),
  ...over,
})
const configDeps = (fee = { bps: 0, capBps: 10, source: 'env-fallback' }) => ({
  fetchConfig: vi.fn(async () => ({
    attribution: { gains: { referrer: '0x2222222222222222222222222222222222222222' }, gmx: { refCode: 'fairwins' }, hyperliquid: {} },
    hyperliquidBuilderFee: fee,
  })),
})

/**
 * A Gains position on Polygon — a venue/chain pair `perpsManageEnabled` really does support.
 *
 * THE FIELD LIST IS EXACTLY WHAT THE GATEWAY EMITS (`normalizeGainsPositions`), and that matters
 * more than it looks: there is deliberately NO `markPrice` here, because the gateway does not
 * publish one. A fixture that invented it hid the fact that the assembled view had no current
 * price to close against at all — the sheet refused every close, honestly, and US1 was unreachable.
 * The price is composed in `PerpsView` from the venue's own pairs feed; see the wiring test below.
 * Do not add a field here the producer does not produce.
 */
const GAINS_POSITION = {
  id: 'gains:137:7',
  venue: 'gains',
  chainId: 137,
  symbol: 'BTC/USD',
  direction: 'long',
  sizeUsd: 1000,
  collateralUsd: 100,
  entryPrice: 60_000,
  leverage: 10,
  liquidationPrice: 54_000,
  unrealizedPnlUsd: 50,
  venueRef: {
    venue: 'gains',
    chainId: 137,
    tradeIndex: 7,
    pairIndex: 1,
    collateralIndex: 3,
    collateralToken: USDC_POLYGON,
    collateralDecimals: 6,
    collateralPrecision: '1000000',
  },
}

/**
 * A GMX position EXACTLY as `usePerpsPositions#toGmxPosition` publishes it. The Reader returns
 * size and side and nothing else this app can price, so entry, leverage, collateral and P&L are
 * genuinely null and render '—' — do not add them here to make a test read better.
 */
const GMX_POSITION = {
  id: 'gmx:42161:0xkey',
  venue: 'gmx',
  chainId: 42161,
  symbol: null,
  direction: 'long',
  sizeUsd: 1000,
  collateralUsd: null,
  entryPrice: null,
  leverage: null,
  unrealizedPnlUsd: null,
  venueRef: {
    venue: 'gmx',
    chainId: 42161,
    positionKey: `0x${'ab'.repeat(32)}`,
    market: '0x47c031236e19d024b42f8AE6780E44A573170703',
    collateralToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    isLong: true,
  },
  raw: { sizeInUsd: 1000n * 10n ** 30n, collateralAmount: 100_000_000n },
}

const HL_POSITION = {
  id: 'hyperliquid:ETH:long',
  venue: 'hyperliquid',
  chainId: null,
  symbol: 'ETH/USD',
  direction: 'long',
  sizeUsd: 4500,
  entryPrice: 3000,
  leverage: 10,
  unrealizedPnlUsd: -50,
}

/** A Gains market order the keeper never executed, in the wire shape `usePerpsOrders` reads. */
const STUCK_ORDER = {
  id: 'gains:137:pending:4',
  venue: 'gains',
  chainId: 137,
  symbol: 'BTC/USD',
  direction: 'long',
  orderType: 0, // MARKET_OPEN
  createdBlock: 100,
  timeoutBlocks: 30,
  venueRef: { pendingOrderIndex: 4 },
}

/**
 * `usePerpsOrders`, stubbed to touch no network. GMX resolves to "not deployed" so the Arbitrum log
 * read never runs; the Gains facet comes back through the stubbed gateway.
 */
const ordersDeps = ({ pendingOrders = [], head = 1000 } = {}) => ({
  fetchPositions: vi.fn(async () => ({
    positions: [],
    pendingOrders,
    sources: { gains: { status: 'read', pendingOrderChains: [137] } },
  })),
  getProvider: () => ({ getBlockNumber: async () => head, getLogs: async () => [] }),
  makeContract: () => ({ getMarketOrdersTimeoutBlocks: async () => 30n }),
  addressesFor: () => null,
})

/** The write rail for both the pending-order list and the sheet. `sleep` parks the venue watcher. */
const tradeDeps = () => ({
  sendOnChain: vi.fn(async () => ({ receipts: [{ status: 1, hash: `0x${'11'.repeat(32)}`, logs: [] }] })),
  getProvider: () => ({ getBlockNumber: async () => 1000, getLogs: async () => [] }),
  sleep: () => new Promise(() => {}),
  now: () => 0,
})

const sheetDeps = () => ({ readFee: async () => ({ bps: 0 }), trade: tradeDeps() })

function renderView({
  markets = marketsDeps(),
  positions = positionsDeps(),
  config = configDeps(),
  orders = ordersDeps(),
  trade = tradeDeps(),
  sheet = sheetDeps(),
  wallet = {},
} = {}) {
  return render(
    <WalletContext.Provider
      value={{ address: TRADER, isConnected: false, chainId: 137, loginMethod: 'injected', signer: {}, ...wallet }}
    >
      <PerpsView deps={{ markets, positions, config, orders, trade, sheet }} />
    </WalletContext.Provider>,
  )
}

/** Positions from the gateway, as a connected member would see them. */
const withPositions = (rows) =>
  positionsDeps({ fetchPositions: vi.fn(async () => ({ positions: rows, sources: { gains: { status: 'read' } } })) })

beforeEach(() => {
  cohortMainnet = true
  manageFlag = false
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('PerpsView', () => {
  it('renders the merged table with venue badges, prices, funding, OI and leverage', async () => {
    renderView()
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByText('BTC/USD')).toBeInTheDocument()
    expect(screen.getByText('ETH/USD')).toBeInTheDocument()
    expect(screen.getByText('63,000.0')).toBeInTheDocument()
    expect(screen.getByText('+0.0013%')).toBeInTheDocument()
    expect(screen.getByText('$90.0M')).toBeInTheDocument()
    expect(screen.getByText('200×')).toBeInTheDocument()
    // Venue badges: gains carries its network name; hyperliquid never does (non-EVM, FR-012).
    expect(screen.getByText('Gains')).toBeInTheDocument()
    expect(screen.getByText('HL')).toBeInTheDocument()
  })

  it('marks link-outs external and shows the risk disclosure', async () => {
    renderView()
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    const links = screen.getAllByRole('link', { name: /opens the venue in a new tab/i })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
    expect(screen.getByText(/leverage multiplies losses/i)).toBeInTheDocument()
    expect(screen.getByText(/you are leaving fairwins/i)).toBeInTheDocument()
  })

  it('names a degraded venue while the rest keep rendering', async () => {
    const markets = marketsDeps({
      fetchPairs: vi.fn(async () => ({
        pairs: PAIRS.filter((p) => p.venue !== 'hyperliquid'),
        sources: { gains: { status: 'read', chains: [137] }, hyperliquid: { status: 'degraded', chains: [] } },
        asOf: 'now',
      })),
    })
    renderView({ markets })
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByText(/hyperliquid market data is temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.getByText('BTC/USD')).toBeInTheDocument()
    expect(screen.queryByText('ETH/USD')).not.toBeInTheDocument()
  })

  it('renders one honest unavailable state on total failure', async () => {
    const markets = marketsDeps({ fetchPairs: vi.fn(async () => Promise.reject(new Error('down'))) })
    renderView({ markets })
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument())
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('discloses mainnet-only on a testnet cohort instead of showing cross-cohort data', () => {
    cohortMainnet = false
    const markets = marketsDeps()
    const orders = ordersDeps({ pendingOrders: [STUCK_ORDER] })
    renderView({ markets, orders, wallet: { isConnected: true } })
    expect(screen.getByText(/mainnet venues only/i)).toBeInTheDocument()
    expect(markets.fetchPairs).not.toHaveBeenCalled()
    // The order read has no `available()` of its own, so the cohort boundary is honoured by
    // withholding the account. A testnet build reading mainnet venues would cross it (constitution III).
    expect(orders.fetchPositions).not.toHaveBeenCalled()
  })

  it('shows NO fee line at a zero builder fee', async () => {
    renderView({ config: configDeps({ bps: 0, capBps: 10, source: 'chain' }) })
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.queryByText(/fairwins charges/i)).not.toBeInTheDocument()
  })

  it('discloses a non-zero builder fee as a named percentage line', async () => {
    renderView({ config: configDeps({ bps: 5, capBps: 10, source: 'chain' }) })
    await waitFor(() => expect(screen.getByText(/fairwins charges a 0\.05% fee on hyperliquid orders/i)).toBeInTheDocument())
  })

  it('says the fee could not be confirmed when the config read fails — never a silent substitute', async () => {
    renderView({ config: { fetchConfig: vi.fn(async () => Promise.reject(new Error('down'))) } })
    await waitFor(() => expect(screen.getByText(/could not be confirmed/i)).toBeInTheDocument())
  })

  it('shows positions for a connected wallet', async () => {
    renderView({ positions: withPositions([HL_POSITION]), wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())
    expect(screen.getByText('Long')).toBeInTheDocument()
    expect(screen.getByText('−$50.00')).toBeInTheDocument()
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Spec 083 — the management gate
 * --------------------------------------------------------------------------------------------- */

describe('PerpsView management controls', () => {
  it('renders the phase-0 read-only surface with the management flag OFF', async () => {
    // This is the CI state and the state most members will see, so it is asserted rather than
    // assumed: no manage control on a venue this build CAN manage, and nothing that opens a sheet.
    renderView({ positions: withPositions([GAINS_POSITION]), wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())

    // …and it is the FLAG withholding it, not the capability: this build can build calldata for
    // this venue on this chain. Without this line the case would pass for the wrong reason.
    expect(perpsManageEnabled('gains', 137)).toBe(true)
    expect(screen.queryByRole('button', { name: /close or protect/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The never-stranded path is still there, exactly as phase 0 shipped it.
    expect(screen.getByRole('link', { name: /Manage this position on Gains Network/i })).toBeInTheDocument()
    expect(screen.getByText(/positions are read-only in FairWins this release/i)).toBeInTheDocument()
  })

  it('opens the PositionSheet from a row when the flag is ON', async () => {
    manageFlag = true
    renderView({ positions: withPositions([GAINS_POSITION]), wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())

    const manage = screen.getByRole('button', {
      name: 'Close or protect your Long BTC/USD position on Gains Network',
    })
    await userEvent.click(manage)

    const sheet = await screen.findByRole('dialog')
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: /Long BTC\/USD/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close this position' })).toBeEnabled()

    // Dismissing gives the view back, with the row still there.
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /close or protect/i })).toBeInTheDocument()
  })

  it('closes the sheet the moment the account changes', async () => {
    // A sheet aimed at the previous account's position carries that account's venue handles. It
    // must go before anything is painted for the new one (spec 083 edge case).
    manageFlag = true
    const positions = withPositions([GAINS_POSITION])
    const { rerender } = renderView({ positions, wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /close or protect/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    rerender(
      <WalletContext.Provider
        value={{ address: OTHER_TRADER, isConnected: true, chainId: 137, loginMethod: 'injected', signer: {} }}
      >
        <PerpsView
          deps={{ markets: marketsDeps(), positions, config: configDeps(), orders: ordersDeps(), trade: tradeDeps(), sheet: sheetDeps() }}
        />
      </WalletContext.Provider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers NO in-app control for Hyperliquid even with the flag ON (FR-021)', async () => {
    manageFlag = true
    renderView({ positions: withPositions([HL_POSITION]), wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())

    // Not a disabled button — no button at all, plus the honest per-venue statement.
    expect(screen.queryByRole('button', { name: /close or protect/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Hyperliquid positions are read-only in FairWins this release/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Manage this position on Hyperliquid/i })).toBeInTheDocument()
  })

  it('states management per venue when one venue is manageable and another is not', async () => {
    manageFlag = true
    renderView({ positions: withPositions([GAINS_POSITION, HL_POSITION]), wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())

    expect(screen.getByText(/close, reduce and protect your Gains Network positions here/i)).toBeInTheDocument()
    expect(screen.getByText(/Hyperliquid positions are read-only/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /close or protect/i })).toHaveLength(1)
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Spec 083 US1 — the exit actually reaches the venue from the ASSEMBLED view
 *
 * Every other test here mounts the sheet with props a test wrote. These mount it the way the app
 * does, from a position payload in the gateway's own shape, and follow the tap all the way to the
 * send rail. That is the only level at which a missing prop is visible: a position read carries
 * what the member holds, never what the market is doing, so without the composition below the
 * sheet has no price to bound a close with and refuses every one of them — honestly, and with US1
 * unreachable. It refused exactly that way until this was wired.
 * --------------------------------------------------------------------------------------------- */

describe('PerpsView prices the exit from the venue’s own feed', () => {
  it('shows the venue’s current price on the sheet, and the close reaches the send rail', async () => {
    manageFlag = true
    const sheet = sheetDeps()
    renderView({ positions: withPositions([GAINS_POSITION]), sheet, wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /close or protect/i }))
    await screen.findByRole('dialog')

    // The same number the pairs table one section up is rendering for this venue's BTC/USD.
    const current = screen.getByText('Current price', { selector: 'dt' }).parentElement.querySelector('dd')
    expect(current).toHaveTextContent('63,000.0')

    await userEvent.click(screen.getByRole('button', { name: 'Close this position' }))
    await waitFor(() => expect(sheet.trade.sendOnChain).toHaveBeenCalled())
    // The venue's chain, and a call to the venue — not a refusal.
    expect(sheet.trade.sendOnChain.mock.calls[0][0]).toBe(137)
    expect(document.querySelector('.pps-error')).toBeNull()
  })

  it('takes the price from the venue that holds the position, never from another venue’s pair', async () => {
    // A same-symbol pair on a different venue at a different price. Borrowing it would price a
    // Gains close off Hyperliquid's book — a fabricated number bounding a leveraged exit.
    manageFlag = true
    const markets = marketsDeps({
      fetchPairs: vi.fn(async () => ({
        pairs: [{ ...PAIRS[1], id: 'hyperliquid:BTC', symbol: 'BTC/USD', base: 'BTC', price: 1 }],
        sources: { hyperliquid: { status: 'read', chains: [] } },
        asOf: 'now',
      })),
    })
    renderView({ markets, positions: withPositions([GAINS_POSITION]), wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /close or protect/i }))
    await screen.findByRole('dialog')

    const current = screen.getByText('Current price', { selector: 'dt' }).parentElement.querySelector('dd')
    expect(current).toHaveTextContent('—')
  })

  /**
   * KNOWN GAP, PINNED HONESTLY — GMX in-app management cannot complete this release.
   *
   * `createOrder` is settled by keepers the member pays for, so every GMX order needs an
   * `executionFee` in wei. Nothing in this app produces one: `venueQuote` has no producer, and
   * `positionSheetActions` deliberately refuses rather than guessing, because a guessed fee either
   * strands the order unexecuted or overcharges (contracts/venue-calldata.md). The estimator —
   * GMX's `ESTIMATED_GAS_FEE_*` DataStore keys and its own formula — is not built.
   *
   * Until it is, a GMX row offers a control whose every action refuses. That refusal is honest and
   * the venue link-out beside it always works, so nothing is stranded and the flag is off by
   * default — but it IS a dead control, which is what FR-021 forbids. This test exists so the gap
   * is visible in the suite instead of silent; DELETE IT when the execution-fee read lands, and
   * replace it with the send assertion its Gains sibling above already makes.
   */
  it('KNOWN GAP: a GMX exit refuses — the keeper fee has no producer in this build', async () => {
    manageFlag = true
    const sheet = sheetDeps()
    renderView({ positions: withPositions([GMX_POSITION]), sheet, wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /close or protect/i }))
    await screen.findByRole('dialog')

    await userEvent.click(screen.getByRole('button', { name: 'Close this position' }))
    await waitFor(() => expect(screen.getByText(/keeper fee for this order could not be read/i)).toBeInTheDocument())
    // Refused BEFORE a wallet prompt, and the venue's own surface is named as the way through.
    expect(sheet.trade.sendOnChain).not.toHaveBeenCalled()
    // Two of them — the row's and the sheet's own footer. Either is a way out.
    expect(screen.getAllByRole('link', { name: /Manage this position on GMX/i }).length).toBeGreaterThan(0)
  })

  it('keeps the price when the member filters the pairs table down to nothing', async () => {
    // The table's list is a VIEW shaped by the search box. Pricing a position off it would make a
    // close stop being possible because of a control that has nothing to do with the position.
    manageFlag = true
    const sheet = sheetDeps()
    renderView({ positions: withPositions([GAINS_POSITION]), sheet, wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())
    await userEvent.type(screen.getByLabelText('Search pairs'), 'ZZZZ')
    await waitFor(() => expect(screen.getByText(/No pairs match/i)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /close or protect/i }))
    await screen.findByRole('dialog')
    const current = screen.getByText('Current price', { selector: 'dt' }).parentElement.querySelector('dd')
    expect(current).toHaveTextContent('63,000.0')
  })
})

/* --------------------------------------------------------------------------------------------- *
 * Spec 083 US4 — the stuck-order list
 * --------------------------------------------------------------------------------------------- */

describe('PerpsView stuck orders', () => {
  it('lists a stuck order ABOVE the positions list, with its recovery control', async () => {
    renderView({
      orders: ordersDeps({ pendingOrders: [STUCK_ORDER] }),
      positions: withPositions([GAINS_POSITION]),
      wallet: { isConnected: true },
    })
    await waitFor(() => expect(screen.getByText('Orders waiting at the venue')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Recover your collateral' })).toBeEnabled()

    // Urgency is expressed as document order: collateral in limbo comes before a healthy position.
    const orders = screen.getByText('Orders waiting at the venue')
    const positions = screen.getByText('Your positions')
    expect(orders.compareDocumentPosition(positions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('still offers the recovery control with the management flag OFF (US4 acceptance 3)', async () => {
    // The flag withholds the management surface; it may never withhold a member's collateral. A
    // stuck order can exist from the venue's own app whatever this build has enabled.
    manageFlag = false
    renderView({
      orders: ordersDeps({ pendingOrders: [STUCK_ORDER] }),
      positions: withPositions([GAINS_POSITION]),
      wallet: { isConnected: true },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recover your collateral' })).toBeEnabled())
    expect(screen.queryByRole('button', { name: /close or protect/i })).not.toBeInTheDocument()
  })

  it('renders nothing for the order list when nothing is waiting', async () => {
    renderView({ positions: withPositions([GAINS_POSITION]), wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())
    expect(screen.queryByText('Orders waiting at the venue')).not.toBeInTheDocument()
  })

  it('keeps the recovery surface alive when market data is unavailable', async () => {
    // A dead pairs feed says nothing about a member's collateral — the recovery path is not
    // downstream of it.
    const markets = marketsDeps({ fetchPairs: vi.fn(async () => Promise.reject(new Error('down'))) })
    renderView({
      markets,
      orders: ordersDeps({ pendingOrders: [STUCK_ORDER] }),
      wallet: { isConnected: true },
    })
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recover your collateral' })).toBeEnabled())
  })
})
