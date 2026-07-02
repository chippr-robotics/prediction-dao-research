import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ethers } from 'ethers'
import PoolResolutionActions from '../components/pools/PoolResolutionActions'
import { payoutMatrixHash } from '../lib/pools/payout'

// Resolution UI (spec 034, UX round 3): no manual "add winner" row, no raw claim code on screen,
// creator can propose AND revise, members receive/verify + can suggest an alternative split, and
// claiming is one tap. Wired through a mocked usePools + wallet.

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
import { useWallet } from '../hooks/useWalletManagement'

const ACCOUNT = '0x1111111111111111111111111111111111111111'

const baseSummary = {
  address: '0x00000000000000000000000000000000000000aa',
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  buyIn: ethers.parseUnits('10', 6),
  frozenDenominator: 2,
  memberCount: 2,
}

const participants = [
  { commitment: '10', label: 'Silent Owl', suffix: '0a' },
  { commitment: '11', label: 'Amber Fox', suffix: '0b' },
]

function mockPools(over = {}) {
  return {
    status: 'idle',
    proposeOutcome: vi.fn().mockResolvedValue('0xtx'),
    claimWinnings: vi.fn().mockResolvedValue('0xtx'),
    getMyClaimCode: vi.fn().mockResolvedValue('123456789'),
    ...over,
  }
}

describe('PoolResolutionActions (UX round 3)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    useWallet.mockReturnValue({ account: ACCOUNT, isConnected: true })
  })

  it('a member copies their payout code for the creator — the raw code is never shown', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, hasJoined: true, state: 1, withinResolutionWindow: true }}
        pools={mockPools()}
        claimCode="424242"
      />
    )
    // No scary integer on screen.
    expect(screen.queryByText('424242')).toBeNull()
    fireEvent.click(screen.getByTestId('copy-my-code'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('424242'))
  })

  it('the creator builder has one row per participant and NO "add winner" control', () => {
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, isCreator: true, state: 1, withinResolutionWindow: true }}
        pools={mockPools()}
        participants={participants}
        rankOrder={['10', '11']}
      />
    )
    expect(screen.getByTestId('propose-nick-0')).toHaveTextContent('Silent Owl')
    expect(screen.getByTestId('propose-nick-1')).toHaveTextContent('Amber Fox')
    expect(screen.queryByRole('button', { name: /add winner/i })).toBeNull()
  })

  it('creator propose is gated until the amounts sum to the escrow, then proposes', async () => {
    const pools = mockPools()
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, isCreator: true, state: 1, withinResolutionWindow: true }}
        pools={pools}
        participants={participants}
        rankOrder={['10', '11']}
      />
    )
    fireEvent.change(screen.getByLabelText('Payout code from Silent Owl'), { target: { value: '111' } })
    fireEvent.change(screen.getByLabelText('Amount for Silent Owl'), { target: { value: '10' } })
    // Only 10 of 20 allocated → still disabled.
    expect(screen.getByTestId('propose-outcome')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Payout code from Amber Fox'), { target: { value: '222' } })
    fireEvent.change(screen.getByLabelText('Amount for Amber Fox'), { target: { value: '10' } })
    await waitFor(() => expect(screen.getByTestId('propose-outcome')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('propose-outcome'))
    await waitFor(() =>
      expect(pools.proposeOutcome).toHaveBeenCalledWith(baseSummary.address, expect.stringMatching(/^0x[0-9a-f]{64}$/))
    )
  })

  it('the builder says "Update the proposed payout" and prefills amounts when revising', () => {
    const entries = [
      { claimNullifier: '111', amount: '12000000' },
      { claimNullifier: '222', amount: '8000000' },
    ]
    const display = [
      { commitment: '10', amount: '12000000' },
      { commitment: '11', amount: '8000000' },
    ]
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, isCreator: true, state: 1, withinResolutionWindow: true, currentProposalId: payoutMatrixHash(entries) }}
        pools={mockPools()}
        participants={participants}
        rankOrder={['10', '11']}
        verifiedProposal={{ entries, display }}
      />
    )
    expect(screen.getByRole('heading', { name: /update the proposed payout/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Amount for Silent Owl')).toHaveValue(12)
    expect(screen.getByLabelText('Amount for Amber Fox')).toHaveValue(8)
  })

  it('a member receives + verifies the shared payout; onProposalReceived fires only when it matches', () => {
    const entries = [
      { claimNullifier: '111', amount: '10000000' },
      { claimNullifier: '222', amount: '10000000' },
    ]
    const proposalId = payoutMatrixHash(entries)
    const onProposalReceived = vi.fn()
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, hasJoined: true, state: 1, withinResolutionWindow: true, currentProposalId: proposalId }}
        pools={mockPools()}
        participants={participants}
        onProposalReceived={onProposalReceived}
      />
    )
    const box = screen.getByLabelText(/payout the creator shared/i)
    // Tampered payload → rejected, no callback.
    fireEvent.change(box, { target: { value: '[{"claimNullifier":"111","amount":"20000000"}]' } })
    fireEvent.click(screen.getByRole('button', { name: /review payout/i }))
    expect(screen.getByTestId('pool-resolution-notice')).toHaveTextContent(/does not match/i)
    expect(onProposalReceived).not.toHaveBeenCalled()
    // Genuine matrix → accepted.
    fireEvent.change(box, { target: { value: JSON.stringify(entries) } })
    fireEvent.click(screen.getByRole('button', { name: /review payout/i }))
    expect(onProposalReceived).toHaveBeenCalled()
  })

  it('a member can open a dispute builder and copy an alternative split for the creator', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.assign(navigator, { clipboard: { writeText } })
    const entries = [{ claimNullifier: '111', amount: '20000000' }]
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, hasJoined: true, state: 1, withinResolutionWindow: true, currentProposalId: payoutMatrixHash(entries) }}
        pools={mockPools()}
        participants={participants}
        verifiedProposal={{ entries, display: null }}
      />
    )
    fireEvent.click(screen.getByTestId('dispute-toggle'))
    expect(screen.getByTestId('dispute-builder')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Suggested amount for Silent Owl'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /copy my suggestion/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Silent Owl: 20 USDC')))
  })

  it('claiming is one tap: auto-detects the row and pays the connected wallet', async () => {
    const entries = [
      { claimNullifier: '111', amount: '10000000' },
      { claimNullifier: '424242', amount: '10000000' },
    ]
    const pools = mockPools()
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, hasJoined: true, state: 2, myCommitment: '11' }}
        pools={pools}
        participants={participants}
        claimCode="424242"
        verifiedProposal={{ entries, display: [{ commitment: '11', amount: '10000000' }] }}
        payoutByCommitment={new Map([['11', 10000000n]])}
      />
    )
    expect(screen.getByTestId('claim-amount')).toHaveTextContent('10.0 USDC')
    fireEvent.click(screen.getByTestId('claim'))
    await waitFor(() => expect(pools.claimWinnings).toHaveBeenCalled())
    const arg = pools.claimWinnings.mock.calls[0][1]
    expect(arg.index).toBe(1) // 424242 is row 1
    expect(arg.recipient).toBe(ACCOUNT)
  })
})
