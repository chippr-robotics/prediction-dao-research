import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock the create flow (no chain/IPFS) — same approach as OpenChallengeModal.test.jsx.
const createOpenChallenge = vi.fn()
vi.mock('../../hooks/useOpenChallengeCreate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOpenChallengeCreate: () => ({ createOpenChallenge, busy: false, error: null }) }
})

// Chain capability gate — flip per-test via this holder.
const capsHolder = { capabilities: { polymarketSidebets: true } }
vi.mock('../../hooks/useChainTokens', () => ({
  useChainTokens: () => capsHolder,
}))

// Stub the market browser: the modal's contract with it is onSelectMarket(normalizedMarket).
// The browser's own feed/filter behavior is covered by PolymarketBrowser.test.jsx.
const FAR_END = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
const SOON_END = new Date(Date.now() + 10 * 60 * 1000).toISOString() // < 1h lead → ineligible
const eligibleMarket = {
  id: 'm1',
  slug: 'will-eth-flip-btc',
  question: 'Will ETH flip BTC?',
  conditionId: '0xc0ffee',
  endDate: FAR_END,
  active: true,
  closed: false,
  outcomes: [{ name: 'Yes', price: 0.62 }, { name: 'No', price: 0.38 }],
}
const soonMarket = { ...eligibleMarket, id: 'm2', question: 'Ends in minutes?', conditionId: '0xsoon', endDate: SOON_END }
vi.mock('../../components/fairwins/PolymarketBrowser', () => ({
  default: ({ onSelectMarket }) => (
    <div data-testid="pm-browser">
      <button type="button" onClick={() => onSelectMarket(eligibleMarket)}>pick eligible</button>
      <button type="button" onClick={() => onSelectMarket(soonMarket)}>pick soon</button>
    </div>
  ),
}))

import OracleOpenChallengeModal from '../../components/fairwins/OracleOpenChallengeModal'
import { OPEN_RESOLUTION_TYPES } from '../../hooks/useOpenChallengeCreate'

describe('OracleOpenChallengeModal (spec 041, US1)', () => {
  beforeEach(() => {
    createOpenChallenge.mockReset()
    capsHolder.capabilities = { polymarketSidebets: true }
  })

  it('renders nothing when closed', () => {
    const { container } = render(<OracleOpenChallengeModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('opens straight into the market picker — no side/stake until a market is picked', () => {
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)
    expect(screen.getByTestId('pm-browser')).toBeInTheDocument()
    expect(screen.queryByText(/your side of the bet/i)).toBeNull()
    expect(screen.getByRole('button', { name: /create & generate code/i })).toBeDisabled()
  })

  it('shows a locked explanation (not a silent blank) on chains without Polymarket support (FR-004)', () => {
    capsHolder.capabilities = { polymarketSidebets: false }
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/isn't available on this network/i)
    expect(screen.queryByTestId('pm-browser')).toBeNull()
  })

  it('refuses a market that ends too soon, keeps the picker open, and says why (FR-003)', () => {
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /pick soon/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/too soon/i)
    expect(screen.getByTestId('pm-browser')).toBeInTheDocument()
    expect(screen.queryByText(/your side of the bet/i)).toBeNull()
  })

  it('picking a market reveals side picker (market outcome labels + prices), stake, and the derived read-only timeline', () => {
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /pick eligible/i }))

    // Selected-market summary with a change affordance back to the picker.
    expect(screen.getByText('Will ETH flip BTC?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument()

    // Side picker: two aria-pressed buttons carrying the market's own labels + live prices.
    const yesBtn = screen.getByRole('button', { name: /taking yes/i })
    const noBtn = screen.getByRole('button', { name: /taking no/i })
    expect(yesBtn).toHaveAttribute('aria-pressed', 'false')
    expect(yesBtn).toHaveTextContent(/62¢/)
    expect(noBtn).toHaveTextContent(/38¢/)

    // Derived timeline is presented as coming from the event, with no date inputs.
    expect(screen.getByText(/timeline — set by the event/i)).toBeInTheDocument()
    expect(screen.getByText('Takeable until')).toBeInTheDocument()
    expect(screen.getByText('Settles by')).toBeInTheDocument()
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()

    // Taker side is spelled out once a side is picked.
    fireEvent.click(yesBtn)
    expect(yesBtn).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/whoever takes your code will be taking/i)).toHaveTextContent(/No/)
  })

  it('submits resolutionType=Polymarket with the market linkage, side, derived deadlines, and sealed oracleMeta (FR-005..FR-010)', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 7n, txHash: '0xabc' })
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /pick eligible/i }))
    const createBtn = screen.getByRole('button', { name: /create & generate code/i })
    expect(createBtn).toBeDisabled() // no side picked yet
    fireEvent.click(screen.getByRole('button', { name: /taking no/i }))
    expect(createBtn).toBeEnabled()
    fireEvent.click(createBtn)

    await waitFor(() => expect(createOpenChallenge).toHaveBeenCalled())
    const form = createOpenChallenge.mock.calls[0][0]

    expect(form.resolutionType).toBe(OPEN_RESOLUTION_TYPES.Polymarket)
    expect(form.oracleConditionId).toBe('0xc0ffee')
    expect(form.creatorIsYes).toBe(false) // picked the index-1 (NO) side
    // Deadlines derive from the event: accept == market end (within the 30-day cap),
    // settle after it — both in unix seconds.
    const endSecs = Math.floor(Date.parse(FAR_END) / 1000)
    expect(form.acceptDeadline).toBe(endSecs)
    expect(form.resolveDeadline).toBeGreaterThan(form.acceptDeadline)
    // The sealed metadata makes the bet readable to code-holders even offline (D4).
    expect(form.oracleMeta).toMatchObject({
      source: 'polymarket',
      conditionId: '0xc0ffee',
      question: 'Will ETH flip BTC?',
      outcomes: ['Yes', 'No'],
      creatorSide: 1,
      slug: 'will-eth-flip-btc',
    })
    // The description names the market, the side, and Polymarket as the settler.
    expect(form.description).toMatch(/Will ETH flip BTC\?/)
    expect(form.description).toMatch(/takes No/i)
    expect(form.description).toMatch(/Polymarket/)

    // Success → shared claim-code result panel (code shown once + QR).
    expect(await screen.findByText('river tiger kite zoo')).toBeInTheDocument()
    expect(screen.getByText(/save this code now/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/qr code to take this challenge/i)).toBeInTheDocument()
  })

  it('surfaces a translated create failure and stays on the form', async () => {
    createOpenChallenge.mockRejectedValue(new Error('That market has already resolved — pick a market that is still live.'))
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /pick eligible/i }))
    fireEvent.click(screen.getByRole('button', { name: /taking yes/i }))
    fireEvent.click(screen.getByRole('button', { name: /create & generate code/i }))

    expect(await screen.findByText(/already resolved/i)).toBeInTheDocument()
    // Still on the form — the Change affordance lets the creator re-pick (FR-008).
    expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// US3 — fast discovery & effortless sharing (SC-001). Feed internals (grouping,
