/**
 * BitcoinStampsSection (spec 061, T031 — FR-017/FR-018/FR-019): stamp cards
 * with image fallback + Protected badge, the protected-value explainer, the
 * stamps-only rule (no OpenSea integration), honest degraded/hidden states,
 * axe pass.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import BitcoinStampsSection from '../../components/collectibles/BitcoinStampsSection'
import { useBitcoinStamps } from '../../hooks/useBitcoinStamps'

vi.mock('../../hooks/useBitcoinStamps', () => ({
  useBitcoinStamps: vi.fn(),
}))

const STAMPS = [
  {
    stampId: 'STAMP-001',
    imageUrl: 'https://img.example/stamp1.png',
    mimeType: 'image/png',
    outpoint: { txid: 'aa'.repeat(32), vout: 0 },
    address: 'bc1qexample0',
  },
  {
    stampId: 'STAMP-002',
    imageUrl: null,
    mimeType: null,
    outpoint: { txid: 'bb'.repeat(32), vout: 1 },
    address: 'bc1qexample1',
  },
]

const hookState = (overrides = {}) => ({
  status: 'ready',
  networkId: 'bitcoin',
  stamps: STAMPS,
  degraded: false,
  refresh: vi.fn(),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  useBitcoinStamps.mockReturnValue(hookState())
})

describe('BitcoinStampsSection', () => {
  it('renders each Stamp as a labeled card with a Protected badge (FR-017)', () => {
    render(<BitcoinStampsSection />)
    expect(screen.getByRole('heading', { name: 'Bitcoin Stamps' })).toBeInTheDocument()
    expect(screen.getByText('STAMP-001')).toBeInTheDocument()
    expect(screen.getByText('STAMP-002')).toBeInTheDocument()
    expect(screen.getAllByText('Bitcoin Stamp')).toHaveLength(2)
    expect(screen.getAllByText('Protected')).toHaveLength(2)
  })

  it('explains that protected value cannot be spent by ordinary sends (FR-018)', () => {
    render(<BitcoinStampsSection />)
    expect(screen.getByText(/ordinary BTC sends can\s+never spend/)).toBeInTheDocument()
    expect(screen.getByText(/excluded from your spendable\s+balance/)).toBeInTheDocument()
  })

  it('falls back to a placeholder when the image is missing or errors', () => {
    const { container } = render(<BitcoinStampsSection />)
    // STAMP-002 has no imageUrl — placeholder from the start.
    expect(container.querySelectorAll('img')).toHaveLength(1)
    fireEvent.error(container.querySelector('img'))
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(screen.getByText('STAMP-001')).toBeInTheDocument()
  })

  it("is stamps-only: no OpenSea links or marketplace actions anywhere (capability 'stamps-only')", () => {
    render(<BitcoinStampsSection />)
    expect(screen.queryByRole('link')).toBeNull()
    for (const label of [/opensea/i, /buy/i, /sell/i, /^list/i, /transfer/i, /make offer/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
      expect(screen.queryByText(label)).toBeNull()
    }
  })

  it('renders an honest degraded state with retry when recognition is unavailable (FR-019)', () => {
    const state = hookState({ status: 'degraded', stamps: [], degraded: true })
    useBitcoinStamps.mockReturnValue(state)
    render(<BitcoinStampsSection />)
    expect(screen.getByRole('status')).toHaveTextContent(/temporarily degraded/i)
    expect(screen.getByRole('status')).toHaveTextContent(/treated as protected/i)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(state.refresh).toHaveBeenCalled()
  })

  it('renders nothing when hidden, empty, or still loading — never an endless spinner', () => {
    for (const status of ['hidden', 'empty', 'loading']) {
      useBitcoinStamps.mockReturnValue(hookState({ status, stamps: [] }))
      const { container, unmount } = render(<BitcoinStampsSection />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it('has no axe violations in the ready state', async () => {
    const { container } = render(<BitcoinStampsSection />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
