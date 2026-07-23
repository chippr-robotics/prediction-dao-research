/**
 * Spec 066 (T023): the StakeSheet discloses the LIQUID platform fee (rate + net) before
 * signing, shows none for delegated (fee-free v1) or a zero rate, and blocks submit when
 * the fee is unreadable (feeBlocked) — never proceeding on an assumed rate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const stakeFn = vi.fn(() => Promise.resolve({ txHash: '0x1', txUrl: null }))
vi.mock('../../hooks/useStakingActions', () => ({
  useStakingActions: () => ({
    stake: stakeFn,
    requestUnstake: vi.fn(),
    withdraw: vi.fn(),
    claimRewards: vi.fn(),
    address: '0xabc',
    canTransactOn: () => true,
    cannotTransactReason: () => '',
    isPasskey: false,
  }),
}))
vi.mock('../../hooks/useActivity', () => ({ useActivityOptional: () => null }))
vi.mock('../../data/ledger', () => ({ captureStakingAction: vi.fn() }))
vi.mock('../../lib/staking/stakingActivityBuffer', () => ({ queueStakingAction: vi.fn() }))

import StakeSheet from '../../components/earn/StakeSheet'

const ROUTER = '0x1111111111111111111111111111111111111111'
const base = {
  id: 'liquid:lido',
  chainId: 1,
  model: 'liquid',
  providerKind: 'lido',
  asset: { symbol: 'ETH', decimals: 18 },
  provider: { name: 'Lido' },
  lstSymbol: 'wstETH',
  instantExit: false,
  contracts: {},
}
const userState = { walletBalanceRaw: 10n * 10n ** 18n }

function renderSheet(option) {
  return render(<StakeSheet option={option} userState={userState} position={null} onClose={() => {}} onActionComplete={() => {}} />)
}

beforeEach(() => stakeFn.mockClear())

describe('StakeSheet — LIQUID fee disclosure', () => {
  it('shows the fee line (rate + net) once an amount is entered', () => {
    renderSheet({ ...base, stakingRouterAddress: ROUTER, feeQuote: { available: true, bps: 50, capBps: 250 } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1' } })
    expect(screen.getByText(/FairWins platform fee \(0\.50%\)/)).toBeInTheDocument()
    expect(screen.getByText('You stake')).toBeInTheDocument()
    // 1 ETH * 50bps = 0.005 fee, 0.995 net
    expect(screen.getByText(/0\.995 ETH/)).toBeInTheDocument()
  })

  it('shows no fee line for a zero rate (byte-identical to fee-free)', () => {
    renderSheet({ ...base, stakingRouterAddress: ROUTER, feeQuote: { available: true, bps: 0 } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1' } })
    expect(screen.queryByText(/FairWins platform fee/)).not.toBeInTheDocument()
  })

  it('shows no fee line for delegated staking (fee-free v1)', () => {
    const delegated = {
      id: 'delegated:1', chainId: 1, model: 'delegated', providerKind: 'validator-share',
      asset: { symbol: 'POL', decimals: 18 }, provider: { name: 'Polygon PoS' },
      validatorName: 'Kiln', validatorShare: '0x5555555555555555555555555555555555555555',
      unbondingLabel: '~2–4 days', stakingRouterAddress: ROUTER, feeQuote: { available: true, bps: 50 },
    }
    renderSheet(delegated)
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1' } })
    expect(screen.queryByText(/FairWins platform fee/)).not.toBeInTheDocument()
  })

  it('blocks submit when the fee is unreadable (feeBlocked) and never calls stake', () => {
    renderSheet({ ...base, stakingRouterAddress: ROUTER, feeBlocked: true })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1' } })
    const submit = screen.getByRole('button', { name: /Stake ETH/ })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(stakeFn).not.toHaveBeenCalled()
  })
})
