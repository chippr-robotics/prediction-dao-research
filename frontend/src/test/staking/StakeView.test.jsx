/**
 * StakeView tests (spec 065, US1) — the option list mirrors the lending list:
 * one card per option with model badge, APR ("—" when null), staked amount,
 * unbonding terms; the token filter narrows the list; the unavailable state
 * disables staking; each concept has an InfoTip.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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

// StakeSheet pulls the send rail — stub it so the list renders in isolation.
vi.mock('../../components/earn/StakeSheet', () => ({ default: () => null }))

import StakeView from '../../components/earn/StakeView'

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
const VALIDATOR = {
  id: 'delegated:47',
  chainId: 1,
  model: 'delegated',
  providerKind: 'validator-share',
  asset: { symbol: 'POL', decimals: 18 },
  provider: { name: 'Polygon PoS', url: '#' },
  validatorName: 'Kiln',
  lstSymbol: null,
  rewardRateApr: null,
  totalStaked: { raw: '1000000000000000000000000', usd: null },
  commissionPct: 5,
  unbondingLabel: '~2–4 days (80 checkpoints)',
}

beforeEach(() => {
  mockOptions.current = { options: [LIDO, VALIDATOR], status: 'ready', refresh: () => {} }
  mockPositions.current = { positions: [], states: new Map(), status: 'ready', refresh: () => {} }
})

function renderView(props = {}) {
  return render(
    <MemoryRouter>
      <StakeView {...props} />
    </MemoryRouter>,
  )
}

describe('StakeView (spec 065 US1)', () => {
  it('renders a card per option with model badge and provider/validator', () => {
    renderView()
    expect(screen.getByText('Lido')).toBeInTheDocument()
    expect(screen.getByText('Kiln')).toBeInTheDocument()
    expect(screen.getAllByText('Liquid').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Delegated').length).toBeGreaterThan(0)
  })

  it('shows APR as a percentage and "—" when unknown', () => {
    renderView()
    expect(screen.getByText('3.20%')).toBeInTheDocument() // Lido
    expect(screen.getByText('—')).toBeInTheDocument() // validator (null APR)
  })

  it('surfaces the delegated unbonding term and commission', () => {
    renderView()
    expect(screen.getByText(/Unbonding ~2–4 days/)).toBeInTheDocument()
    expect(screen.getByText(/5% commission/)).toBeInTheDocument()
  })

  it('filters options by token symbol from a deep link', () => {
    renderView({ tokenFilter: 'ETH' })
    expect(screen.getByText('Lido')).toBeInTheDocument()
    expect(screen.queryByText('Kiln')).not.toBeInTheDocument()
  })

  it('shows an honest unavailable state and no options', () => {
    mockOptions.current = { options: [], status: 'unavailable', refresh: () => {} }
    renderView()
    expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i)
  })

  it('always shows the risk disclosure', () => {
    renderView()
    expect(screen.getByText(/slashing/i)).toBeInTheDocument()
  })
})
