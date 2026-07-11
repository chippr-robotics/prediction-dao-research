/**
 * EarnPanel tests (spec 050 US1/US3) — hub areas, attribution + risk
 * disclosure + docs link, network-transparent vault list (all earn networks
 * shown with badges, regardless of the active wallet network — no switch
 * banner), and deep-link consumption (?view=, ?token=).
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
vi.mock('../../hooks/useEarnPositions', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    positionKey: actual.positionKey,
    useEarnPositions: () => mockPositions.current,
    default: () => mockPositions.current,
  }
})

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
  chainId: 1,
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
  // Active wallet network is MORDOR — earn is network-transparent, so the
  // multi-network list must render regardless.
  mockWallet.current = { chainId: 63, address: '0xac', isConnected: true }
  mockVaults.current = { vaults: [USDC_VAULT, ETH_VAULT], status: 'ready', refresh: vi.fn() }
  mockPositions.current = { positions: [], userStates: new Map(), status: 'ready', refresh: vi.fn() }
  mockRewards.current = {
    rewards: [],
    failedNetworks: [],
    status: 'ready',
    fetchedAt: Date.now(),
    totalClaimable: 0,
    claim: vi.fn(),
    claimState: { status: 'idle', chainId: null, txUrl: null, error: null },
    canTransactOn: () => true,
    cannotTransactReason: () => 'not available',
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
})

describe('EarnPanel network transparency (like the portfolio)', () => {
  it('lists vaults from EVERY earn network with their network names — no switch banner', () => {
    renderPanel('/wallet?tab=earn&view=lend')
    expect(screen.getByText('Prime USDC Vault')).toBeInTheDocument()
    expect(screen.getByText(/on Polygon/i)).toBeInTheDocument()
    expect(screen.getByText('Blue ETH Vault')).toBeInTheDocument()
    expect(screen.getByText(/on Ethereum/i)).toBeInTheDocument()
    // The old "switch network" interstitial is gone for good.
    expect(screen.queryByText(/your wallet is on/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /switch to/i })).not.toBeInTheDocument()
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

  it('lands on the rewards view via ?view=rewards', () => {
    renderPanel('/wallet?tab=earn&view=rewards')
    expect(screen.getByText(/nothing to claim yet/i)).toBeInTheDocument()
  })
})
