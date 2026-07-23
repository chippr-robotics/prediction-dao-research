/**
 * StakeSheet exit-mode tests (spec 065, US2) — unbonding disclosure + the
 * acknowledgement gate before the prompt, the sPOL instant-swap note, the
 * "ready to withdraw" action, delegated claim present / liquid claim absent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const unstakeFn = vi.hoisted(() => vi.fn())
const withdrawFn = vi.hoisted(() => vi.fn())
const claimFn = vi.hoisted(() => vi.fn())
const mockActions = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useStakingActions', () => ({
  useStakingActions: () => mockActions.current,
  default: () => mockActions.current,
}))
vi.mock('../../hooks/useActivity', () => ({ useActivityOptional: () => null }))
// Keep the notification/ledger writes inert in the component test.
vi.mock('../../lib/staking/stakingActivityBuffer', () => ({ queueStakingAction: vi.fn() }))
vi.mock('../../data/ledger', () => ({ captureStakingAction: vi.fn() }))

import StakeSheet from '../../components/earn/StakeSheet'

const ETH = 10n ** 18n
const VALIDATOR = {
  id: 'delegated:47',
  chainId: 1,
  model: 'delegated',
  providerKind: 'validator-share',
  asset: { symbol: 'POL', decimals: 18 },
  provider: { name: 'Polygon PoS', url: '#' },
  validatorName: 'Kiln',
  validatorShare: '0xVS',
  lstSymbol: null,
  unbondingLabel: '~2–4 days (80 checkpoints)',
}
const SPOL = {
  id: 'liquid:spol',
  chainId: 1,
  model: 'liquid',
  providerKind: 'spol',
  asset: { symbol: 'POL', decimals: 18 },
  provider: { name: 'sPOL (Polygon)', url: '#' },
  lstSymbol: 'sPOL',
  instantExit: true,
  contracts: { token: '0xtok', controller: '0xctrl' },
}

beforeEach(() => {
  unstakeFn.mockReset().mockResolvedValue({ txHash: '0x1', txUrl: 'http://x/tx/0x1' })
  withdrawFn.mockReset().mockResolvedValue({ txHash: '0x2', txUrl: 'http://x/tx/0x2' })
  claimFn.mockReset().mockResolvedValue({ txHash: '0x3', txUrl: 'http://x/tx/0x3' })
  mockActions.current = {
    stake: vi.fn(),
    requestUnstake: unstakeFn,
    withdraw: withdrawFn,
    claimRewards: claimFn,
    address: '0xabc',
    canTransactOn: () => true,
    cannotTransactReason: () => 'nope',
    isPasskey: false,
  }
})

const stakedPosition = (option, extra = {}) => ({
  option,
  stakedRaw: 5n * ETH,
  pendingUnbonds: [],
  rewardsClaimableRaw: 0n,
  hasReadyWithdrawal: false,
  ...extra,
})

describe('StakeSheet exit modes (spec 065 US2)', () => {
  it('blocks a delegated unstake until the unbonding wait is acknowledged', async () => {
    render(
      <StakeSheet option={VALIDATOR} userState={{ walletBalanceRaw: 0n }} position={stakedPosition(VALIDATOR)} onClose={() => {}} />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Unstake' }))
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /Unstake POL/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/unbonding wait/i)
    expect(unstakeFn).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /Unstake POL/ }))
    expect(await screen.findByText(/Unstake requested/i)).toBeInTheDocument()
    expect(unstakeFn).toHaveBeenCalledOnce()
  })

  it('surfaces the sPOL instant-swap alternative in unstake mode', () => {
    render(<StakeSheet option={SPOL} userState={{ walletBalanceRaw: 0n }} position={stakedPosition(SPOL)} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Unstake' }))
    expect(screen.getByText(/swap sPOL back to POL/i)).toBeInTheDocument()
  })

  it('offers a Withdraw action for a matured exit', async () => {
    const position = stakedPosition(VALIDATOR, {
      pendingUnbonds: [{ handle: { unbondNonce: '7' }, amountRaw: 2n * ETH, ready: true }],
      hasReadyWithdrawal: true,
    })
    render(<StakeSheet option={VALIDATOR} userState={{ walletBalanceRaw: 0n }} position={position} onClose={() => {}} />)
    expect(screen.getByText(/Ready to withdraw/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(await screen.findByText(/Withdrawal complete/i)).toBeInTheDocument()
    expect(withdrawFn).toHaveBeenCalledOnce()
  })

  it('shows a Claim action for delegated rewards but never for liquid', () => {
    const withRewards = stakedPosition(VALIDATOR, { rewardsClaimableRaw: ETH })
    const { rerender } = render(
      <StakeSheet option={VALIDATOR} userState={{ walletBalanceRaw: 0n }} position={withRewards} onClose={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument()

    rerender(
      <StakeSheet option={SPOL} userState={{ walletBalanceRaw: 0n }} position={stakedPosition(SPOL, { rewardsClaimableRaw: ETH })} onClose={() => {}} />,
    )
    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
  })
})
