import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SummaryTiles from '../../components/account/SummaryTiles'
import PnlChart from '../../components/account/PnlChart'

beforeEach(() => {
  window.matchMedia = (q) => ({
    matches: true, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })
})

describe('Honest empty / low-data states (spec 020 US3, Constitution III)', () => {
  it('SummaryTiles shows neutral zeros marked "no activity yet" when empty', () => {
    const empty = { netPnlUsd: 0, winRate: null, wins: 0, losses: 0, totalWageredUsd: 0, activeWagers: 0, atStakeUsd: 0, walletBalanceUsd: 0 }
    const { container } = render(<SummaryTiles summary={empty} isEmpty />)
    expect(screen.getByText('no activity yet')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    // No win/loss tone applied to a fabricated trend
    expect(container.querySelector('.tone-win')).not.toBeInTheDocument()
    expect(container.querySelector('.tone-loss')).not.toBeInTheDocument()
  })

  it('PnlChart renders an empty state and no chart when there is no history', () => {
    const series = { range: '30D', points: [], isEmpty: true, isLowData: true, endValueUsd: 0 }
    render(<PnlChart series={series} onRangeChange={vi.fn()} />)
    expect(screen.getByText(/no performance history yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })

  it('PnlChart flags low-data without implying a misleading full trend', () => {
    const series = {
      range: '30D',
      points: [{ timestamp: 1_000_000, cumulativeUsd: 50, deltaUsd: 50, kind: 'bucket' }],
      isEmpty: false, isLowData: true, endValueUsd: 50,
    }
    render(<PnlChart series={series} onRangeChange={vi.fn()} />)
    expect(screen.getByText(/not enough activity yet to show a full trend/i)).toBeInTheDocument()
  })
})
