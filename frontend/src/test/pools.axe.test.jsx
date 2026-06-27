import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Accessibility (WCAG 2.1 AA) checks for the ZK-Wager Pool UI (spec 034; constitution Principle V).

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
vi.mock('../hooks/usePools', () => ({ usePools: vi.fn() }))

import { useWallet } from '../hooks/useWalletManagement'
import { usePools } from '../hooks/usePools'
import GroupPoolModal from '../components/fairwins/GroupPoolModal'
import PoolPage from '../pages/PoolPage'
import PoolLeaderboard from '../components/pools/PoolLeaderboard'
import WordListLanguageSelector from '../components/pools/WordListLanguageSelector'

const summary = {
  address: '0x00000000000000000000000000000000000000aa',
  state: 1,
  stateLabel: 'JoiningClosed',
  buyInFormatted: '10.0',
  tokenSymbol: 'USDC',
  memberCount: 2,
  maxMembers: 5,
  slotsRemaining: 3,
  thresholdPct: 60,
  isCreator: true,
  withinResolutionWindow: true,
  currentProposalId: '0xabc',
  hasJoined: true,
  approvalCount: 1,
  requiredApprovals: 2,
}

function poolsMock(overrides = {}) {
  return {
    status: 'idle', error: null,
    createPool: vi.fn(), resolvePhrase: vi.fn(),
    getPoolSummary: vi.fn().mockResolvedValue(summary),
    joinPool: vi.fn(), getMyNickname: vi.fn(),
    closeJoining: vi.fn(), cancelPool: vi.fn(), proposeOutcome: vi.fn(),
    vote: vi.fn(), claimWinnings: vi.fn(), refund: vi.fn(),
    ...overrides,
  }
}

describe('ZK-Wager Pool UI accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWallet.mockReturnValue({ account: '0x1111111111111111111111111111111111111111', isConnected: true })
    usePools.mockReturnValue(poolsMock())
  })

  it('GroupPoolModal (create tab) has no a11y violations', async () => {
    const { container } = render(<MemoryRouter><GroupPoolModal isOpen onClose={() => {}} initialTab="create" /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('GroupPoolModal (join tab) has no a11y violations', async () => {
    const { container } = render(<MemoryRouter><GroupPoolModal isOpen onClose={() => {}} initialTab="join" /></MemoryRouter>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('PoolPage has no a11y violations', async () => {
    const { container, findByTestId } = render(
      <MemoryRouter initialEntries={[`/pools/${summary.address}`]}>
        <Routes>
          <Route path="/pools/:address" element={<PoolPage />} />
        </Routes>
      </MemoryRouter>
    )
    await findByTestId('pool-summary')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('PoolLeaderboard (creator view) has no a11y violations', async () => {
    const entries = [
      { id: 'a', nickname: 'Prismatic Fox', score: 3, eliminated: false },
      { id: 'b', nickname: 'Thunder Eagle', score: 7, eliminated: true },
    ]
    const { container } = render(<PoolLeaderboard entries={entries} isCreator onScoreChange={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('WordListLanguageSelector has no a11y violations', async () => {
    const { container } = render(<WordListLanguageSelector />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
