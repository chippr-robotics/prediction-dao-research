import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// Chain capability gate — flip per-test via this holder.
const capsHolder = { capabilities: { polymarketSidebets: true } }
vi.mock('../hooks/useChainTokens', () => ({
  useChainTokens: () => capsHolder,
}))

// Top-markets feed — controlled per-test.
const topHolder = { results: [] }
vi.mock('../hooks/usePolymarketSearch', () => ({
  usePolymarketTopMarkets: () => topHolder,
}))

import PolymarketTickerCrawler from '../components/fairwins/PolymarketTickerCrawler'

const singleEvent = {
  id: 'evt-single',
  title: 'Will ETH flip BTC?',
  markets: [
    { conditionId: '0xsingle', question: 'Will ETH flip BTC?', label: 'Will ETH flip BTC?', endDate: '2030-01-01' },
  ],
}

const groupEvent = {
  id: 'evt-group',
  title: 'F1 Drivers’ Champion',
  markets: [
    { conditionId: '0xham', question: 'Will Hamilton win?', label: 'Hamilton', endDate: '2030-01-01' },
    { conditionId: '0xver', question: 'Will Verstappen win?', label: 'Verstappen', endDate: '2030-01-01' },
    { conditionId: '0xnor', question: 'Will Norris win?', label: 'Norris', endDate: '2030-01-01' },
  ],
}

describe('<PolymarketTickerCrawler />', () => {
  beforeEach(() => {
    capsHolder.capabilities = { polymarketSidebets: true }
    topHolder.results = []
  })

  it('renders nothing on a network without an on-chain oracle', () => {
    capsHolder.capabilities = { polymarketSidebets: false }
    topHolder.results = [singleEvent]
    const { container } = render(<PolymarketTickerCrawler onSelectMarket={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when there are no markets', () => {
    topHolder.results = []
    const { container } = render(<PolymarketTickerCrawler onSelectMarket={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('clicking a single-market entry selects that market', () => {
    const onSelectMarket = vi.fn()
    topHolder.results = [singleEvent]
    render(<PolymarketTickerCrawler onSelectMarket={onSelectMarket} />)

    // The interactive (non-clone) copy is a button; the aria-hidden clone is a span.
    fireEvent.click(screen.getByRole('button', { name: 'Will ETH flip BTC?' }))
    expect(onSelectMarket).toHaveBeenCalledTimes(1)
    expect(onSelectMarket.mock.calls[0][0].conditionId).toBe('0xsingle')
  })

  it('clicking a market group reveals its sub-markets as a list above the title', () => {
    const onSelectMarket = vi.fn()
    topHolder.results = [groupEvent]
    render(<PolymarketTickerCrawler onSelectMarket={onSelectMarket} />)

    // Group entry does not select directly — it expands.
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /F1 Drivers’ Champion/ }))
    expect(onSelectMarket).not.toHaveBeenCalled()

    const menu = screen.getByRole('menu')
    // Each sub-market is a menu item, listed by its short label.
    expect(within(menu).getByRole('menuitem', { name: 'Hamilton' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Verstappen' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Norris' })).toBeInTheDocument()

    // Picking a sub-market selects it and closes the panel.
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Verstappen' }))
    expect(onSelectMarket).toHaveBeenCalledTimes(1)
    expect(onSelectMarket.mock.calls[0][0].conditionId).toBe('0xver')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('shows each market once for assistive tech — the marquee clone is aria-hidden and non-interactive', () => {
    topHolder.results = [singleEvent]
    render(<PolymarketTickerCrawler onSelectMarket={vi.fn()} />)
    // One interactive button (real copy); the clone renders as static text.
    expect(screen.getAllByRole('button', { name: 'Will ETH flip BTC?' })).toHaveLength(1)
  })
})
