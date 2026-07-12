import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock the create flow so the panel renders deterministically (no chain/IPFS).
const createOpenChallenge = vi.fn()
vi.mock('../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }) }
})

// Chain capability gate — flip per-test via this holder (drives the oracle pill).
const capsHolder = { capabilities: { polymarketSidebets: true } }
vi.mock('../hooks/useChainTokens', () => ({ useChainTokens: () => capsHolder }))

// Stub the market browser: the panel's contract with it is onSelectMarket(normalizedMarket).
const FAR_END = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
const eligibleMarket = {
  id: 'm1', slug: 'will-eth-flip-btc', question: 'Will ETH flip BTC?',
  conditionId: '0xc0ffee', endDate: FAR_END, active: true, closed: false,
  outcomes: [{ name: 'Yes', price: 0.62 }, { name: 'No', price: 0.38 }],
}
vi.mock('../components/fairwins/PolymarketBrowser', () => ({
  default: ({ onSelectMarket }) => (
    <div data-testid="pm-browser">
      <button type="button" onClick={() => onSelectMarket(eligibleMarket)}>pick eligible</button>
    </div>
  ),
}))

import CreateChallengePanel from '../components/fairwins/CreateChallengePanel'
import { OPEN_RESOLUTION_TYPES } from '../hooks/useOpenChallengeCreate'

const tapAmount = (amount) => {
  for (const ch of String(amount)) {
    fireEvent.click(screen.getByRole('button', { name: ch === '.' ? 'Decimal point' : ch }))
  }
}

describe('CreateChallengePanel (spec 053 — shared create panel)', () => {
  beforeEach(() => {
    createOpenChallenge.mockReset()
    capsHolder.capabilities = { polymarketSidebets: true }
  })

  it('renders inline when embedded (the payments-style create form, no modal chrome)', () => {
    const { container } = render(<CreateChallengePanel embedded onClose={() => {}} />)
    expect(screen.getByTestId('amount-keypad-hero')).toHaveTextContent('$0')
    expect(screen.getByLabelText(/what's the wager/i, { selector: 'input' })).toBeInTheDocument()
    // Embedded → no modal backdrop wrapper.
    expect(container.querySelector('.friend-markets-modal-backdrop')).toBeNull()
    expect(container.querySelector('.oc-create-embedded')).not.toBeNull()
  })

  it('creates a self-resolved challenge and calls onDone', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 1n, txHash: '0x1' })
    const onDone = vi.fn()
    render(<CreateChallengePanel embedded onClose={() => {}} onDone={onDone} />)
    const createBtn = screen.getByRole('button', { name: /create & generate code/i })
    expect(createBtn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/what's the wager/i, { selector: 'input' }), { target: { value: 'Will it rain?' } })
    tapAmount('10')
    expect(createBtn).toBeEnabled()
    fireEvent.click(createBtn)
    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    expect(createOpenChallenge.mock.calls[0][0].resolutionType).toBe(OPEN_RESOLUTION_TYPES.Either)
    expect(await screen.findByText('river tiger kite zoo')).toBeInTheDocument()
  })

  it('locks the oracle resolution option where Polymarket is unavailable', () => {
    capsHolder.capabilities = { polymarketSidebets: false }
    render(<CreateChallengePanel embedded onClose={() => {}} />)
    const oracle = screen.getByRole('radio', { name: /^oracle$/i })
    expect(oracle).toHaveAttribute('aria-disabled', 'true')
  })

  it('opens the market-search step when oracle is chosen, then returns with a side picker', () => {
    render(<CreateChallengePanel embedded onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: /^oracle$/i }))
    // Swaps to the market-search sub-view.
    expect(screen.getByTestId('pm-browser')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /pick eligible/i }))
    // Returns to the create view with the picked market + side picker.
    expect(screen.getByText('Will ETH flip BTC?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /taking yes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /taking no/i })).toBeInTheDocument()
  })

  it('preselects the oracle path + opens market search via initialResolutionType', () => {
    render(<CreateChallengePanel embedded onClose={() => {}} initialResolutionType={OPEN_RESOLUTION_TYPES.Polymarket} />)
    expect(screen.getByTestId('pm-browser')).toBeInTheDocument()
  })
})
