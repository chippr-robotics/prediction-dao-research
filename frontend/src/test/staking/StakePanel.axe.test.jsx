/**
 * Staking accessibility tests (spec 065, FR-017/SC-008) — the Stake option
 * list and the stake sheet render with no axe violations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'

const mockWallet = vi.hoisted(() => ({ current: { address: '0xabc', isConnected: true } }))
vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => mockWallet.current }))

const mockOptions = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useStakingOptions', () => ({
  useStakingOptions: () => mockOptions.current,
  default: () => mockOptions.current,
}))
const mockPositions = vi.hoisted(() => ({ current: { positions: [], states: new Map(), status: 'ready', refresh: () => {} } }))
vi.mock('../../hooks/useStakingPositions', () => ({
  useStakingPositions: () => mockPositions.current,
  default: () => mockPositions.current,
}))
const mockActions = vi.hoisted(() => ({
  current: { stake: vi.fn(), address: '0xabc', canTransactOn: () => true, cannotTransactReason: () => '', isPasskey: false },
}))
vi.mock('../../hooks/useStakingActions', () => ({
  useStakingActions: () => mockActions.current,
  default: () => mockActions.current,
}))

import StakeView from '../../components/earn/StakeView'
import StakeSheet from '../../components/earn/StakeSheet'

const LIDO = {
  id: 'liquid:lido',
  chainId: 1,
  model: 'liquid',
  providerKind: 'lido',
  asset: { symbol: 'ETH', decimals: 18 },
  provider: { name: 'Lido', url: '#' },
  lstSymbol: 'wstETH',
  instantExit: false,
  rewardRateApr: 0.032,
  totalStaked: { raw: null, usd: null },
  unbondingLabel: null,
}

beforeEach(() => {
  mockOptions.current = { options: [LIDO], status: 'ready', refresh: () => {} }
})

describe('staking accessibility (spec 065)', () => {
  it('StakeView has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <StakeView />
      </MemoryRouter>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('StakeSheet has no axe violations', async () => {
    const { container } = render(
      <StakeSheet option={LIDO} userState={{ walletBalanceRaw: 10n ** 19n }} onClose={() => {}} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
