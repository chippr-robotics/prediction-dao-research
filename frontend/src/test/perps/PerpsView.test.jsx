/**
 * PerpsView (spec 082) — view states: ready (merged table + badges), per-venue degraded banner,
 * unavailable, testnet cohort, fee disclosure (zero ⇒ absent; non-zero ⇒ named line; unreadable ⇒
 * honest note), external marking + risk disclosure on link-outs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { WalletContext } from '../../contexts/WalletContext.js'
import PerpsView from '../../components/perps/PerpsView'

const TRADER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

// Cohort control: mocked per-test via this switch (default mainnet).
let cohortMainnet = true
vi.mock('../../config/perps', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    perpsCohortSupported: () => cohortMainnet,
    perpsGatewayUrl: () => 'https://gateway.test',
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
  ...over,
})
const configDeps = (fee = { bps: 0, capBps: 10, source: 'env-fallback' }) => ({
  fetchConfig: vi.fn(async () => ({
    attribution: { gains: { referrer: '0x2222222222222222222222222222222222222222' }, gmx: { refCode: 'fairwins' }, hyperliquid: {} },
    hyperliquidBuilderFee: fee,
  })),
})

function renderView({ markets = marketsDeps(), positions = positionsDeps(), config = configDeps(), wallet = {} } = {}) {
  return render(
    <WalletContext.Provider value={{ address: TRADER, isConnected: false, ...wallet }}>
      <PerpsView deps={{ markets, positions, config }} />
    </WalletContext.Provider>,
  )
}

beforeEach(() => {
  cohortMainnet = true
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
    expect(screen.getByText('+0.0013%/1h')).toBeInTheDocument()
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
    renderView({ markets })
    expect(screen.getByText(/mainnet venues only/i)).toBeInTheDocument()
    expect(markets.fetchPairs).not.toHaveBeenCalled()
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
    const positions = positionsDeps({
      fetchPositions: vi.fn(async () => ({
        positions: [
          { id: 'hyperliquid:ETH:long', venue: 'hyperliquid', chainId: null, symbol: 'ETH/USD', direction: 'long', sizeUsd: 4500, entryPrice: 3000, leverage: 10, unrealizedPnlUsd: -50 },
        ],
        sources: { hyperliquid: { status: 'read' } },
      })),
    })
    renderView({ positions, wallet: { isConnected: true } })
    await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())
    expect(screen.getByText('Long')).toBeInTheDocument()
    expect(screen.getByText('−$50.00')).toBeInTheDocument()
  })
})
