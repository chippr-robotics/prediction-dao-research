import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SummaryTiles from '../../components/account/SummaryTiles'

// Force the reduced-motion / non-animatable path so values render finally.
beforeEach(() => {
  window.matchMedia = (q) => ({
    matches: true, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })
})

const summary = {
  netPnlUsd: 1200,
  winRate: 0.6,
  wins: 6,
  losses: 4,
  totalWageredUsd: 5000,
  activeWagers: 3,
  atStakeUsd: 250,
  walletBalanceUsd: 800,
}

describe('SummaryTiles (spec 020 US1)', () => {
  it('renders all five tiles with formatted values', () => {
    render(<SummaryTiles summary={summary} />)
    expect(screen.getByText('Net P&L')).toBeInTheDocument()
    expect(screen.getByText('Win Rate')).toBeInTheDocument()
    expect(screen.getByText('Total Wagered')).toBeInTheDocument()
    expect(screen.getByText('Active Wagers')).toBeInTheDocument()
    expect(screen.getByText('Wallet Balance')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('6W · 4L')).toBeInTheDocument()
  })

  it('shows a non-color sign cue for a positive net P&L', () => {
    const { container } = render(<SummaryTiles summary={summary} />)
    expect(container.querySelector('.tone-win')).toBeInTheDocument()
    expect(container.textContent).toContain('▲')
  })

  it('shows a loss tone and cue for a negative net P&L', () => {
    const { container } = render(<SummaryTiles summary={{ ...summary, netPnlUsd: -300 }} />)
    expect(container.querySelector('.tone-loss')).toBeInTheDocument()
    expect(container.textContent).toContain('▼')
  })

  it('renders "—" when win rate is null', () => {
    render(<SummaryTiles summary={{ ...summary, winRate: null }} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
