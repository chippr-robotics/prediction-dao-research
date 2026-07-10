/**
 * PortfolioPanel (spec 044 v1.2) — rendering-contract tests.
 * The data seam (usePortfolio) is mocked; see usePortfolio.test.jsx for the
 * live-read behavior and AssetDetailSheet.test.jsx for the sheet's own
 * contract.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PortfolioPanel from '../../components/wallet/PortfolioPanel'
import { getTaxonomyCategory } from '../../config/assetTaxonomy'

const mockUsePortfolio = vi.fn()
vi.mock('../../hooks/usePortfolio', () => ({
  default: (...args) => mockUsePortfolio(...args),
  usePortfolio: (...args) => mockUsePortfolio(...args),
}))

function instance({ symbol, baselineSymbol, kind = 'erc20', chainId = 137, network = 'Polygon', balance = 1, usd = null, categoryId = 'digital-commodities', source = 'sec-baseline', decimals = 18 }) {
  return {
    asset: { id: symbol.toLowerCase(), chainId, kind, address: kind === 'native' ? null : `0x${symbol}`, symbol, baselineSymbol, categoryId, source, decimals },
    balance,
    balanceRaw: 1n,
    usd,
    network,
  }
}

function aggregate({ underlying, name, categoryId = 'digital-commodities', kind = 'fungible', instances, usd, unitPriceUsd = null, priceEntry = null }) {
  const balance = instances.reduce((s, h) => s + h.balance, 0)
  return { id: `${categoryId}|${underlying}`, categoryId, underlying, name, kind, balance, usd, unitPriceUsd, priceEntry, instances }
}

const ETH_AGG = aggregate({
  underlying: 'ETH',
  name: 'Ethereum',
  instances: [
    instance({ symbol: 'ETH', baselineSymbol: 'ETH', kind: 'native', chainId: 1, network: 'Ethereum', balance: 1, usd: 2000 }),
    instance({ symbol: 'WETH', baselineSymbol: 'ETH', chainId: 1, network: 'Ethereum', balance: 0.5, usd: 1000 }),
    instance({ symbol: 'WETH', baselineSymbol: 'ETH', chainId: 137, network: 'Polygon', balance: 0.25, usd: 500 }),
  ],
  usd: 3500,
  unitPriceUsd: 2000,
  priceEntry: { source: 'chainlink', chainId: 137 },
})

const USDC_AGG = aggregate({
  underlying: 'USDC',
  name: 'USD Coin',
  categoryId: 'payment-stablecoins',
  instances: [instance({ symbol: 'USDC', categoryId: 'payment-stablecoins', source: 'app-config', balance: 100, usd: 100, decimals: 6 })],
  usd: 100,
  unitPriceUsd: 1,
})

const ETC_AGG = aggregate({
  underlying: 'ETC',
  name: 'Ethereum Classic',
  instances: [instance({ symbol: 'ETC', baselineSymbol: 'ETC', kind: 'native', chainId: 61, network: 'Ethereum Classic', balance: 2, usd: null })],
  usd: null,
})

function groupsFrom(aggregates, { includeUnclassified = false } = {}) {
  const ids = [
    'digital-commodities',
    'digital-securities',
    'payment-stablecoins',
    'digital-tools',
    'digital-collectibles',
    ...(includeUnclassified ? ['unclassified'] : []),
  ]
  return ids.map((id) => {
    const catAggregates = aggregates.filter((a) => a.categoryId === id)
    return {
      category: getTaxonomyCategory(id),
      aggregates: catAggregates,
      subtotalUsd: catAggregates.reduce((s, a) => s + (a.usd ?? 0), 0),
    }
  })
}

function makeSnapshot(overrides = {}) {
  const aggregates = overrides.aggregates ?? []
  return {
    status: 'ready',
    isLoading: false,
    error: null,
    holdings: aggregates.flatMap((a) => a.instances),
    aggregates,
    categories: groupsFrom(aggregates, overrides.groupOptions),
    totalUsd: aggregates.reduce((s, a) => s + (a.usd ?? 0), 0),
    failedAssets: [],
    priceMap: new Map(),
    showTestnetAssets: false,
    showZeroBalances: false,
    lastUpdated: 1,
    refresh: vi.fn(),
    ...overrides,
  }
}

const POPULATED = [ETH_AGG, USDC_AGG, ETC_AGG]

function renderPanel() {
  return render(
    <MemoryRouter>
      <PortfolioPanel />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUsePortfolio.mockReset()
})

describe('PortfolioPanel states', () => {
  it('shows a connect prompt when disconnected', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ status: 'disconnected' }))
    renderPanel()
    expect(screen.getByText(/connect a wallet/i)).toBeInTheDocument()
    expect(screen.queryByText(/total portfolio balance/i)).not.toBeInTheDocument()
  })

  it('shows a loading state', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ status: 'loading' }))
    renderPanel()
    expect(screen.getByRole('status')).toHaveTextContent(/loading portfolio/i)
  })

  it('shows the error state with a working retry', () => {
    const snapshot = makeSnapshot({ status: 'error', error: 'Unable to read balances from the supported networks.' })
    mockUsePortfolio.mockReturnValue(snapshot)
    renderPanel()
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to read balances/i)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(snapshot.refresh).toHaveBeenCalled()
  })
})

describe('PortfolioPanel aggregate rows', () => {
  it('renders one combined row per underlying with total, subtotal, and instance summary (FR-025)', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: POPULATED }))
    renderPanel()

    expect(screen.getByText('Total portfolio balance')).toBeInTheDocument()
    expect(screen.getByText('$3,600.00')).toBeInTheDocument()

    const commodities = screen.getByRole('region', { name: 'Digital Commodities' })
    const ethRow = within(commodities).getByRole('button', { name: /ethereum eth 3 instances/i })
    expect(ethRow).toHaveTextContent('3 instances · 2 networks')
    expect(ethRow).toHaveTextContent('$3,500.00')
    // Single-instance aggregates name their network directly.
    const etcRow = within(commodities).getByRole('button', { name: /ethereum classic/i })
    expect(etcRow).toHaveTextContent('Ethereum Classic')
  })

  it('renders unpriced aggregates with an em dash, never $0.00', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: POPULATED }))
    renderPanel()
    const etcRow = screen.getByRole('button', { name: /ethereum classic 2 etc/i })
    expect(within(etcRow).getByText('price unavailable')).toBeInTheDocument()
    expect(within(etcRow).queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('opens the asset detail sheet when a row is tapped (FR-024)', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: POPULATED }))
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /ethereum eth 3 instances/i }))

    const sheet = screen.getByRole('dialog', { name: /ethereum details/i })
    expect(sheet).toBeInTheDocument()
    // Instances are listed separately inside the sheet.
    expect(within(sheet).getByText('Native')).toBeInTheDocument()
    expect(within(sheet).getAllByText('Wrapped (WETH)')).toHaveLength(2)

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('collapses a category on toggle, keeping header and subtotal visible', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: POPULATED }))
    renderPanel()

    const toggle = screen.getByRole('button', { name: /payment stablecoins \$/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('USD Coin')).not.toBeVisible()
    expect(within(toggle).getByText(/\$100\.00/)).toBeVisible()

    fireEvent.click(toggle)
    expect(screen.getByText('USD Coin')).toBeVisible()
  })

  it('shows an explicit empty state for categories with no aggregates', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: POPULATED }))
    renderPanel()
    const securities = screen.getByRole('region', { name: 'Digital Securities' })
    expect(within(securities).getByText(/no assets in this category/i)).toBeInTheDocument()
  })

  it('never renders a nonzero dust balance as zero (honest state)', () => {
    const dust = aggregate({
      underlying: 'ETH',
      name: 'Ethereum',
      instances: [instance({ symbol: 'WETH', baselineSymbol: 'ETH', balance: 1e-18, usd: null })],
      usd: null,
    })
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: [dust] }))
    renderPanel()
    expect(screen.getByText(/< 0\.000001 ETH/)).toBeInTheDocument()
  })

  it('refresh button triggers a reload', () => {
    const snapshot = makeSnapshot({ aggregates: POPULATED })
    mockUsePortfolio.mockReturnValue(snapshot)
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }))
    expect(snapshot.refresh).toHaveBeenCalled()
  })
})

describe('PortfolioPanel taxonomy info bubbles', () => {
  it('keeps category descriptions out of the page until the info bubble opens', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: POPULATED }))
    renderPanel()
    const commodities = getTaxonomyCategory('digital-commodities')
    expect(screen.queryByText(commodities.description)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'About Digital Commodities' }))
    expect(screen.getByText(commodities.description)).toBeInTheDocument()
  })

  it('offers an info bubble for every rendered category', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: POPULATED }))
    renderPanel()
    for (const id of ['digital-commodities', 'digital-securities', 'payment-stablecoins', 'digital-tools', 'digital-collectibles']) {
      const cat = getTaxonomyCategory(id)
      expect(screen.getByRole('button', { name: `About ${cat.label}` })).toBeInTheDocument()
    }
  })
})

describe('PortfolioPanel visibility notes and disclosures', () => {
  it('notes hidden testnet and zero-balance assets when the preferences are off', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: POPULATED }))
    renderPanel()
    expect(screen.getByText(/testnet tokens are hidden/i)).toBeInTheDocument()
    expect(screen.getByText(/zero-balance assets are hidden/i)).toBeInTheDocument()
  })

  it('drops the notes when the preferences are on', () => {
    mockUsePortfolio.mockReturnValue(
      makeSnapshot({ aggregates: POPULATED, showTestnetAssets: true, showZeroBalances: true }),
    )
    renderPanel()
    expect(screen.queryByText(/testnet tokens are hidden/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/zero-balance assets are hidden/i)).not.toBeInTheDocument()
  })

  it('always shows the compact disclosure line naming on-chain price sources', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: [] }))
    renderPanel()
    expect(screen.getByText(/not legal or investment advice/i)).toBeInTheDocument()
    expect(screen.getByText(/on-chain sources \(oracle/i)).toBeInTheDocument()
  })
})

describe('PortfolioPanel unclassified handling', () => {
  it('renders unclassified aggregates in an explicit Unclassified group', () => {
    const myst = aggregate({
      underlying: 'MYST',
      name: 'MYST',
      categoryId: 'unclassified',
      instances: [instance({ symbol: 'MYST', categoryId: 'unclassified', source: 'app-config', balance: 3 })],
      usd: null,
    })
    mockUsePortfolio.mockReturnValue(
      makeSnapshot({ aggregates: [...POPULATED, myst], groupOptions: { includeUnclassified: true } }),
    )
    renderPanel()
    const region = screen.getByRole('region', { name: 'Unclassified' })
    expect(within(region).getByRole('button', { name: /myst/i })).toBeInTheDocument()
  })

  it('omits the Unclassified group when nothing is unclassified', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ aggregates: POPULATED }))
    renderPanel()
    expect(screen.queryByRole('region', { name: 'Unclassified' })).not.toBeInTheDocument()
  })
})
