/**
 * EarnPanel tests (spec 050 US1/US3) — hub areas, attribution + risk
 * disclosure + docs link, honest unavailable state on non-earn networks,
 * and deep-link consumption (?view=, ?chain=, ?token=).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockWallet = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet.current,
}))

const mockVaults = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useEarnVaults', () => ({
  useEarnVaults: () => mockVaults.current,
  default: () => mockVaults.current,
}))

const mockPositions = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useEarnPositions', () => ({
  useEarnPositions: () => mockPositions.current,
  default: () => mockPositions.current,
}))

const mockRewards = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useEarnRewards', () => ({
  useEarnRewards: () => mockRewards.current,
  default: () => mockRewards.current,
}))

import EarnPanel from '../../components/earn/EarnPanel'

const USDC_VAULT = {
  address: '0x00000000000000000000000000000000000000a1',
  chainId: 137,
  name: 'Prime USDC Vault',
  symbol: 'mUSDC',
  asset: { address: '0xusdc', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  netApy: 0.043,
  apy: 0.031,
  rewards: [],
  totalAssetsUsd: 12_000_000,
  curator: 'Prime Curation',
}
const ETH_VAULT = {
  ...USDC_VAULT,
  address: '0x00000000000000000000000000000000000000a2',
  name: 'Blue ETH Vault',
  asset: { address: '0xweth', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
}

function renderPanel(path = '/wallet?tab=earn') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EarnPanel />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockWallet.current = { chainId: 137, address: '0xac', isConnected: true, signer: null, switchNetwork: vi.fn() }
  mockVaults.current = { vaults: [USDC_VAULT, ETH_VAULT], status: 'ready', isSupported: true, refresh: vi.fn() }
  mockPositions.current = { positions: [], userStates: new Map(), status: 'ready', refresh: vi.fn() }
  mockRewards.current = {
    rewards: [],
    status: 'ready',
    fetchedAt: Date.now(),
    totalClaimable: 0,
    claim: vi.fn(),
    claimState: { status: 'idle', txUrl: null, error: null },
    legacyRewardsUrl: 'https://rewards-legacy.morpho.org/',
    refresh: vi.fn(),
  }
})

describe('EarnPanel hub (US1)', () => {
  it('shows all earning areas with future ones honestly disabled', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /^Lend/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Rewards/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Stake/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Bridges/ })).toBeDisabled()
    expect(screen.getAllByText(/not available in the app yet/i).length).toBeGreaterThan(0)
  })

  it('displays protocol attribution, risk disclosure, and the docs link (FR-012/FR-014)', () => {
    renderPanel()
    const attribution = screen.getByRole('link', { name: /powered by morpho/i })
    expect(attribution).toHaveAttribute('href', 'https://app.morpho.org')
    expect(screen.getByText(/not guaranteed/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /earn guide/i })).toHaveAttribute(
      'href',
      expect.stringContaining('docs.FairWins.app'),
    )
  })

  it('opens the lend view from the Lend area card', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /^Lend/ }))
    expect(screen.getByText('Prime USDC Vault')).toBeInTheDocument()
    expect(screen.getByText('Blue ETH Vault')).toBeInTheDocument()
  })
})

describe('EarnPanel honest unavailable state (US1/AS5, FR-008)', () => {
  it('explains unavailability and names earn-enabled networks on Mordor', () => {
    mockWallet.current = { ...mockWallet.current, chainId: 63 }
    mockVaults.current = { vaults: [], status: 'unsupported', isSupported: false, refresh: vi.fn() }
    renderPanel()
    expect(screen.getByText(/not available on Ethereum Classic Mordor/i)).toBeInTheDocument()
    expect(screen.getByText(/Ethereum and Polygon/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Lend/ })).toBeDisabled()
  })
})

describe('EarnPanel deep links (US3)', () => {
  it('lands on the lend view prefiltered by ?token= with a clear affordance', () => {
    renderPanel('/wallet?tab=earn&view=lend&chain=137&token=USDC')
    expect(screen.getByText('Prime USDC Vault')).toBeInTheDocument()
    expect(screen.queryByText('Blue ETH Vault')).not.toBeInTheDocument()
    // Clearing the filter restores the full list.
    fireEvent.click(screen.getByRole('button', { name: /USDC only/i }))
    expect(screen.getByText('Blue ETH Vault')).toBeInTheDocument()
  })

  it('offers a network switch when ?chain= names a different network', () => {
    renderPanel('/wallet?tab=earn&view=lend&chain=1&token=USDC')
    expect(screen.getByText(/wallet is on Polygon/i)).toBeInTheDocument()
    const switchBtn = screen.getByRole('button', { name: /switch to Ethereum/i })
    fireEvent.click(switchBtn)
    expect(mockWallet.current.switchNetwork).toHaveBeenCalledWith(1)
  })

  it('lands on the rewards view via ?view=rewards', () => {
    renderPanel('/wallet?tab=earn&view=rewards')
    expect(screen.getByText(/nothing to claim yet/i)).toBeInTheDocument()
  })
})