// category chips, retry, a11y) are covered by PolymarketBrowser.test.jsx; here we
// pin the modal-level interaction budget and state transitions.
// ---------------------------------------------------------------------------
describe('OracleOpenChallengeModal — discovery speed & sharing (spec 041, US3)', () => {
  beforeEach(() => {
    createOpenChallenge.mockReset()
    capsHolder.capabilities = { polymarketSidebets: true }
  })

  it('the picker is browsable with zero input the moment the section opens', () => {
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)
    expect(screen.getByTestId('pm-browser')).toBeInTheDocument()
    // No search/typing is required before markets are pickable.
    expect(screen.getByRole('button', { name: /pick eligible/i })).toBeInTheDocument()
  })

  it('feed → side picked takes at most 3 interactions (SC-001)', () => {
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)
    // 1: pick a market from the feed; 2: pick a side. (3rd would be a category/search refinement.)
    fireEvent.click(screen.getByRole('button', { name: /pick eligible/i }))
    fireEvent.click(screen.getByRole('button', { name: /taking yes/i }))
    expect(screen.getByRole('button', { name: /taking yes/i })).toHaveAttribute('aria-pressed', 'true')
    // Stake is pre-filled, so the create button is already enabled after 2 interactions.
    expect(screen.getByRole('button', { name: /create & generate code/i })).toBeEnabled()
  })

  it('a refused (too-soon) pick does not strand the flow — the next valid pick clears the notice', () => {
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /pick soon/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/too soon/i)
    fireEvent.click(screen.getByRole('button', { name: /pick eligible/i }))
    expect(screen.queryByText(/too soon/i)).toBeNull()
    expect(screen.getByText('Will ETH flip BTC?')).toBeInTheDocument()
  })

  it('after create, the share tools are immediately at hand: copy, QR deep link, device backup (FR-010)', async () => {
    createOpenChallenge.mockResolvedValue({ code: 'river tiger kite zoo', wagerId: 3n, txHash: '0x1' })
    render(<OracleOpenChallengeModal isOpen onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /pick eligible/i }))
    fireEvent.click(screen.getByRole('button', { name: /taking no/i }))
    fireEvent.click(screen.getByRole('button', { name: /create & generate code/i }))

    expect(await screen.findByText('river tiger kite zoo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/qr code to take this challenge/i)).toBeInTheDocument()
    // The retention warning tells the sharer the code is also how the bet is READ later.
    expect(screen.getByText(/only way to take, read, or re-read/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save encrypted backup/i })).toBeInTheDocument()
  })
})
