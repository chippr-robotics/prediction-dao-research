import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Spec 034: the group-pool create/join flow as a wager-style bottom-sheet modal (matches
// FriendMarketsModal / OpenChallengeModal). Replaces the old /pools/create + /pools/join routes.

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
vi.mock('../hooks/usePools', () => ({ usePools: vi.fn() }))

import { useWallet } from '../hooks/useWalletManagement'
import { usePools } from '../hooks/usePools'
import GroupPoolModal from '../components/fairwins/GroupPoolModal'

const openSummary = {
  address: '0x00000000000000000000000000000000000000aa',
  state: 0, stateLabel: 'JoiningOpen', buyInFormatted: '10.0', tokenSymbol: 'USDC',
  memberCount: 2, maxMembers: 5, slotsRemaining: 3, thresholdPct: 60,
}

function pools(over = {}) {
  return { status: 'idle', error: null, createPool: vi.fn(), resolvePhrase: vi.fn(), joinPool: vi.fn(), ...over }
}
function renderModal(props) {
  return render(<MemoryRouter><GroupPoolModal isOpen onClose={() => {}} {...props} /></MemoryRouter>)
}

describe('GroupPoolModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWallet.mockReturnValue({ account: '0x1111111111111111111111111111111111111111', isConnected: true })
  })

  it('renders as a wager-style bottom sheet with Create/Join tabs', () => {
    usePools.mockReturnValue(pools())
    renderModal({ initialTab: 'create' })
    expect(screen.getByRole('dialog')).toHaveClass('friend-markets-modal-backdrop')
    expect(screen.getByRole('tab', { name: /create a pool/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /join a pool/i })).toBeInTheDocument()
  })

  it('Create tab: submitting yields a shareable four-word phrase', async () => {
    usePools.mockReturnValue(pools({
      createPool: vi.fn().mockResolvedValue({ pool: openSummary.address, wordIndices: [1, 2, 3, 4], phrase: 'crystal orbit harbor violet' }),
    }))
    renderModal({ initialTab: 'create' })
    fireEvent.click(screen.getByRole('button', { name: /create pool/i }))
    expect(await screen.findByTestId('pool-phrase')).toHaveTextContent('crystal orbit harbor violet')
  })

  it('Join tab: a valid phrase shows the pool summary before funds, with a Join action', async () => {
    usePools.mockReturnValue(pools({ resolvePhrase: vi.fn().mockResolvedValue({ summary: openSummary }) }))
    renderModal({ initialTab: 'join' })
    fireEvent.change(screen.getByLabelText(/four-word phrase/i), { target: { value: 'crystal orbit harbor violet' } })
    fireEvent.click(screen.getByRole('button', { name: /find pool/i }))
    expect(await screen.findByTestId('pool-summary')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join for 10\.0 USDC/i })).toBeInTheDocument()
  })

  it('Join tab: an unknown phrase surfaces a clear not-found message', async () => {
    usePools.mockReturnValue(pools({ resolvePhrase: vi.fn().mockResolvedValue({ notFound: true, reason: 'unknown' }) }))
    renderModal({ initialTab: 'join' })
    fireEvent.change(screen.getByLabelText(/four-word phrase/i), { target: { value: 'a b c d' } })
    fireEvent.click(screen.getByRole('button', { name: /find pool/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no active pool matches/i)
  })

  it('Join tab: a full/closed pool is not joinable', async () => {
    usePools.mockReturnValue(pools({
      resolvePhrase: vi.fn().mockResolvedValue({ summary: { ...openSummary, state: 1, stateLabel: 'JoiningClosed', slotsRemaining: 0 } }),
    }))
    renderModal({ initialTab: 'join' })
    fireEvent.change(screen.getByLabelText(/four-word phrase/i), { target: { value: 'a b c d' } })
    fireEvent.click(screen.getByRole('button', { name: /find pool/i }))
    await screen.findByTestId('pool-summary')
    expect(screen.queryByRole('button', { name: /join for/i })).toBeNull()
    expect(screen.getByText(/isn’t accepting new members/i)).toBeInTheDocument()
  })
})
