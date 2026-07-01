import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
vi.mock('../../../hooks/usePools', () => ({ usePools: vi.fn() }))

import { useWallet } from '../../../hooks/useWalletManagement'
import { usePools } from '../../../hooks/usePools'
import JoinPoolPanel from '../JoinPoolPanel'

const openSummary = {
  address: '0x00000000000000000000000000000000000000aa',
  state: 0, stateLabel: 'JoiningOpen', buyInFormatted: '10.0', tokenSymbol: 'USDC',
  memberCount: 2, maxMembers: 5, slotsRemaining: 3, thresholdPct: 60,
}

function renderPanel(summary) {
  return render(<MemoryRouter><JoinPoolPanel summary={summary} onClose={() => {}} /></MemoryRouter>)
}

describe('JoinPoolPanel (spec 037, US1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWallet.mockReturnValue({ isConnected: true })
    usePools.mockReturnValue({ status: 'idle', error: null, joinPool: vi.fn() })
  })

  it('shows the pool summary and a Join action for an open pool', () => {
    renderPanel(openSummary)
    expect(screen.getByTestId('pool-summary')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join for 10\.0 USDC/i })).toBeInTheDocument()
  })

  it('marks a full/closed pool as not joinable (no Join button)', () => {
    renderPanel({ ...openSummary, state: 1, stateLabel: 'JoiningClosed', slotsRemaining: 0 })
    expect(screen.queryByRole('button', { name: /join for/i })).toBeNull()
    expect(screen.getByText(/isn’t accepting new members/i)).toBeInTheDocument()
  })

  it('renders nothing without a summary', () => {
    const { container } = renderPanel(null)
    expect(container.firstChild).toBeNull()
  })
})
