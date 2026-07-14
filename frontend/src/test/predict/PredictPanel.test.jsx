/**
 * PredictPanel (spec 057 US1) — the market browse grid. Verifies the grid renders and opens a detail
 * sheet, the degraded state keeps a never-stranded Polymarket path, and the surface is accessible.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import PredictPanel from '../../components/predict/PredictPanel'

const hookState = { current: null }
vi.mock('../../hooks/usePredictMarkets', () => ({
  usePredictMarkets: () => hookState.current,
}))
// TradeConfirm (rendered lazily inside the detail sheet) pulls the trade hook — stub it out.
vi.mock('../../hooks/usePredictTrade', () => ({
  usePredictTrade: () => ({ status: 'idle', loadFee: vi.fn(), preview: vi.fn(), submit: vi.fn(), fee: null, onWrongNetwork: false, canTrade: true }),
}))

const MARKET = {
  conditionId: '0xabc',
  question: 'Will it rain tomorrow?',
  category: 'Weather',
  tradable: true,
  polymarketUrl: 'https://polymarket.com/event/x',
  outcomes: [{ name: 'Yes', tokenId: '123', price: '0.55' }, { name: 'No', tokenId: '456', price: '0.45' }],
}

function makeHook(over = {}) {
  return {
    supported: true,
    status: 'ready',
    markets: [MARKET],
    hasMore: false,
    loadMore: vi.fn(),
    loadingMore: false,
    stale: false,
    fetchedAt: null,
    refresh: vi.fn(),
    ...over,
  }
}

beforeEach(() => {
  hookState.current = makeHook()
})

describe('PredictPanel', () => {
  it('renders the market grid and opens a detail sheet', () => {
    render(<PredictPanel />)
    expect(screen.getByText('Will it rain tomorrow?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Will it rain tomorrow/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Outcome buy/sell affordances appear in the sheet.
    expect(screen.getAllByRole('button', { name: 'Buy' }).length).toBeGreaterThan(0)
  })

  it('keeps a never-stranded Polymarket path when degraded', () => {
    hookState.current = makeHook({ status: 'degraded', markets: [] })
    render(<PredictPanel />)
    expect(screen.getByRole('link', { name: /Polymarket/i })).toBeInTheDocument()
  })

  it('shows an empty state for no results', () => {
    hookState.current = makeHook({ status: 'empty', markets: [] })
    render(<PredictPanel />)
    expect(screen.getAllByText(/No markets/i).length).toBeGreaterThan(0)
  })

  it('has an accessible search field and no axe violations', async () => {
    const { container } = render(<PredictPanel />)
    expect(screen.getByLabelText(/search markets/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
})
