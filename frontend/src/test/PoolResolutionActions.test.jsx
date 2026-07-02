import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ethers } from 'ethers'
import PoolResolutionActions from '../components/pools/PoolResolutionActions'

// US1 resolution UI (spec 034): reveal claim code, creator propose-builder (sum must equal escrow),
// winner claim. Wired through a mocked usePools.

const baseSummary = {
  address: '0x00000000000000000000000000000000000000aa',
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  buyIn: ethers.parseUnits('10', 6),
  frozenDenominator: 2,
  memberCount: 2,
}

function mockPools(over = {}) {
  return {
    status: 'idle',
    proposeOutcome: vi.fn().mockResolvedValue('0xtx'),
    claimWinnings: vi.fn().mockResolvedValue('0xtx'),
    getMyClaimCode: vi.fn().mockResolvedValue('123456789'),
    getPoolSummary: vi.fn(),
    ...over,
  }
}

describe('PoolResolutionActions (US1)', () => {
  it('a joined member can reveal their claim code', async () => {
    const pools = mockPools()
    render(<PoolResolutionActions summary={{ ...baseSummary, hasJoined: true, state: 1, withinResolutionWindow: true }} pools={pools} />)
    fireEvent.click(screen.getByRole('button', { name: /reveal my claim code/i }))
    expect(await screen.findByTestId('my-claim-code')).toHaveTextContent('123456789')
  })

  it('auto-shows the claim code from the device cache without a click (tester feedback)', async () => {
    const pools = mockPools({
      peekPoolIdentity: vi.fn().mockResolvedValue({ commitment: '1', claimCode: '424242', nickname: null }),
    })
    render(<PoolResolutionActions summary={{ ...baseSummary, hasJoined: true, state: 1, withinResolutionWindow: true }} pools={pools} />)
    expect(await screen.findByTestId('my-claim-code')).toHaveTextContent('424242')
    expect(screen.queryByRole('button', { name: /reveal my claim code/i })).toBeNull()
  })

  it('creator propose is gated until the matrix sums to the escrow', async () => {
    const pools = mockPools()
    render(
      <PoolResolutionActions
        summary={{ ...baseSummary, isCreator: true, state: 1, withinResolutionWindow: true }}
        pools={pools}
      />
    )
    // escrow = 2 * 10 = 20 USDC. One row of 10 -> incomplete sum -> propose disabled.
    fireEvent.change(screen.getByLabelText('Claim code 1'), { target: { value: '111' } })
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '10' } })
    expect(screen.getByTestId('propose-outcome')).toBeDisabled()

    // add a second winner for the remaining 10 -> sum matches -> enabled + proposes
    fireEvent.click(screen.getByRole('button', { name: /add winner/i }))
    fireEvent.change(screen.getByLabelText('Claim code 2'), { target: { value: '222' } })
    fireEvent.change(screen.getByLabelText('Amount 2'), { target: { value: '10' } })
    await waitFor(() => expect(screen.getByTestId('propose-outcome')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('propose-outcome'))
    await waitFor(() => expect(pools.proposeOutcome).toHaveBeenCalledWith(baseSummary.address, expect.stringMatching(/^0x[0-9a-f]{64}$/)))
  })

  it('a winner claims by pasting the matrix + recipient', async () => {
    const pools = mockPools()
    render(<PoolResolutionActions summary={{ ...baseSummary, state: 2 }} pools={pools} />)
    fireEvent.change(screen.getByLabelText(/payout matrix/i), {
      target: { value: '[{"claimNullifier":"111","amount":"20000000"}]' },
    })
    fireEvent.change(screen.getByLabelText(/pay to address/i), {
      target: { value: '0x1111111111111111111111111111111111111111' },
    })
    fireEvent.click(screen.getByTestId('claim'))
    await waitFor(() => expect(pools.claimWinnings).toHaveBeenCalled())
    expect(pools.claimWinnings.mock.calls[0][1].recipient).toBe('0x1111111111111111111111111111111111111111')
  })
})
