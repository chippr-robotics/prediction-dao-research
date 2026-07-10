/**
 * PortfolioPanel (spec 044) — rendering-contract tests.
 * The data seam (usePortfolio) is mocked; see usePortfolio.test.jsx for the
 * live-read behavior.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import PortfolioPanel from '../../components/wallet/PortfolioPanel'
import { getTaxonomyCategory } from '../../config/assetTaxonomy'

const mockUsePortfolio = vi.fn()
vi.mock('../../hooks/usePortfolio', () => ({
  default: (...args) => mockUsePortfolio(...args),
  usePortfolio: (...args) => mockUsePortfolio(...args),
}))

function makeHolding({ symbol, name, categoryId, source = 'app-config', kind = 'erc20', balance = 1, usd = null }) {
  return {
    asset: { id: symbol.toLowerCase(), chainId: 137, kind, address: kind === 'native' ? null : `0x${symbol}`, symbol, name, categoryId, source },
    balance,
    balanceRaw: 1n,
    usd,
  }
}

function groupsFromHoldings(holdings, { includeUnclassified = false } = {}) {
  const ids = [
    'digital-commodities',
    'digital-securities',
    'payment-stablecoins',
    'digital-tools',
    'digital-collectibles',
    ...(includeUnclassified ? ['unclassified'] : []),
  ]
  return ids.map((id) => {
    const catHoldings = holdings.filter((h) => h.asset.categoryId === id)
    return {
      category: getTaxonomyCategory(id),
      holdings: catHoldings,
      subtotalUsd: catHoldings.reduce((s, h) => s + (h.usd ?? 0), 0),
      isPartial: catHoldings.some((h) => h.usd == null),
    }
  })
}

function makeSnapshot(overrides = {}) {
  const holdings = overrides.holdings ?? []
  return {
    status: 'ready',
    isSupportedNetwork: true,
    isLoading: false,
    error: null,
    holdings,
    categories: groupsFromHoldings(holdings, overrides.groupOptions),
    totalUsd: holdings.reduce((s, h) => s + (h.usd ?? 0), 0),
    isPartial: holdings.some((h) => h.usd == null),
    failedAssets: [],
    lastUpdated: 1,
    refresh: vi.fn(),
    ...overrides,
  }
}

const POPULATED = [
  makeHolding({ symbol: 'MATIC', name: 'MATIC', categoryId: 'digital-commodities', source: 'sec-baseline', kind: 'native', balance: 2, usd: 1 }),
  makeHolding({ symbol: 'USDC', name: 'USD Coin', categoryId: 'payment-stablecoins', source: 'app-config', balance: 100, usd: 100 }),
  makeHolding({ symbol: 'LINK', name: 'ChainLink Token', categoryId: 'digital-tools', source: 'curated-registry', balance: 5, usd: null }),
]

beforeEach(() => {
  mockUsePortfolio.mockReset()
})

describe('PortfolioPanel states (FR-014)', () => {
  it('shows a connect prompt when disconnected', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ status: 'disconnected' }))
    render(<PortfolioPanel />)
    expect(screen.getByText(/connect a wallet/i)).toBeInTheDocument()
    expect(screen.queryByText(/total portfolio balance/i)).not.toBeInTheDocument()
  })

  it('shows an explicit unavailable state on unsupported networks', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ status: 'ready', isSupportedNetwork: false, categories: [] }))
    render(<PortfolioPanel />)
    expect(screen.getByText(/isn't available on this network/i)).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ status: 'loading' }))
    render(<PortfolioPanel />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading portfolio/i)
  })

  it('shows the error state with a working retry', () => {
    const snapshot = makeSnapshot({ status: 'error', error: 'Unable to read balances from the network.' })
    mockUsePortfolio.mockReturnValue(snapshot)
    render(<PortfolioPanel />)
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to read balances/i)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(snapshot.refresh).toHaveBeenCalled()
  })
})

describe('PortfolioPanel portfolio view', () => {
  it('renders the total, category subtotals, and asset rows', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)

    expect(screen.getByText('Total portfolio balance')).toBeInTheDocument()
    expect(screen.getByText(/\$101\.00/)).toBeInTheDocument()

    const stables = screen.getByRole('region', { name: 'Payment Stablecoins' })
    expect(within(stables).getByText('USD Coin')).toBeInTheDocument()
    expect(within(stables).getByText(/100 USDC/)).toBeInTheDocument()
    expect(within(stables).getByText('$100.00')).toBeInTheDocument()
  })

  it('renders unpriced assets with an em dash — never $0.00 — and labels totals partial (SC-005)', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)

    const tools = screen.getByRole('region', { name: 'Digital Tools' })
    expect(within(tools).getByText('price unavailable')).toBeInTheDocument()
    expect(within(tools).queryByText('$0.00')).not.toBeInTheDocument()

    // Grand total and the affected category flag partial.
    expect(screen.getAllByText(/\(partial\)/i).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/excluded from USD totals/i)).toBeInTheDocument()
  })

  it('names unreadable assets in the partial note', () => {
    mockUsePortfolio.mockReturnValue(
      makeSnapshot({ holdings: POPULATED, isPartial: true, failedAssets: ['WBTC'] }),
    )
    render(<PortfolioPanel />)
    expect(screen.getByText(/unreadable: WBTC/i)).toBeInTheDocument()
  })

  it('collapses a category on toggle, keeping header and subtotal visible', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)

    const toggle = screen.getByRole('button', { name: /payment stablecoins/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Rows hide (hidden region) while header and subtotal remain visible.
    expect(screen.getByText('USD Coin')).not.toBeVisible()
    expect(within(toggle).getByText('Payment Stablecoins')).toBeVisible()
    expect(within(toggle).getByText(/\$100\.00/)).toBeVisible()

    fireEvent.click(toggle)
    expect(screen.getByText('USD Coin')).toBeVisible()
  })

  it('shows an explicit empty state for categories with no holdings', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)
    const securities = screen.getByRole('region', { name: 'Digital Securities' })
    expect(within(securities).getByText(/no assets in this category/i)).toBeInTheDocument()
  })

  it('renders all five regulatory categories with $0.00 subtotals when nothing is held', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: [] }))
    render(<PortfolioPanel />)
    expect(screen.getAllByText(/no assets in this category/i)).toHaveLength(5)
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(6) // total + 5 subtotals
  })

  it('never renders a nonzero dust balance as zero (honest state)', () => {
    const dust = {
      asset: { id: '0xweth', chainId: 137, kind: 'erc20', address: '0xweth', symbol: 'WETH', name: 'Wrapped Ether', categoryId: 'digital-commodities', source: 'sec-baseline', decimals: 18 },
      balance: 1e-18,
      balanceRaw: 1n, // 1 wei of WETH
      usd: null,
    }
    const usdc = {
      asset: { id: '0xusdc2', chainId: 137, kind: 'erc20', address: '0xusdc2', symbol: 'USDC', name: 'USD Coin', categoryId: 'payment-stablecoins', source: 'app-config', decimals: 6 },
      balance: 1234.5,
      balanceRaw: 1_234_500_000n,
      usd: 1234.5,
    }
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: [dust, usdc] }))
    render(<PortfolioPanel />)
    // Raw-units formatting: dust floors at "< 0.000001", never "0 WETH".
    expect(screen.getByText('< 0.000001 WETH')).toBeInTheDocument()
    expect(screen.queryByText(/^0 WETH$/)).not.toBeInTheDocument()
    expect(screen.getByText('1,234.5 USDC')).toBeInTheDocument()
  })

  it('refresh button triggers a reload (FR-015)', () => {
    const snapshot = makeSnapshot({ holdings: POPULATED })
    mockUsePortfolio.mockReturnValue(snapshot)
    render(<PortfolioPanel />)
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(snapshot.refresh).toHaveBeenCalled()
  })
})

describe('PortfolioPanel taxonomy provenance (US2)', () => {
  it('exposes each category description from its header region', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)
    for (const id of ['digital-commodities', 'digital-securities', 'payment-stablecoins', 'digital-tools', 'digital-collectibles']) {
      const cat = getTaxonomyCategory(id)
      const region = screen.getByRole('region', { name: cat.label })
      expect(within(region).getByText(cat.description)).toBeInTheDocument()
    }
  })

  it('labels each row with its classification source (FR-006)', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)
    expect(screen.getByText('SEC baseline')).toBeInTheDocument()
    expect(screen.getByText('Curated registry')).toBeInTheDocument()
    expect(screen.getByText('App configuration')).toBeInTheDocument()
  })

  it('always shows the informational and coverage disclosures in the portfolio view (FR-013)', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: [] }))
    render(<PortfolioPanel />)
    expect(screen.getByText(/not legal or investment advice/i)).toBeInTheDocument()
    expect(screen.getByText(/only assets in the app's curated registry are scanned/i)).toBeInTheDocument()
  })
})

describe('PortfolioPanel unclassified handling (US3, FR-012)', () => {
  it('renders unclassified holdings in an explicit Unclassified group', () => {
    const holdings = [
      ...POPULATED,
      makeHolding({ symbol: 'MYST', name: 'Mystery Token', categoryId: 'unclassified', balance: 3, usd: null }),
    ]
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings, groupOptions: { includeUnclassified: true } }))
    render(<PortfolioPanel />)
    const region = screen.getByRole('region', { name: 'Unclassified' })
    expect(within(region).getByText('Mystery Token')).toBeInTheDocument()
  })

  it('omits the Unclassified group when nothing is unclassified', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)
    expect(screen.queryByRole('region', { name: 'Unclassified' })).not.toBeInTheDocument()
    expect(screen.queryByText('Unclassified')).not.toBeInTheDocument()
  })
})
