/**
 * EarnRewardsView tests (spec 050 US2) — claimable/pending display,
 * freshness copy, claim disabled at zero, explicit unavailable state
 * (never a fabricated zero), empty-state education, legacy link.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockRewards = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useEarnRewards', () => ({
  useEarnRewards: () => mockRewards.current,
  default: () => mockRewards.current,
}))

import EarnRewardsView from '../../components/earn/EarnRewardsView'

const MORPHO_REWARD = {
  token: { address: '0xmorpho', symbol: 'MORPHO', decimals: 18 },
  amount: 2_000_000_000_000_000_000n,
  claimed: 500_000_000_000_000_000n,
  claimable: 1_500_000_000_000_000_000n,
  pending: 100_000_000_000_000_000n,
  proofs: ['0xaa'],
  fetchedAt: 1_752_000_000_000,
}

const baseApi = () => ({
  rewards: [MORPHO_REWARD],
  status: 'ready',
  fetchedAt: 1_752_000_000_000,
  totalClaimable: 1,
  claim: vi.fn(),
  claimState: { status: 'idle', txUrl: null, error: null },
  legacyRewardsUrl: 'https://rewards-legacy.morpho.org/',
  refresh: vi.fn(),
})

beforeEach(() => {
  mockRewards.current = baseApi()
})

describe('EarnRewardsView (US2)', () => {
  it('lists claimable and pending amounts with freshness copy', () => {
    render(<EarnRewardsView />)
    expect(screen.getByText('MORPHO')).toBeInTheDocument()
    expect(screen.getByText(/1\.5 MORPHO ready to claim/i)).toBeInTheDocument()
    expect(screen.getByText(/0\.1 MORPHO building up/i)).toBeInTheDocument()
    expect(screen.getByText(/updates every few hours/i)).toBeInTheDocument()
  })

  it('claims via the hook and reflects confirmation from the tx receipt', () => {
    render(<EarnRewardsView />)
    fireEvent.click(screen.getByRole('button', { name: /claim rewards/i }))
    expect(mockRewards.current.claim).toHaveBeenCalledTimes(1)

    mockRewards.current = {
      ...baseApi(),
      claimState: { status: 'confirmed', txUrl: 'https://polygonscan.com/tx/0xh', error: null },
    }
    render(<EarnRewardsView />)
    expect(screen.getByText(/rewards claimed/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view transaction/i })).toHaveAttribute(
      'href',
      'https://polygonscan.com/tx/0xh',
    )
  })

  it('disables Claim when nothing is claimable (no wallet no-ops)', () => {
    mockRewards.current = {
      ...baseApi(),
      rewards: [{ ...MORPHO_REWARD, claimable: 0n }],
      totalClaimable: 0,
    }
    render(<EarnRewardsView />)
    expect(screen.getByRole('button', { name: /claim rewards/i })).toBeDisabled()
  })

  it('explains accrual in the empty state', () => {
    mockRewards.current = { ...baseApi(), rewards: [], totalClaimable: 0 }
    render(<EarnRewardsView />)
    expect(screen.getByText(/nothing to claim yet/i)).toBeInTheDocument()
    expect(screen.getByText(/build up over time/i)).toBeInTheDocument()
  })

  it('shows an explicit unavailable state on fetch failure — never a zero (US2/AS4)', () => {
    mockRewards.current = { ...baseApi(), rewards: [], status: 'unavailable', totalClaimable: 0 }
    render(<EarnRewardsView />)
    expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
    expect(screen.queryByText(/nothing to claim yet/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(mockRewards.current.refresh).toHaveBeenCalled()
  })

  it('links to the legacy rewards page', () => {
    render(<EarnRewardsView />)
    expect(screen.getByRole('link', { name: /legacy rewards page/i })).toHaveAttribute(
      'href',
      'https://rewards-legacy.morpho.org/',
    )
  })
})
