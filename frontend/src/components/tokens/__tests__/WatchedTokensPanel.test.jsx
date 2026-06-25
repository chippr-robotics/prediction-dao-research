import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Spec 034 — the membership-gated "My Tokens" assets panel. Data hooks are mocked so the
// panel's gating (FR-023), empty/loading states, network-scoped rows, and removal (FR-009)
// are exercised deterministically. WatchedTokenRow is rendered for real.

const h = vi.hoisted(() => ({
  membership: { isActive: true, tier: 2 },
  loading: false,
  entries: [],
  removeToken: vi.fn(),
  addToken: vi.fn(),
  showModal: vi.fn(),
}))

vi.mock('../../../hooks/useRoleDetails', () => ({
  useRoleDetails: () => ({ getRoleDetails: () => h.membership, loading: h.loading }),
}))
vi.mock('../../../hooks/useUI', () => ({
  useModal: () => ({ showModal: h.showModal, hideModal: vi.fn() }),
}))
vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ address: '0x9999999999999999999999999999999999999999' }),
}))
vi.mock('../../../hooks/useTokenWatchlist', () => ({
  useTokenWatchlist: () => ({
    chainId: 137,
    entries: h.entries,
    addToken: h.addToken,
    removeToken: h.removeToken,
    isWatched: () => false,
  }),
}))
vi.mock('../../../hooks/useTokenBalances', () => ({
  useTokenBalances: () => ({ balances: {} }),
  balanceKey: (c, a) => `${c}:${String(a).toLowerCase()}`,
}))
vi.mock('../../ui/PremiumPurchaseModal', () => ({ default: () => null }))
vi.mock('../AddTokenDialog', () => ({ default: () => <div data-testid="add-token-dialog" /> }))

import WatchedTokensPanel from '../WatchedTokensPanel'

beforeEach(() => {
  h.membership = { isActive: true, tier: 2 }
  h.loading = false
  h.entries = []
  h.removeToken.mockClear()
  h.addToken.mockClear()
  h.showModal.mockClear()
})

describe('WatchedTokensPanel (Spec 034)', () => {
  it('shows an honest gated state for a connected non-member (FR-023)', () => {
    h.membership = { isActive: false, tier: 0 }
    render(<WatchedTokensPanel />)
    expect(screen.getByText(/active membership is required/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /get a membership/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add token/i })).toBeNull()
  })

  it('shows a loading state while membership resolves', () => {
    h.loading = true
    render(<WatchedTokensPanel />)
    expect(screen.getByText(/checking your membership/i)).toBeInTheDocument()
  })

  it('shows an empty watchlist + Add control for a member', () => {
    render(<WatchedTokensPanel />)
    expect(screen.getByText(/aren’t watching any tokens/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add token/i })).toBeInTheDocument()
  })

  it('renders watched rows and removes on click (FR-009/FR-005)', () => {
    h.entries = [
      { address: '0x1111111111111111111111111111111111111111', chainId: 137, source: 'registry', symbol: 'USDC', name: 'USD Coin', decimals: 6, addedAt: 1 },
    ]
    render(<WatchedTokensPanel />)
    expect(screen.getByText('USDC')).toBeInTheDocument()
    // Balance unavailable (no balances mocked) renders as "—", never a fake 0.
    expect(screen.getByLabelText(/usdc balance/i)).toHaveTextContent('—')
    fireEvent.click(screen.getByRole('button', { name: /remove usdc/i }))
    expect(h.removeToken).toHaveBeenCalledWith('0x1111111111111111111111111111111111111111', 137)
  })
})
