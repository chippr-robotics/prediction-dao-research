/**
 * Earn section WCAG 2.1 AA audits (spec 050, FR-015 / SC-007) — hub, lend
 * view with vaults + positions, vault sheet, and rewards view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
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
import VaultSheet from '../../components/earn/VaultSheet'

const VAULT = {
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

const USER_STATE = {
  shares: 10_000_000n,
  assets: 10_000_000n,
  maxWithdrawAssets: 8_000_000n,
  walletBalance: 25_000_000n,
  maxDepositAssets: 0n,
}

beforeEach(() => {
  mockWallet.current = { chainId: 137, address: '0xac', isConnected: true, signer: null, switchNetwork: vi.fn() }
  mockVaults.current = { vaults: [VAULT], status: 'ready', isSupported: true, refresh: vi.fn() }
  mockPositions.current = {
    positions: [{ vault: VAULT, shares: 10_000_000n, assets: 10_000_000n, maxWithdrawAssets: 8_000_000n, assetsUsd: 10.0, pnlUsd: 0.12 }],
    userStates: new Map([[VAULT.address.toLowerCase(), USER_STATE]]),
    status: 'ready',
    refresh: vi.fn(),
  }
  mockRewards.current = {
    rewards: [
      {
        token: { address: '0xmorpho', symbol: 'MORPHO', decimals: 18 },
        amount: 2n,
        claimed: 1n,
        claimable: 1n,
        pending: 0n,
        proofs: ['0xaa'],
        fetchedAt: 1,
      },
    ],
    status: 'ready',
    fetchedAt: 1,
    totalClaimable: 1,
    claim: vi.fn(),
    claimState: { status: 'idle', txUrl: null, error: null },
    legacyRewardsUrl: 'https://rewards-legacy.morpho.org/',
    refresh: vi.fn(),
  }
})

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <EarnPanel />
    </MemoryRouter>,
  )

describe('Earn section accessibility (FR-015)', () => {
  it('hub has no axe violations', async () => {
    const { container } = renderAt('/wallet?tab=earn')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('lend view (vaults + positions) has no axe violations', async () => {
    const { container } = renderAt('/wallet?tab=earn&view=lend')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('rewards view has no axe violations', async () => {
    const { container } = renderAt('/wallet?tab=earn&view=rewards')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('vault sheet (deposit + withdraw modes) has no axe violations', async () => {
    const { container } = render(
      <VaultSheet vault={VAULT} userState={USER_STATE} onClose={vi.fn()} onActionComplete={vi.fn()} />,
    )
    expect(await axe(container)).toHaveNoViolations()
    fireEvent.click(screen.getByRole('tab', { name: /withdraw/i }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('unavailable-network state has no axe violations', async () => {
    mockWallet.current = { ...mockWallet.current, chainId: 63 }
    mockVaults.current = { vaults: [], status: 'unsupported', isSupported: false, refresh: vi.fn() }
    const { container } = renderAt('/wallet?tab=earn')
    expect(await axe(container)).toHaveNoViolations()
  })
})
