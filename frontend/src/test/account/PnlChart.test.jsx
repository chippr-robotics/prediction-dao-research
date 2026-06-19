import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PnlChart from '../../components/account/PnlChart'

const emptySeries = { range: '30D', points: [], isEmpty: true, isLowData: true, endValueUsd: 0 }
const series = {
  range: '30D',
  points: [
    { timestamp: 1_000_000, cumulativeUsd: -100, deltaUsd: -100, kind: 'deposit' },
    { timestamp: 2_000_000, cumulativeUsd: 150, deltaUsd: 250, kind: 'payout' },
  ],
  isEmpty: false,
  isLowData: false,
  endValueUsd: 150,
}

describe('PnlChart (spec 020 US2)', () => {
  it('defaults the active range to 30D', () => {
    render(<PnlChart series={series} onRangeChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '30D' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '7D' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('invokes onRangeChange when a range is selected', () => {
    const onRangeChange = vi.fn()
    render(<PnlChart series={series} onRangeChange={onRangeChange} />)
    fireEvent.click(screen.getByRole('button', { name: '90D' }))
    expect(onRangeChange).toHaveBeenCalledWith('90D')
  })

  it('exposes a screen-reader summary of the end value', () => {
    render(<PnlChart series={series} onRangeChange={vi.fn()} />)
    expect(screen.getByText(/Net profit and loss over the 30D range/i)).toBeInTheDocument()
  })

  it('renders an honest empty state with a CTA when there is no history', () => {
    const onCreate = vi.fn()
    render(<PnlChart series={emptySeries} onRangeChange={vi.fn()} onCreateWager={onCreate} />)
    expect(screen.getByText(/no performance history yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /create a wager/i }))
    expect(onCreate).toHaveBeenCalled()
  })
})
