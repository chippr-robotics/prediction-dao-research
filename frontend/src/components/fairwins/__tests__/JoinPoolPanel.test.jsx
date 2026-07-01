import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
vi.mock('../../../hooks/usePools', () => ({ usePools: vi.fn() }))

import { useWallet } from '../../../hooks/useWalletManagement'
import { usePools } from '../../../hooks/usePools'
import JoinPoolPanel from '../JoinPoolPanel'
import { UIContext } from '../../../contexts/UIContext'

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

  it('routes a success toast into the notification system on join (spec 037)', async () => {
    const joinPool = vi.fn().mockResolvedValue('0xtx')
    usePools.mockReturnValue({ status: 'idle', error: null, joinPool })
    const showNotification = vi.fn()
    render(
      <MemoryRouter>
        <UIContext.Provider value={{ showNotification }}>
          <JoinPoolPanel summary={openSummary} onClose={() => {}} />
        </UIContext.Provider>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: /join for 10\.0 USDC/i }))
    await waitFor(() => expect(showNotification).toHaveBeenCalledWith(expect.stringMatching(/joined the pool/i), 'success', expect.any(Number)))
  })
})
