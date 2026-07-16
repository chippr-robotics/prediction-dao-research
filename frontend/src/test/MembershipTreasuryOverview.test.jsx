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
    expect(screen.getByText(/not deployed \/ configured on this network/i)).toBeInTheDocument()
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
