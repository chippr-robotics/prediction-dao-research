/**
 * PortfolioPanel (spec 044 + follow-up) — rendering-contract tests.
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

function makeHolding({
  symbol,
  name,
  categoryId,
  source = 'app-config',
  kind = 'erc20',
  balance = 1,
  balanceRaw = 1n,
  usd = null,
  chainId = 137,
  network = 'Polygon',
  decimals,
}) {
  return {
    asset: {
      id: symbol.toLowerCase(),
      chainId,
      kind,
      address: kind === 'native' ? null : `0x${symbol}`,
      symbol,
      name,
      categoryId,
      source,
      decimals,
    },
    balance,
    balanceRaw,
    usd,
    network,
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
    }
  })
}

function makeSnapshot(overrides = {}) {
  const holdings = overrides.holdings ?? []
  return {
    status: 'ready',
    isLoading: false,
    error: null,
    holdings,
    categories: groupsFromHoldings(holdings, overrides.groupOptions),
    totalUsd: holdings.reduce((s, h) => s + (h.usd ?? 0), 0),
    failedAssets: [],
    showTestnetAssets: false,
    lastUpdated: 1,
    refresh: vi.fn(),
    ...overrides,
  }
}

const POPULATED = [
  makeHolding({ symbol: 'MATIC', name: 'MATIC', categoryId: 'digital-commodities', source: 'sec-baseline', kind: 'native', balance: 2, balanceRaw: 2n * 10n ** 18n, decimals: 18, usd: 1 }),
  makeHolding({ symbol: 'ETH', name: 'Ether', categoryId: 'digital-commodities', source: 'sec-baseline', kind: 'native', balance: 0, balanceRaw: 0n, decimals: 18, usd: 0, chainId: 1, network: 'Ethereum' }),
  makeHolding({ symbol: 'USDC', name: 'USD Coin', categoryId: 'payment-stablecoins', source: 'app-config', balance: 100, balanceRaw: 100_000_000n, decimals: 6, usd: 100 }),
  makeHolding({ symbol: 'LINK', name: 'ChainLink Token', categoryId: 'digital-tools', source: 'curated-registry', balance: 5, balanceRaw: 5n * 10n ** 18n, decimals: 18, usd: null }),
]

beforeEach(() => {
  mockUsePortfolio.mockReset()
})

describe('PortfolioPanel states', () => {
  it('shows a connect prompt when disconnected', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ status: 'disconnected' }))
    render(<PortfolioPanel />)
    expect(screen.getByText(/connect a wallet/i)).toBeInTheDocument()
    expect(screen.queryByText(/total portfolio balance/i)).not.toBeInTheDocument()
  })

  it('shows a loading state', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ status: 'loading' }))
    render(<PortfolioPanel />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading portfolio/i)
  })

  it('shows the error state with a working retry', () => {
    const snapshot = makeSnapshot({ status: 'error', error: 'Unable to read balances from the supported networks.' })
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

  it('labels each row with its network', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)
    const commodities = screen.getByRole('region', { name: 'Digital Commodities' })
    expect(within(commodities).getByText('Polygon')).toBeInTheDocument()
    expect(within(commodities).getByText('Ethereum')).toBeInTheDocument()
  })

  it('renders zero-balance commodities as an honest 0 worth $0.00', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)
    const commodities = screen.getByRole('region', { name: 'Digital Commodities' })
    expect(within(commodities).getByText('0 ETH')).toBeInTheDocument()
    expect(within(commodities).getByText('$0.00')).toBeInTheDocument()
  })

  it('renders unpriced assets with an em dash and no partial labeling anywhere', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)

    const tools = screen.getByRole('region', { name: 'Digital Tools' })
    expect(within(tools).getByText('price unavailable')).toBeInTheDocument()
    expect(within(tools).queryByText('$0.00')).not.toBeInTheDocument()
    expect(screen.queryByText(/\(partial\)/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/excluded from USD totals/i)).not.toBeInTheDocument()
  })

  it('collapses a category on toggle, keeping header and subtotal visible', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)

    // The toggle's accessible name includes the subtotal, which separates it
    // from the "About Payment Stablecoins" info-bubble button.
    const toggle = screen.getByRole('button', { name: /payment stablecoins \$/i })
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

  it('never renders a nonzero dust balance as zero (honest state)', () => {
    const dust = makeHolding({
      symbol: 'WETH',
      name: 'Wrapped Ether',
      categoryId: 'digital-commodities',
      source: 'sec-baseline',
      balance: 1e-18,
      balanceRaw: 1n, // 1 wei of WETH
      decimals: 18,
      usd: null,
    })
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: [dust] }))
    render(<PortfolioPanel />)
    expect(screen.getByText('< 0.000001 WETH')).toBeInTheDocument()
    expect(screen.queryByText(/^0 WETH$/)).not.toBeInTheDocument()
  })

  it('refresh button triggers a reload', () => {
    const snapshot = makeSnapshot({ holdings: POPULATED })
    mockUsePortfolio.mockReturnValue(snapshot)
    render(<PortfolioPanel />)
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(snapshot.refresh).toHaveBeenCalled()
  })
})

describe('PortfolioPanel taxonomy provenance (info bubbles)', () => {
  it('keeps category descriptions out of the page until the info bubble opens', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)
    const commodities = getTaxonomyCategory('digital-commodities')

    // Dense inline explainer is gone…
    expect(screen.queryByText(commodities.description)).not.toBeInTheDocument()

    // …and lives in the shared InfoTip bubble beside the category header.
    fireEvent.click(screen.getByRole('button', { name: 'About Digital Commodities' }))
    expect(screen.getByText(commodities.description)).toBeInTheDocument()
  })

  it('offers an info bubble for every rendered category', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)
    for (const id of ['digital-commodities', 'digital-securities', 'payment-stablecoins', 'digital-tools', 'digital-collectibles']) {
      const cat = getTaxonomyCategory(id)
      expect(screen.getByRole('button', { name: `About ${cat.label}` })).toBeInTheDocument()
    }
  })

  it('labels each row with its classification source', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED }))
    render(<PortfolioPanel />)
    expect(screen.getAllByText('SEC baseline').length).toBeGreaterThan(0)
    expect(screen.getByText('Curated registry')).toBeInTheDocument()
    expect(screen.getByText('App configuration')).toBeInTheDocument()
  })

  it('always shows the compact disclosure line in the portfolio view', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: [] }))
    render(<PortfolioPanel />)
    expect(screen.getByText(/not legal or investment advice/i)).toBeInTheDocument()
    expect(screen.getByText(/curated registry are scanned/i)).toBeInTheDocument()
  })
})

describe('PortfolioPanel testnet visibility', () => {
  it('notes that testnet tokens are hidden when the preference is off', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED, showTestnetAssets: false }))
    render(<PortfolioPanel />)
    expect(screen.getByText(/testnet tokens are hidden/i)).toBeInTheDocument()
  })

  it('drops the note when testnet tokens are shown', () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ holdings: POPULATED, showTestnetAssets: true }))
    render(<PortfolioPanel />)
    expect(screen.queryByText(/testnet tokens are hidden/i)).not.toBeInTheDocument()
  })
})

describe('PortfolioPanel unclassified handling', () => {
  it('renders unclassified holdings in an explicit Unclassified group', () => {
    const holdings = [
      ...POPULATED,
      makeHolding({ symbol: 'MYST', name: 'Mystery Token', categoryId: 'unclassified', balance: 3, balanceRaw: 3n * 10n ** 18n, decimals: 18, usd: null }),
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
  })
})
