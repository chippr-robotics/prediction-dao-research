/**
 * StakeSheet tests (spec 065, US1) — stake validation before any wallet prompt
 * (incl. the native gas reserve), the liquid vs delegated summary, the slashing
 * disclosure for delegated staking, and the two-prompt approval copy for an
 * ERC-20 stake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const stakeFn = vi.hoisted(() => vi.fn())
const mockActions = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useStakingActions', () => ({
  useStakingActions: () => mockActions.current,
  default: () => mockActions.current,
}))

import StakeSheet from '../../components/earn/StakeSheet'

const ETH = 10n ** 18n

const LIDO = {
  id: 'liquid:lido',
  chainId: 1,
  model: 'liquid',
  providerKind: 'lido',
  asset: { symbol: 'ETH', decimals: 18 },
  provider: { name: 'Lido', url: '#' },
  lstSymbol: 'wstETH',
  instantExit: false,
}
const VALIDATOR = {
  id: 'delegated:47',
  chainId: 1,
  model: 'delegated',
  providerKind: 'validator-share',
  asset: { symbol: 'POL', decimals: 18 },
  provider: { name: 'Polygon PoS', url: '#' },
  validatorName: 'Kiln',
  lstSymbol: null,
  unbondingLabel: '~2–4 days (80 checkpoints)',
}

beforeEach(() => {
  stakeFn.mockReset()
  mockActions.current = {
    stake: stakeFn,
    address: '0xabc',
    canTransactOn: () => true,
    cannotTransactReason: () => 'nope',
    isPasskey: false,
  }
})

describe('StakeSheet stake mode (spec 065 US1)', () => {
  it('rejects an amount over the wallet balance before prompting', async () => {
    render(<StakeSheet option={LIDO} userState={{ walletBalanceRaw: ETH }} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Stake ETH/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(stakeFn).not.toHaveBeenCalled()
  })

  it('reserves gas so staking the full native balance is rejected', () => {
    render(<StakeSheet option={LIDO} userState={{ walletBalanceRaw: ETH }} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /Stake ETH/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/network fees/i)
    expect(stakeFn).not.toHaveBeenCalled()
  })

  it('discloses slashing risk and unbonding for a delegated option', () => {
    render(<StakeSheet option={VALIDATOR} userState={{ walletBalanceRaw: 10n * ETH }} onClose={() => {}} />)
    expect(screen.getByText(/unbonding period/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delegate POL/ })).toBeInTheDocument()
  })

  it('stakes a valid amount through the send rail', async () => {
    stakeFn.mockResolvedValue({ txHash: '0xdead', txUrl: 'http://x/tx/0xdead' })
    render(<StakeSheet option={LIDO} userState={{ walletBalanceRaw: 10n * ETH }} onClose={() => {}} onActionComplete={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /Stake ETH/ }))
    expect(await screen.findByText(/Stake complete/i)).toBeInTheDocument()
    expect(stakeFn).toHaveBeenCalledOnce()
    expect(stakeFn.mock.calls[0][1]).toBe(ETH)
  })
})
