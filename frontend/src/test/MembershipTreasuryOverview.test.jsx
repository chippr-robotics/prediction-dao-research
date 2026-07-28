import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the stats hook so we render the panel without a live MembershipManager scan.
vi.mock('../hooks/useMembershipTreasuryStats', async () => {
  const actual = await vi.importActual('../hooks/useMembershipTreasuryStats')
  return { ...actual, useMembershipTreasuryStats: vi.fn() }
})

import { useMembershipTreasuryStats } from '../hooks/useMembershipTreasuryStats'
import MembershipTreasuryOverview from '../components/admin/MembershipTreasuryOverview'

const ADDRESS = '0x1111111111111111111111111111111111111111'
const usdc = (n) => BigInt(Math.round(n * 1e6))

const DATA = {
  counts: { purchased: 12, granted: 3, redeemed: 2, extended: 5, upgraded: 1, revoked: 1 },
  revenue: { purchases: usdc(24), extensions: usdc(10), upgrades: usdc(6), total: usdc(40), withdrawn: usdc(30) },
  revenueByTier: { 1: usdc(20), 2: usdc(14), 3: usdc(6), 4: 0n },
  members: { active: 14, everMembers: 18, byTier: { 1: 8, 2: 4, 3: 2, 4: 0 } },
  series: [
    { block: 10, cumulative: usdc(24) },
    { block: 20, cumulative: usdc(34) },
    { block: 30, cumulative: usdc(40) },
  ],
  recent: [],
  truncated: false,
  totalEvents: 24,
}

const provider = { getBlockNumber: vi.fn() }
const baseProps = { provider, chainId: 137, address: ADDRESS, accruedFees: '10' }

describe('MembershipTreasuryOverview (admin overview: membership + treasury)', () => {
  beforeEach(() => {
    useMembershipTreasuryStats.mockReset()
  })

  it('shows a not-configured notice when MembershipManager is undeployed on this network', () => {
    useMembershipTreasuryStats.mockReturnValue({ loading: false, error: null, data: null, truncated: false, refresh: vi.fn() })
    render(<MembershipTreasuryOverview {...baseProps} address="" />)
    expect(screen.getByText(/not deployed \/ configured on the membership network/i)).toBeInTheDocument()
    expect(screen.queryByText('Membership Statistics')).not.toBeInTheDocument()
  })

  it('renders membership statistics and treasury growth from the scanned data', () => {
    const refresh = vi.fn()
    useMembershipTreasuryStats.mockReturnValue({ loading: false, error: null, data: DATA, truncated: false, refresh })
    render(<MembershipTreasuryOverview {...baseProps} />)

    // Headline membership tiles
    expect(screen.getByText('Membership Statistics')).toBeInTheDocument()
    expect(screen.getByText('Active members')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument() // active members
    expect(screen.getByText('Silver active')).toBeInTheDocument()

    // Lifetime counts ("Purchases" also labels a revenue bar, so allow multiple)
    expect(screen.getAllByText('Purchases').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('12')).toBeInTheDocument()

    // Treasury growth headline (revenue total $40, withdrawn $30, accrued live $10).
    // $40.00 also appears in the sparkline caption (latest cumulative), so allow multiple.
    expect(screen.getByText('Treasury Growth')).toBeInTheDocument()
    expect(screen.getAllByText('$40.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('$30.00')).toBeInTheDocument()
    // $10.00 is both the live accrued tile and the extensions revenue bar.
    expect(screen.getAllByText('$10.00').length).toBeGreaterThanOrEqual(1)

    // Sparkline caption reflects the latest cumulative value
    expect(screen.getByText(/Cumulative membership revenue/)).toBeInTheDocument()
  })

  it('surfaces the truncated-window disclosure and scan errors', () => {
    useMembershipTreasuryStats.mockReturnValue({
      loading: false,
      error: 'rpc range too wide',
      data: { ...DATA, truncated: true },
      truncated: true,
      refresh: vi.fn(),
    })
    render(<MembershipTreasuryOverview {...baseProps} />)
    expect(screen.getByText(/Scan failed: rpc range too wide/)).toBeInTheDocument()
    expect(screen.getByText(/most recent block window only/i)).toBeInTheDocument()
    expect(screen.getByText('Active members (window)')).toBeInTheDocument()
  })
})

/**
 * Spec 071 T046/T049 — the panel is PINNED to the membership reference chain, and an unreadable
 * accrued balance is never a zero.
 */
describe('MembershipTreasuryOverview reads the membership chain honestly (T046)', () => {
  beforeEach(() => useMembershipTreasuryStats.mockReset())

  it('scans the chain it was GIVEN — provider, chainId and address must agree', () => {
    useMembershipTreasuryStats.mockReturnValue({ loading: false, error: null, data: DATA, truncated: false, refresh: vi.fn() })
    render(<MembershipTreasuryOverview {...baseProps} chainId={80002} />)
    // The cache key and the scan follow the chain the caller named, not an ambient one. Passing a
    // wallet provider next to the reference chain's address would read one chain's contract at
    // another chain's address — the disagreement this spec exists to end.
    expect(useMembershipTreasuryStats).toHaveBeenCalledWith(
      expect.objectContaining({ provider, chainId: 80002, address: ADDRESS }),
    )
  })

  it('says the accrued balance could not be read, rather than showing $0.00', () => {
    useMembershipTreasuryStats.mockReturnValue({ loading: false, error: null, data: DATA, truncated: false, refresh: vi.fn() })
    render(<MembershipTreasuryOverview {...baseProps} accruedFees="0" accruedFeesReadable={false} />)

    expect(screen.getByText(/could not be read/i)).toBeInTheDocument()
    // A $0.00 accrued balance reads as "the fees were already withdrawn" — an operator acts on it.
    const tile = screen.getByText(/could not be read/i).closest('.mto-tile')
    expect(tile).toHaveTextContent(/Accrued \(undrawn, live\)/i)
    expect(tile).not.toHaveTextContent(/\$0\.00/)
  })

  it('still shows a real zero as a zero when the read succeeded', () => {
    useMembershipTreasuryStats.mockReturnValue({ loading: false, error: null, data: DATA, truncated: false, refresh: vi.fn() })
    render(<MembershipTreasuryOverview {...baseProps} accruedFees="0" accruedFeesReadable />)
    const tile = screen.getByText(/Accrued \(undrawn, live\)/i).closest('.mto-tile')
    expect(tile).toHaveTextContent('$0.00')
  })
})
