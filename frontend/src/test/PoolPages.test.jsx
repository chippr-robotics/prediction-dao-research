import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// T021 [US1] — Create/Join/Pool pages: quick-action-driven flows render, the four-word gateway shows a
// pool summary before funds, invalid phrases surface a clear "not found", and create yields a shareable
// phrase (spec 034 FR-004/FR-005/FR-008).

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
vi.mock('../hooks/usePools', () => ({ usePools: vi.fn() }))

import { useWallet } from '../hooks/useWalletManagement'
import { usePools } from '../hooks/usePools'
import CreatePoolPage from '../pages/CreatePoolPage'
import JoinPoolPage from '../pages/JoinPoolPage'
import PoolPage from '../pages/PoolPage'

const openSummary = {
  address: '0x00000000000000000000000000000000000000aa',
  state: 0,
  stateLabel: 'JoiningOpen',
  buyInFormatted: '10.0',
  tokenSymbol: 'USDC',
  memberCount: 2,
  maxMembers: 5,
  slotsRemaining: 3,
  thresholdPct: 60,
}

function base(overrides = {}) {
  return {
    status: 'idle',
    error: null,
    createPool: vi.fn(),
    resolvePhrase: vi.fn(),
    getPoolSummary: vi.fn(),
    joinPool: vi.fn(),
    ...overrides,
  }
}

describe('ZK-Wager Pool pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWallet.mockReturnValue({ account: '0x1111111111111111111111111111111111111111', isConnected: true })
  })

  it('CreatePoolPage: submitting yields a shareable four-word phrase', async () => {
    usePools.mockReturnValue(
      base({
        createPool: vi.fn().mockResolvedValue({
          pool: openSummary.address,
          wordIndices: [1, 2, 3, 4],
          phrase: 'crystal orbit harbor violet',
        }),
      })
    )
    render(<MemoryRouter><CreatePoolPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /create pool/i }))
    expect(await screen.findByTestId('pool-phrase')).toHaveTextContent('crystal orbit harbor violet')
  })

  it('JoinPoolPage: a valid phrase shows the pool summary before funds, with a Join action', async () => {
    usePools.mockReturnValue(base({ resolvePhrase: vi.fn().mockResolvedValue({ summary: openSummary }) }))
    render(<MemoryRouter><JoinPoolPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/four-word phrase/i), {
      target: { value: 'crystal orbit harbor violet' },
    })
    fireEvent.click(screen.getByRole('button', { name: /find pool/i }))

    expect(await screen.findByTestId('pool-summary')).toBeInTheDocument()
    expect(screen.getByText('10.0 USDC')).toBeInTheDocument() // the buy-in <dd> (exact, not the button)
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join for 10\.0 USDC/i })).toBeInTheDocument()
  })

  it('JoinPoolPage: an unknown phrase surfaces a clear not-found message', async () => {
    usePools.mockReturnValue(
      base({ resolvePhrase: vi.fn().mockResolvedValue({ notFound: true, reason: 'unknown' }) })
    )
    render(<MemoryRouter><JoinPoolPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/four-word phrase/i), { target: { value: 'a b c d' } })
    fireEvent.click(screen.getByRole('button', { name: /find pool/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no active pool matches/i)
  })

  it('JoinPoolPage: a full/closed pool is not joinable', async () => {
    usePools.mockReturnValue(
      base({
        resolvePhrase: vi.fn().mockResolvedValue({
          summary: { ...openSummary, state: 1, stateLabel: 'JoiningClosed', slotsRemaining: 0 },
        }),
      })
    )
    render(<MemoryRouter><JoinPoolPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/four-word phrase/i), { target: { value: 'a b c d' } })
    fireEvent.click(screen.getByRole('button', { name: /find pool/i }))
    await screen.findByTestId('pool-summary')
    expect(screen.queryByRole('button', { name: /join for/i })).toBeNull()
    expect(screen.getByText(/isn’t accepting new members/i)).toBeInTheDocument()
  })

  it('PoolPage: renders live on-chain state for a pool address', async () => {
    usePools.mockReturnValue(base({ getPoolSummary: vi.fn().mockResolvedValue(openSummary) }))
    render(
      <MemoryRouter initialEntries={[`/pools/${openSummary.address}`]}>
        <Routes>
          <Route path="/pools/:address" element={<PoolPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByTestId('pool-state')).toHaveTextContent('JoiningOpen')
  })
})
