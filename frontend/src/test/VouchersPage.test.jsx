import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock the data hooks so we can render VouchersPage deterministically (spec 026).
vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: vi.fn(),
}))
vi.mock('../hooks/useVouchers', () => ({
  useVouchers: vi.fn(),
}))
vi.mock('../hooks/useTierPrices', () => ({
  useTierPrices: () => ({
    getPrice: (_role, tier) => ({ BRONZE: 2, SILVER: 8, GOLD: 25, PLATINUM: 100 }[tier]),
    ROLE_HASHES: { WAGER_PARTICIPANT: '0xrole' },
    TIER_IDS: { BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 },
  }),
}))

import { useWallet } from '../hooks/useWalletManagement'
import { useVouchers } from '../hooks/useVouchers'
import VouchersPage from '../pages/VouchersPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <VouchersPage />
    </MemoryRouter>
  )
}

const baseVouchers = {
  status: 'idle',
  error: null,
  lastTxHash: null,
  voucherAvailable: true,
  mintVoucher: vi.fn(),
  redeemVoucher: vi.fn(),
  getVoucher: vi.fn(),
  reset: vi.fn(),
}

describe('VouchersPage (spec 026)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWallet.mockReturnValue({ account: '0x1111111111111111111111111111111111111111', isConnected: true })
  })

  it('renders buy + redeem sections with an honest privacy disclosure when available', () => {
    useVouchers.mockReturnValue(baseVouchers)
    renderPage()
    expect(screen.getByRole('heading', { name: /Membership Vouchers/i })).toBeInTheDocument()
    expect(screen.getByRole('note', { name: /privacy/i })).toBeInTheDocument()
    expect(screen.getByText(/pseudonymity, not cryptographic anonymity/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Buy a voucher/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Redeem a voucher/i })).toBeInTheDocument()
    // All four tiers are offered.
    for (const t of ['Bronze', 'Silver', 'Gold', 'Platinum']) {
      expect(screen.getByText(t)).toBeInTheDocument()
    }
  })

  it('shows an honest "not available on this network" notice when the voucher is undeployed', () => {
    useVouchers.mockReturnValue({ ...baseVouchers, voucherAvailable: false })
    renderPage()
    expect(screen.getByText(/aren’t available on this network yet/i)).toBeInTheDocument()
  })

  it('redirects to landing when the wallet is not connected', () => {
    useWallet.mockReturnValue({ account: null, isConnected: false })
    useVouchers.mockReturnValue(baseVouchers)
    const { container } = renderPage()
    // Navigate renders nothing; the page heading must be absent.
    expect(container.querySelector('.vch-page')).toBeNull()
  })
})
