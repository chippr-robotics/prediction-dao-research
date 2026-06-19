import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../components/ui/BlockiesAvatar', () => ({ default: () => <div data-testid="avatar" /> }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWalletConnection: () => ({ disconnectWallet: vi.fn() }),
}))

const stats = {
  summary: {
    netPnlUsd: 1200, winRate: 0.6, wins: 6, losses: 4,
    totalWageredUsd: 5000, activeWagers: 3, atStakeUsd: 250, walletBalanceUsd: 800,
  },
  series: {
    range: '30D',
    points: [
      { timestamp: 1_000_000, cumulativeUsd: -100, deltaUsd: -100, kind: 'deposit' },
      { timestamp: 2_000_000, cumulativeUsd: 150, deltaUsd: 250, kind: 'payout' },
    ],
    isEmpty: false, isLowData: false, endValueUsd: 150,
  },
  setRange: vi.fn(),
  breakdowns: {
    byStatus: [{ status: 'active', count: 3, active: true }, { status: 'resolved', count: 7, active: false }],
    byToken: [{ tokenAddress: '0xusdc', symbol: 'USDC', count: 10, ownStakeUsd: 5000 }],
    byOracle: [{ resolutionType: 1, label: 'Polymarket', count: 10 }],
  },
  activity: [
    { id: 'a', direction: 'payout', amount: 190, symbol: 'USDC', usdValue: 190, timestamp: 2_000_000, txHash: '0xabc', wagerId: '1' },
  ],
  isConnected: true, isSupportedNetwork: true, chainId: 80002,
  isLoading: false, isEmpty: false, error: null,
  freshness: { summary: { lastUpdated: Date.now(), status: 'fresh' } },
  refresh: vi.fn(),
}

vi.mock('../../hooks/useAccountStats', () => ({ useAccountStats: () => stats }))

// Import after mocks are registered.
const { default: AccountDashboard } = await import('../../components/account/AccountDashboard')

describe('AccountDashboard accessibility (spec 020 FR-018)', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <AccountDashboard address="0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed" />
      </MemoryRouter>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('range selector buttons are keyboard-focusable controls', async () => {
    const { getAllByRole } = render(
      <MemoryRouter>
        <AccountDashboard address="0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed" />
      </MemoryRouter>,
    )
    const buttons = getAllByRole('button', { name: /^(7D|30D|90D|All)$/ })
    expect(buttons.length).toBe(4)
  })
})
