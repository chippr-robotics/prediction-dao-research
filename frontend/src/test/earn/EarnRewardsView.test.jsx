/**
 * EarnRewardsView tests (spec 050 US2) — network-transparent rewards:
 * per-network groups with claim actions, freshness copy, claim disabled at
 * zero, explicit unavailable state (never a fabricated zero), partial-failure
 * honesty, empty-state education, legacy link.
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
  chainId: 137,
  token: { address: '0xmorpho', symbol: 'MORPHO', decimals: 18 },
  amount: 2_000_000_000_000_000_000n,
  claimed: 500_000_000_000_000_000n,
  claimable: 1_500_000_000_000_000_000n,
  pending: 100_000_000_000_000_000n,
  proofs: ['0xaa'],
  fetchedAt: 1_752_000_000_000,
}

const ETH_REWARD = {
  ...MORPHO_REWARD,
  chainId: 1,
  token: { address: '0xarb', symbol: 'WELL', decimals: 18 },
}

const baseApi = () => ({
  rewards: [MORPHO_REWARD, ETH_REWARD],
  failedNetworks: [],
  status: 'ready',
  fetchedAt: 1_752_000_000_000,
  totalClaimable: 2,
  claim: vi.fn(),
  claimState: { status: 'idle', chainId: null, txUrl: null, error: null },
  canTransactOn: () => true,
  cannotTransactReason: (id) => `Passkey accounts can't send transactions on chain ${id} yet`,
  legacyRewardsUrl: 'https://rewards-legacy.morpho.org/',
  refresh: vi.fn(),
})

beforeEach(() => {
  mockRewards.current = baseApi()
})

describe('EarnRewardsView (US2, network-transparent)', () => {
  it('groups rewards per network with claimable/pending amounts and freshness copy', () => {
    render(<EarnRewardsView />)
    expect(screen.getByRole('region', { name: /rewards on polygon/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /rewards on ethereum/i })).toBeInTheDocument()
    expect(screen.getAllByText(/1\.5 (MORPHO|WELL) ready to claim/i)).toHaveLength(2)
    expect(screen.getByText(/updates every few hours/i)).toBeInTheDocument()
  })

  it('claims per network — the hook handles any network switch itself', () => {
    render(<EarnRewardsView />)
    fireEvent.click(screen.getByRole('button', { name: /claim on ethereum/i }))
    expect(mockRewards.current.claim).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: /claim on polygon/i }))
    expect(mockRewards.current.claim).toHaveBeenCalledWith(137)
  })

  it('reflects confirmation from the tx outcome on the claimed network only', () => {
    mockRewards.current = {
      ...baseApi(),
      claimState: { status: 'confirmed', chainId: 137, txUrl: 'https://polygonscan.com/tx/0xh', error: null },
    }
    render(<EarnRewardsView />)
    expect(screen.getByText(/rewards claimed/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view transaction/i })).toHaveAttribute(
      'href',
      'https://polygonscan.com/tx/0xh',
    )
    // The other network's group still offers its own claim.
    expect(screen.getByRole('button', { name: /claim on ethereum/i })).toBeEnabled()
  })

  it('disables Claim when nothing is claimable (no wallet no-ops)', () => {
    mockRewards.current = {
      ...baseApi(),
      rewards: [{ ...MORPHO_REWARD, claimable: 0n }],
      totalClaimable: 0,
    }
    render(<EarnRewardsView />)
    expect(screen.getByRole('button', { name: /claim on polygon/i })).toBeDisabled()
  })

  it('discloses when a passkey session cannot claim on a network', () => {
    mockRewards.current = { ...baseApi(), rewards: [ETH_REWARD], canTransactOn: () => false }
    render(<EarnRewardsView />)
    expect(screen.getByRole('button', { name: /claim on ethereum/i })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent(/passkey accounts can't send transactions/i)
  })

  it('explains accrual in the empty state', () => {
    mockRewards.current = { ...baseApi(), rewards: [], totalClaimable: 0 }
    render(<EarnRewardsView />)
    expect(screen.getByText(/nothing to claim yet/i)).toBeInTheDocument()
    expect(screen.getByText(/build up over time/i)).toBeInTheDocument()
  })

  it('shows an explicit unavailable state on total failure — never a zero (US2/AS4)', () => {
    mockRewards.current = { ...baseApi(), rewards: [], status: 'unavailable', totalClaimable: 0 }
    render(<EarnRewardsView />)
    expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
    expect(screen.queryByText(/nothing to claim yet/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(mockRewards.current.refresh).toHaveBeenCalled()
  })

  it('names networks that could not be checked (partial failure honesty)', () => {
    mockRewards.current = { ...baseApi(), rewards: [MORPHO_REWARD], failedNetworks: ['Ethereum'] }
    render(<EarnRewardsView />)
    expect(screen.getByText(/couldn.t check ethereum right now/i)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /rewards on polygon/i })).toBeInTheDocument()
  })

  it('links to the legacy rewards page', () => {
    render(<EarnRewardsView />)
    expect(screen.getByRole('link', { name: /legacy rewards page/i })).toHaveAttribute(
      'href',
      'https://rewards-legacy.morpho.org/',
    )
  })
})
