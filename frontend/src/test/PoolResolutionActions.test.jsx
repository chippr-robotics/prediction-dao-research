import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ethers } from 'ethers'
import PoolResolutionActions from '../components/pools/PoolResolutionActions'
import { payoutMatrixHash } from '../lib/pools/payout'

// Resolution UI (spec 034, address-based): no manual "add winner" row, no claim code — a member's
// wallet ADDRESS is their identity in the payout matrix. The creator enters an amount per member,
// proposes AND can revise, members receive/verify + can suggest an alternative split, and claiming is
// one tap (the app picks the row whose winner == the connected wallet). Wired through a mocked
// usePools + wallet.

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
import { useWallet } from '../hooks/useWalletManagement'

const W1 = '0x1111111111111111111111111111111111111111'   // Silent Owl
const ACCOUNT = '0x2222222222222222222222222222222222222222' // connected wallet = Amber Fox (a winner)

const baseSummary = {
  address: '0x00000000000000000000000000000000000000aa',
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  buyIn: ethers.parseUnits('10', 6),
  frozenDenominator: 2,
  memberCount: 2,
}

const participants = [
  { address: W1, nickname: { label: 'Silent Owl', suffix: '0a' } },
  { address: ACCOUNT, nickname: { label: 'Amber Fox', suffix: '0b' } },
]

function mockPools(over = {}) {
  return {
    status: 'idle',
    proposeOutcome: vi.fn().mockResolvedValue('0xtx'),
    claimWinnings: vi.fn().mockResolvedValue('0xtx'),
    ...over,
  }
}

describe('PoolResolutionActions (address-based)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    useWallet.mockReturnValue({ account: ACCOUNT, isConnected: true })
  })

  it('the creator builder has one amount row per participant and NO "add winner"/claim-code control', () => {
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, isCreator: true, state: 1, withinResolutionWindow: true }}
        pools={mockPools()}
        participants={participants}
        rankOrder={[W1, ACCOUNT]}
      />
    )
    expect(screen.getByTestId('propose-nick-0')).toHaveTextContent('Silent Owl')
    expect(screen.getByTestId('propose-nick-1')).toHaveTextContent('Amber Fox')
    expect(screen.queryByRole('button', { name: /add winner/i })).toBeNull()
    // No payout-code inputs — the member's address is their identity.
    expect(screen.queryByLabelText(/payout code/i)).toBeNull()
  })

  it('creator propose is gated until the amounts sum to the escrow, then proposes', async () => {
    const pools = mockPools()
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, isCreator: true, state: 1, withinResolutionWindow: true }}
        pools={pools}
        participants={participants}
        rankOrder={[W1, ACCOUNT]}
      />
    )
    fireEvent.change(screen.getByLabelText('Amount for Silent Owl'), { target: { value: '10' } })
    // Only 10 of 20 allocated → still disabled.
    expect(screen.getByTestId('propose-outcome')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Amount for Amber Fox'), { target: { value: '10' } })
    await waitFor(() => expect(screen.getByTestId('propose-outcome')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('propose-outcome'))
    // The creator now commits the FULL matrix on-chain (validated by the contract), not just its hash.
    await waitFor(() => expect(pools.proposeOutcome).toHaveBeenCalled())
    const [addr, entriesArg] = pools.proposeOutcome.mock.calls[0]
    expect(addr).toBe(baseSummary.address)
    expect(entriesArg).toHaveLength(2)
    for (const e of entriesArg) {
      expect(e.winner).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(typeof e.amount).toBe('bigint')
    }
  })

  it('the builder says "Update the proposed payout" and prefills amounts when revising', () => {
    const entries = [
      { winner: W1, amount: '12000000' },
      { winner: ACCOUNT, amount: '8000000' },
    ]
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, isCreator: true, state: 1, withinResolutionWindow: true, currentProposalId: payoutMatrixHash(entries) }}
        pools={mockPools()}
        participants={participants}
        rankOrder={[W1, ACCOUNT]}
        verifiedProposal={{ entries }}
      />
    )
    expect(screen.getByRole('heading', { name: /update the proposed payout/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Amount for Silent Owl')).toHaveValue(12)
    expect(screen.getByLabelText('Amount for Amber Fox')).toHaveValue(8)
  })

  it('a member receives + verifies the shared payout; onProposalReceived fires only when it matches', () => {
    const entries = [
      { winner: W1, amount: '10000000' },
      { winner: ACCOUNT, amount: '10000000' },
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
    fireEvent.change(box, { target: { value: JSON.stringify([{ winner: W1, amount: '20000000' }]) } })
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
    const entries = [{ winner: W1, amount: '20000000' }]
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, hasJoined: true, state: 1, withinResolutionWindow: true, currentProposalId: payoutMatrixHash(entries) }}
        pools={mockPools()}
        participants={participants}
        verifiedProposal={{ entries }}
      />
    )
    fireEvent.click(screen.getByTestId('dispute-toggle'))
    expect(screen.getByTestId('dispute-builder')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Suggested amount for Silent Owl'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /copy my suggestion/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Silent Owl: 20 USDC')))
  })

  it('claiming is one tap: auto-detects the row by connected wallet and pays it', async () => {
    const entries = [
      { winner: W1, amount: '10000000' },
      { winner: ACCOUNT, amount: '10000000' },
    ]
    const pools = mockPools()
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, hasJoined: true, state: 2 }}
        pools={pools}
        participants={participants}
        verifiedProposal={{ entries }}
        payoutByAddress={new Map([[ACCOUNT.toLowerCase(), 10000000n]])}
      />
    )
    expect(screen.getByTestId('claim-amount')).toHaveTextContent('10.0 USDC')
    fireEvent.click(screen.getByTestId('claim'))
    await waitFor(() => expect(pools.claimWinnings).toHaveBeenCalled())
    const arg = pools.claimWinnings.mock.calls[0][1]
    expect(arg.index).toBe(1) // the connected wallet is row 1
    expect(arg.recipient).toBe(ACCOUNT)
  })
})
