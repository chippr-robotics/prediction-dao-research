import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the data hook so the component renders deterministically without
// touching the subgraph / RPC. (No IntersectionObserver in jsdom, so the
// component shows final values immediately.)
vi.mock('../../../hooks/useSiteStats', () => ({
  useSiteStats: vi.fn(),
}))

import LiveStats from '../LiveStats'
import { useSiteStats } from '../../../hooks/useSiteStats'

const LIVE_STATS = {
  activeAccounts: 1500,
  valueWageredUsd: 1_200_000,
  wagersResolved: 940,
  totalWagers: 1620,
  activeWagers: 210,
}

describe('LiveStats', () => {
  beforeEach(() => {
    vi.mocked(useSiteStats).mockReset()
  })

  it('renders all five stat labels', () => {
    vi.mocked(useSiteStats).mockReturnValue({ stats: LIVE_STATS, isLive: true, loading: false })
    render(<LiveStats />)
    expect(screen.getByText(/active accounts/i)).toBeInTheDocument()
    expect(screen.getByText(/value wagered/i)).toBeInTheDocument()
    expect(screen.getByText(/wagers resolved/i)).toBeInTheDocument()
    expect(screen.getByText(/total wagers/i)).toBeInTheDocument()
    expect(screen.getByText(/active now/i)).toBeInTheDocument()
  })

  it('formats compact counts and USD values', () => {
    vi.mocked(useSiteStats).mockReturnValue({ stats: LIVE_STATS, isLive: true, loading: false })
    render(<LiveStats />)
    // value wagered → compact USD
    expect(screen.getByText('$1.2M')).toBeInTheDocument()
    // resolved count → compact
    expect(screen.getByText('940')).toBeInTheDocument()
    // total wagers → compact
    expect(screen.getByText('1.6K')).toBeInTheDocument()
  })

  it('shows the live indicator when data is on-chain', () => {
    vi.mocked(useSiteStats).mockReturnValue({ stats: LIVE_STATS, isLive: true, loading: false })
    render(<LiveStats />)
    expect(screen.getByText(/live on-chain/i)).toBeInTheDocument()
  })

  it('falls back to a neutral label when data is not live', () => {
    vi.mocked(useSiteStats).mockReturnValue({ stats: LIVE_STATS, isLive: false, loading: false })
    render(<LiveStats />)
    expect(screen.getByText(/platform activity/i)).toBeInTheDocument()
    expect(screen.queryByText(/live on-chain/i)).not.toBeInTheDocument()
  })
})
