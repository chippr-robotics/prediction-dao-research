/**
 * PortfolioPanel + AssetDetailSheet (spec 044 v1.2) — WCAG 2.1 AA audits.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { MemoryRouter } from 'react-router-dom'
import PortfolioPanel from '../../components/wallet/PortfolioPanel'
import { getTaxonomyCategory } from '../../config/assetTaxonomy'

const mockUsePortfolio = vi.fn()
vi.mock('../../hooks/usePortfolio', () => ({
  default: (...args) => mockUsePortfolio(...args),
  usePortfolio: (...args) => mockUsePortfolio(...args),
}))

const ETH_AGG = {
  id: 'digital-commodities|ETH',
  categoryId: 'digital-commodities',
  underlying: 'ETH',
  name: 'Ethereum',
  kind: 'fungible',
  balance: 1.75,
  usd: 3500,
  unitPriceUsd: 2000,
  priceEntry: { source: 'chainlink', chainId: 137 },
  instances: [
    {
      asset: { id: 'native', chainId: 1, kind: 'native', address: null, symbol: 'ETH', baselineSymbol: 'ETH', categoryId: 'digital-commodities', source: 'sec-baseline', decimals: 18 },
      balance: 1,
      balanceRaw: 10n ** 18n,
      usd: 2000,
      network: 'Ethereum',
    },
    {
      asset: { id: '0xweth', chainId: 137, kind: 'erc20', address: '0xweth', symbol: 'WETH', baselineSymbol: 'ETH', categoryId: 'digital-commodities', source: 'sec-baseline', decimals: 18 },
      balance: 0.75,
      balanceRaw: 75n * 10n ** 16n,
      usd: 1500,
      network: 'Polygon',
    },
  ],
}

const USDC_AGG = {
  id: 'payment-stablecoins|USDC',
  categoryId: 'payment-stablecoins',
  underlying: 'USDC',
  name: 'USD Coin',
  kind: 'fungible',
  balance: 100,
  usd: 100,
  unitPriceUsd: 1,
  priceEntry: null,
  instances: [
    {
      asset: { id: '0xusdc', chainId: 137, kind: 'erc20', address: '0xusdc', symbol: 'USDC', categoryId: 'payment-stablecoins', source: 'app-config', decimals: 6 },
      balance: 100,
      balanceRaw: 100_000_000n,
      usd: 100,
      network: 'Polygon',
    },
  ],
}

function makeSnapshot(overrides = {}) {
  const aggregates = overrides.aggregates ?? [ETH_AGG, USDC_AGG]
  const ids = ['digital-commodities', 'digital-securities', 'payment-stablecoins', 'digital-tools', 'digital-collectibles']
  return {
    status: 'ready',
    isLoading: false,
    error: null,
    holdings: aggregates.flatMap((a) => a.instances),
    aggregates,
    categories: ids.map((id) => {
      const catAggregates = aggregates.filter((a) => a.categoryId === id)
      return {
        category: getTaxonomyCategory(id),
        aggregates: catAggregates,
        subtotalUsd: catAggregates.reduce((s, a) => s + (a.usd ?? 0), 0),
      }
    }),
    totalUsd: 3600,
    failedAssets: [],
    priceMap: new Map(),
    showTestnetAssets: false,
    showZeroBalances: false,
    lastUpdated: 1,
    refresh: vi.fn(),
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <PortfolioPanel />
    </MemoryRouter>,
  )
}

describe('Portfolio accessibility (WCAG 2.1 AA)', () => {
  it('populated portfolio view has no violations', async () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot())
    const { container } = renderPanel()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('collapsed category state has no violations', async () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot())
    const { container } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /payment stablecoins \$/i }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('open category info bubble has no violations', async () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot())
    const { container } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'About Digital Commodities' }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('open asset detail sheet has no violations', async () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot())
    const { container } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /ethereum eth 2 instances/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('error state has no violations', async () => {
    mockUsePortfolio.mockReturnValue(makeSnapshot({ status: 'error', error: 'Unable to read balances from the supported networks.' }))
    const { container } = renderPanel()
    expect(await axe(container)).toHaveNoViolations()
  })
})
