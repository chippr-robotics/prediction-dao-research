/**
 * Portfolio collectibles estimate line (spec 055 US3 / FR-006, research D8) — a separate,
 * labeled floor-price estimate beside token balances that NEVER joins the totalUsd headline,
 * hides where the feature is unavailable, and degrades without blocking token rendering.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PortfolioPanel from '../../components/wallet/PortfolioPanel'
import usePortfolio from '../../hooks/usePortfolio'
import { useCollectiblesValuation } from '../../hooks/useCollectibles'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})
vi.mock('../../hooks/usePortfolio', () => ({ default: vi.fn(), usePortfolio: vi.fn() }))
vi.mock('../../hooks/useCollectibles', () => ({ useCollectiblesValuation: vi.fn() }))
vi.mock('../../components/wallet/AssetDetailSheet', () => ({ default: () => null }))

const ITEM = { collectionSlug: 'cool-cats', quantity: 2 }

const portfolioState = (overrides = {}) => ({
  status: 'ready',
  isLoading: false,
  error: null,
  holdings: [],
  aggregates: [],
  categories: [],
  totalUsd: 1234.56,
  failedAssets: [],
  priceMap: new Map([['ETH', { usd: 4000 }]]),
  showTestnetAssets: true,
  showZeroBalances: true,
  lastUpdated: Date.now(),
  refresh: vi.fn(),
  ...overrides,
})

const valuationState = (overrides = {}) => ({
  supported: true,
  status: 'ready',
  items: [ITEM],
  statsBySlug: new Map([['cool-cats', { floorPrice: { amount: '0.5', currency: 'WETH' }, stale: false }]]),
  bounds: { hasMoreItems: false, truncatedCollections: false },
  stale: false,
  ...overrides,
})

function renderPanel() {
  return render(
    <MemoryRouter>
      <PortfolioPanel />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  usePortfolio.mockReturnValue(portfolioState())
  useCollectiblesValuation.mockReturnValue(valuationState())
})

describe('Portfolio — collectibles estimate line', () => {
  it('shows a labeled floor-price estimate beside token balances (FR-006)', () => {
    renderPanel()
    // 0.5 WETH -> ETH @ 4000 × quantity 2 = $4,000.00, marked as approximate.
    expect(screen.getByText('≈ $4,000.00')).toBeInTheDocument()
    expect(screen.getByText(/floor-price estimate, priced items only/i)).toBeInTheDocument()
  })

  it('NEVER merges the estimate into the verifiable headline total (research D8)', () => {
    renderPanel()
    // Headline stays exactly the token total; the disclosure says so explicitly.
    expect(screen.getByText('$1,234.56')).toBeInTheDocument()
    expect(screen.queryByText('$5,234.56')).not.toBeInTheDocument()
    expect(screen.getByText(/not included in the total above/i)).toBeInTheDocument()
  })

  it('counts unpriced items instead of silently valuing them', () => {
    useCollectiblesValuation.mockReturnValue(
      valuationState({
        items: [ITEM, { collectionSlug: 'mystery', quantity: 1 }],
      })
    )
    renderPanel()
    expect(screen.getByText(/1 unpriced/i)).toBeInTheDocument()
  })

  it('shows an em-dash (never zero) when nothing is priced', () => {
    useCollectiblesValuation.mockReturnValue(valuationState({ statsBySlug: new Map() }))
    renderPanel()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/≈ \$/)).not.toBeInTheDocument()
  })

  it('is absent on unsupported networks and for empty wallets (FR-007)', () => {
    useCollectiblesValuation.mockReturnValue(valuationState({ supported: false, status: 'unsupported' }))
    renderPanel()
    expect(screen.queryByText(/collectibles/i)).not.toBeInTheDocument()

    useCollectiblesValuation.mockReturnValue(valuationState({ status: 'empty', items: [] }))
    renderPanel()
    expect(screen.queryByText(/floor-price estimate/i)).not.toBeInTheDocument()
  })

  it('degrades to an explicit unavailable state without blocking token rendering (FR-008)', () => {
    useCollectiblesValuation.mockReturnValue(valuationState({ status: 'degraded', items: [] }))
    renderPanel()
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.getByText('$1,234.56')).toBeInTheDocument() // tokens untouched
  })

  it('discloses partial (truncated) scans and stale data in the label (FR-013)', () => {
    useCollectiblesValuation.mockReturnValue(
      valuationState({ bounds: { hasMoreItems: true, truncatedCollections: false }, stale: true })
    )
    renderPanel()
    expect(screen.getByText(/partial/i)).toBeInTheDocument()
    expect(screen.getByText(/cached data/i)).toBeInTheDocument()
  })

  it('navigates to the Collectibles tab when selected', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /collectibles, floor-price estimate/i }))
    expect(navigateMock).toHaveBeenCalledWith('/wallet?tab=collectibles')
  })
})
