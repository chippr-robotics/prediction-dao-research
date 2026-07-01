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

  it('renders as a wager-style bottom sheet, create-only (joining moved to the unified lookup, spec 037)', () => {
    usePools.mockReturnValue(pools())
    renderModal({ initialTab: 'create' })
    expect(screen.getByRole('dialog')).toHaveClass('friend-markets-modal-backdrop')
    expect(screen.getByRole('tab', { name: /create a pool/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /join a pool/i })).toBeNull()
  })

  it('Create tab: submitting yields a shareable four-word phrase', async () => {
    usePools.mockReturnValue(pools({
      createPool: vi.fn().mockResolvedValue({ pool: openSummary.address, wordIndices: [1, 2, 3, 4], phrase: 'crystal orbit harbor violet' }),
    }))
    renderModal({ initialTab: 'create' })
    fireEvent.click(screen.getByRole('button', { name: /create pool/i }))
    expect(await screen.findByTestId('pool-phrase')).toHaveTextContent('crystal orbit harbor violet')
  })
})
