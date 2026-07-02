import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// PoolPage (spec 034): the routed pool-management view — live state + the member's nickname + the
// state-driven actions (creator close/cancel, member approve w/ progress, refund, resolved). The
// create/join entry flows are now the GroupPoolModal bottom-sheet (see GroupPoolModal.test.jsx).

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
vi.mock('../hooks/usePools', () => ({ usePools: vi.fn() }))

import { useWallet } from '../hooks/useWalletManagement'
import { usePools } from '../hooks/usePools'
import PoolPage from '../pages/PoolPage'

const openSummary = {
  address: '0x00000000000000000000000000000000000000aa',
  state: 0, stateLabel: 'JoiningOpen', buyInFormatted: '10.0', tokenSymbol: 'USDC',
  memberCount: 2, maxMembers: 5, slotsRemaining: 3, thresholdPct: 60,
}

function base(overrides = {}) {
  return {
    status: 'idle', error: null,
    createPool: vi.fn(), resolvePhrase: vi.fn(), getPoolSummary: vi.fn(), joinPool: vi.fn(),
    getMyNickname: vi.fn(), getMyClaimCode: vi.fn(), getMemberCommitments: vi.fn(),
    peekPoolIdentity: vi.fn().mockResolvedValue(null),
    restorePoolIdentity: vi.fn().mockResolvedValue({
      commitment: '123', claimCode: '987654321', nickname: { label: 'Prismatic Fox', suffix: '7b' },
    }),
    closeJoining: vi.fn().mockResolvedValue('0xtx'), cancelPool: vi.fn().mockResolvedValue('0xtx'),
    proposeOutcome: vi.fn(), vote: vi.fn().mockResolvedValue('0xtx'), claimWinnings: vi.fn(),
    refund: vi.fn().mockResolvedValue('0xtx'),
    ...overrides,
  }
}
function renderPoolAt(summary) {
  return render(
    <MemoryRouter initialEntries={[`/pools/${summary.address}`]}>
      <Routes>
        <Route path="/pools/:address" element={<PoolPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PoolPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWallet.mockReturnValue({ account: '0x1111111111111111111111111111111111111111', isConnected: true })
  })

  it('renders live on-chain state with a human status label (not the raw enum name)', async () => {
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(openSummary) }))
    renderPoolAt(openSummary)
    const state = await screen.findByTestId('pool-state')
    expect(state).toHaveTextContent('Open')
    expect(state).not.toHaveTextContent('JoiningOpen')
  })

  it('auto-shows a joined member’s nickname from the device cache (no click, no signature)', async () => {
    const sum = { ...openSummary, hasJoined: true }
    const peekPoolIdentity = vi.fn().mockResolvedValue({
      commitment: '123', claimCode: null, nickname: { label: 'Prismatic Fox', suffix: '7b' },
    })
    const restorePoolIdentity = vi.fn()
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(sum), peekPoolIdentity, restorePoolIdentity }))
    renderPoolAt(sum)
    expect(await screen.findByTestId('my-nickname')).toHaveTextContent('Prismatic Fox')
    expect(screen.queryByRole('button', { name: /reveal my nickname/i })).toBeNull()
    expect(restorePoolIdentity).not.toHaveBeenCalled() // cache hit — no signature path
  })

  it('auto-RESTORES the identity when nothing is cached — still no click (live-app tester feedback)', async () => {
    const sum = { ...openSummary, hasJoined: true }
    const restorePoolIdentity = vi.fn().mockResolvedValue({
      commitment: '123', claimCode: '987654321', nickname: { label: 'Gentle Fox', suffix: '14' },
    })
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(sum), restorePoolIdentity }))
    renderPoolAt(sum)
    expect(await screen.findByTestId('my-nickname')).toHaveTextContent('Gentle Fox')
    expect(restorePoolIdentity).toHaveBeenCalledWith(sum.address)
    expect(screen.queryByRole('button', { name: /reveal my nickname/i })).toBeNull()
    // The raw claim code is never rendered — it's system-managed now (no scary integer on screen).
    expect(screen.queryByText('987654321')).toBeNull()
  })

  it('lets a not-yet-joined viewer (including the creator) join while joining is open', async () => {
    const joinPool = vi.fn().mockResolvedValue({ txHash: '0xtx' })
    const sum = { ...openSummary, isCreator: true, hasJoined: false, state: 0, slotsRemaining: 3 }
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(sum), joinPool }))
    renderPoolAt(sum)
    fireEvent.click(await screen.findByTestId('join-pool'))
    await waitFor(() => expect(joinPool).toHaveBeenCalledWith(sum.address))
  })

  it('collapses the pool details into an expandable summary (default collapsed)', async () => {
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(openSummary) }))
    renderPoolAt(openSummary)
    const details = await screen.findByTestId('pool-summary')
    expect(details.tagName).toBe('DETAILS')
    expect(details.open).toBe(false)
  })

  it('falls back to the Reveal button only when the automatic restore fails (declined signature)', async () => {
    const sum = { ...openSummary, hasJoined: true }
    const restorePoolIdentity = vi.fn().mockRejectedValue(new Error('user rejected signature'))
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(sum), restorePoolIdentity }))
    renderPoolAt(sum)
    expect(await screen.findByRole('button', { name: /reveal my nickname/i })).toBeInTheDocument()
  })

  it('shows no identity section to a viewer who has not joined (e.g. a creator outside the pool)', async () => {
    const sum = { ...openSummary, isCreator: true, hasJoined: false }
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(sum) }))
    renderPoolAt(sum)
    await screen.findByTestId('pool-state')
    expect(screen.queryByRole('button', { name: /reveal my nickname/i })).toBeNull()
    expect(screen.queryByTestId('my-nickname')).toBeNull()
  })

  it('the creator sees close/cancel while joining is open', async () => {
    const closeJoining = vi.fn().mockResolvedValue('0xtx')
    const sum = { ...openSummary, isCreator: true }
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(sum), closeJoining }))
    renderPoolAt(sum)
    fireEvent.click(await screen.findByTestId('close-joining'))
    await waitFor(() => expect(closeJoining).toHaveBeenCalledWith(sum.address))
    expect(screen.getByTestId('cancel-pool')).toBeInTheDocument()
  })

  it('a joined member can approve the proposed outcome (with progress)', async () => {
    const vote = vi.fn().mockResolvedValue('0xtx')
    const sum = {
      ...openSummary, state: 1, stateLabel: 'JoiningClosed', withinResolutionWindow: true,
      currentProposalId: '0xabc', hasJoined: true, approvalCount: 1, requiredApprovals: 2,
    }
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(sum), vote }))
    renderPoolAt(sum)
    expect(await screen.findByTestId('approval-progress')).toHaveTextContent('1 / 2')
    fireEvent.click(screen.getByTestId('approve-outcome'))
    await waitFor(() => expect(vote).toHaveBeenCalled())
  })

  it('a refund-eligible member can recover the buy-in', async () => {
    const refund = vi.fn().mockResolvedValue('0xtx')
    const sum = { ...openSummary, state: 1, stateLabel: 'JoiningClosed', refundEligible: true }
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(sum), refund }))
    renderPoolAt(sum)
    fireEvent.click(await screen.findByTestId('refund'))
    await waitFor(() => expect(refund).toHaveBeenCalledWith(sum.address))
  })

  it('a resolved pool surfaces the resolved state', async () => {
    const sum = { ...openSummary, state: 2, stateLabel: 'Resolved' }
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(sum) }))
    renderPoolAt(sum)
    expect(await screen.findByTestId('pool-resolved')).toBeInTheDocument()
  })
})
