/**
 * PortfolioPanel (spec 044) — WCAG 2.1 AA audits via vitest-axe (FR-016).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import PortfolioPanel from '../../components/wallet/PortfolioPanel'
import { getTaxonomyCategory } from '../../config/assetTaxonomy'

const mockUsePortfolio = vi.fn()
vi.mock('../../hooks/usePortfolio', () => ({
  default: (...args) => mockUsePortfolio(...args),
  usePortfolio: (...args) => mockUsePortfolio(...args),
}))

const HOLDINGS = [
  {
    asset: { id: 'native', chainId: 137, kind: 'native', address: null, symbol: 'MATIC', name: 'MATIC', categoryId: 'digital-commodities', source: 'sec-baseline' },
    balance: 2,
    balanceRaw: 2n,
    usd: 1,
  },
  {
    asset: { id: '0xusdc', chainId: 137, kind: 'erc20', address: '0xusdc', symbol: 'USDC', name: 'USD Coin', categoryId: 'payment-stablecoins', source: 'app-config' },
    balance: 100,
    balanceRaw: 100n,
    usd: 100,
  },
  {
    asset: { id: '0xlink', chainId: 137, kind: 'erc20', address: '0xlink', symbol: 'LINK', name: 'ChainLink Token', categoryId: 'digital-tools', source: 'curated-registry' },
    balance: 5,
    balanceRaw: 5n,
    usd: null,
  },
]

function makeSnapshot(overrides = {}) {
  const holdings = overrides.holdings ?? HOLDINGS
  const ids = ['digital-commodities', 'digital-securities', 'payment-stablecoins', 'digital-tools', 'digital-collectibles']
  return {
    status: 'ready',
    isSupportedNetwork: true,
    isLoading: false,
    error: null,
    holdings,
    categories: ids.map((id) => {
      const catHoldings = holdings.filter((h) => h.asset.categoryId === id)
      return {
        category: getTaxonomyCategory(id),
        holdings: catHoldings,
        subtotalUsd: catHoldings.reduce((s, h) => s + (h.usd ?? 0), 0),
        isPartial: catHoldings.some((h) => h.usd == null),
      }
    }),
    totalUsd: 101,
    isPartial: true,
    failedAssets: [],
    lastUpdated: 1,
    refresh: vi.fn(),
    ...overrides,
  }
}

describe('PortfolioPanel accessibility (WCAG 2.1 AA)', () => {
  it('populated portfolio view has no violations', async () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot())
    const { container } = render(<PortfolioPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('collapsed category state has no violations', async () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot())
    const { container } = render(<PortfolioPanel />)
    fireEvent.click(screen.getByRole('button', { name: /payment stablecoins/i }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('error state has no violations', async () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ status: 'error', error: 'Unable to read balances from the network.' }))
    const { container } = render(<PortfolioPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
