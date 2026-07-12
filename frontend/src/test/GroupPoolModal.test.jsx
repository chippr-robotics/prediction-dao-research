import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Spec 034 + create-flow tester punchlist: the group-pool create flow as a wager-style bottom-sheet
// (matches FriendMarketsModal / OpenChallengeModal) — create-only (no tabs/pills), money-formatted
// buy-in, the shared deadline timeline (sliders + tap-to-type), a named approval-threshold selector,
// and an open-challenge-style share view (code display + copy icon + QR).

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
vi.mock('../hooks/usePools', () => ({ usePools: vi.fn() }))

import { useWallet } from '../hooks/useWalletManagement'
import { usePools } from '../hooks/usePools'
import GroupPoolModal from '../components/fairwins/GroupPoolModal'

const POOL_ADDR = '0x00000000000000000000000000000000000000aa'

function pools(over = {}) {
  return { status: 'idle', error: null, createPool: vi.fn(), resolvePhrase: vi.fn(), joinPool: vi.fn(), ...over }
}
function renderModal(props) {
  return render(<MemoryRouter><GroupPoolModal isOpen onClose={() => {}} {...props} /></MemoryRouter>)
}

// Enter the buy-in on the payments-style number pad (spec 052).
const tapAmount = (amount) => {
  for (const ch of String(amount)) {
    fireEvent.click(screen.getByRole('button', { name: ch === '.' ? 'Decimal point' : ch }))
  }
}

describe('GroupPoolModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWallet.mockReturnValue({ account: '0x1111111111111111111111111111111111111111', isConnected: true })
  })

  it('renders as a wager-style bottom sheet, create-only — no mode tabs/pills at all (tester feedback)', () => {
    usePools.mockReturnValue(pools())
    renderModal()
    expect(screen.getByRole('dialog')).toHaveClass('friend-markets-modal-backdrop')
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('tablist')).toBeNull()
    // The buy-in is entered on the payments-style number pad (spec 052).
    expect(screen.getByTestId('amount-keypad-hero')).toBeInTheDocument()
  })

  it('the buy-in is entered on the payments-style number pad (hero amount + USDC token, spec 052)', () => {
    usePools.mockReturnValue(pools())
    renderModal()
    const hero = screen.getByTestId('amount-keypad-hero')
    expect(hero).toHaveTextContent('$0') // zero state
    tapAmount('12.5')
    expect(hero).toHaveTextContent('$12.5')
    // A 3rd fractional digit is ignored (cents precision).
    fireEvent.click(screen.getByRole('button', { name: '9' }))
    expect(hero).toHaveTextContent('$12.5')
    // Pools are USDC-locked — the token indicator is shown compactly beside the amount.
    expect(screen.getByText('USDC')).toBeInTheDocument()
  })

  it('join/resolve windows use the shared timeline element — draggable dots plus tap-to-set modal', () => {
    usePools.mockReturnValue(pools())
    renderModal()
    const joinDot = screen.getByRole('slider', { name: /joining open until/i })
    const resolveDot = screen.getByRole('slider', { name: /must be resolved by/i })
    expect(joinDot).toBeInTheDocument()
    expect(resolveDot).toBeInTheDocument()
    // No native picker field or "type a date" link anywhere in the form (FR-005).
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull()
    expect(screen.queryByText(/tap to type a date/i)).toBeNull()

    // Tapping a tile opens the shared set-time modal, not an inline input.
    fireEvent.click(screen.getByRole('button', { name: /join by:/i }))
    expect(screen.getByRole('dialog', { name: /set date and time/i })).toBeInTheDocument()
    expect(screen.getByText(/joining open until/i)).toBeInTheDocument()
  })

  it('the approval threshold is a named selector, not a raw percent field', async () => {
    const createPool = vi.fn().mockResolvedValue({ pool: POOL_ADDR, phrase: 'crystal orbit harbor violet' })
    usePools.mockReturnValue(pools({ createPool }))
    renderModal()
    expect(screen.queryByLabelText(/approval threshold/i)).toBeNull()
    const group = screen.getByRole('radiogroup', { name: /who must approve the payout/i })
    expect(group).toBeInTheDocument()
    // Majority is the default; switching to Everyone submits 100%.
    expect(screen.getByRole('radio', { name: /majority/i })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /everyone/i }))
    tapAmount('10')
    fireEvent.click(screen.getByRole('button', { name: /create pool/i }))
    await waitFor(() => expect(createPool).toHaveBeenCalled())
    expect(createPool.mock.calls[0][0].thresholdPct).toBe(100)
  })

  it('passes the chosen windows as two exact absolute deadlines (acceptDeadline + resolveDeadline, unix s)', async () => {
    const createPool = vi.fn().mockResolvedValue({ pool: POOL_ADDR, phrase: 'crystal orbit harbor violet' })
    usePools.mockReturnValue(pools({ createPool }))
    renderModal()
    tapAmount('10')
    fireEvent.click(screen.getByRole('button', { name: /create pool/i }))
    await waitFor(() => expect(createPool).toHaveBeenCalled())
    const form = createPool.mock.calls[0][0]
    // Timing mirrors the 1v1/open-challenge flow: two absolute unix-second deadlines, not a relative window.
    expect(typeof form.acceptDeadline).toBe('number')
    expect(form.acceptDeadline).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(typeof form.resolveDeadline).toBe('number')
    expect(form.resolveDeadline).toBeGreaterThan(form.acceptDeadline)
  })

  it('share view matches the open-challenge share view: four words + copy icon + join QR', async () => {
    usePools.mockReturnValue(pools({
      createPool: vi.fn().mockResolvedValue({
        pool: POOL_ADDR, wordIndices: [1, 2, 3, 4], phrase: 'crystal orbit harbor violet',
      }),
    }))
    renderModal()
    tapAmount('10')
    fireEvent.click(screen.getByRole('button', { name: /create pool/i }))
    expect(await screen.findByTestId('pool-phrase')).toHaveTextContent('crystal orbit harbor violet')
    // Icon-only copy button (name from aria-label), like the open-challenge code display.
    const copyBtn = screen.getByRole('button', { name: /copy words/i })
    expect(copyBtn).not.toHaveTextContent(/copy/i)
    // A scannable QR deep link into the unified lookup, with the words pre-filled.
    expect(screen.getByLabelText(/QR code to join this pool/i)).toBeInTheDocument()
    expect(screen.getByText(/scan to join/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open my pool/i })).toBeInTheDocument()
  })

  describe('explainers behind info icons (spec 039 US2)', () => {
    it('hides the static explainers by default and reveals each from its icon, one at a time', () => {
      usePools.mockReturnValue(pools())
      renderModal()
      expect(screen.queryByText(/everyone pays the same buy-in/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/only USDC is supported/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/joining closes automatically/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/take their buy-in back/i)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'About group pools' }))
      expect(screen.getByRole('note')).toHaveTextContent(/everyone pays the same buy-in/i)

      fireEvent.click(screen.getByRole('button', { name: 'About: Buy-in — each member' }))
      expect(screen.getAllByRole('note')).toHaveLength(1)
      expect(screen.getByRole('note')).toHaveTextContent(/only USDC is supported/i)

      fireEvent.click(screen.getByRole('button', { name: 'About: Maximum members' }))
      expect(screen.getByRole('note')).toHaveTextContent(/joining closes automatically/i)

      fireEvent.click(screen.getByRole('button', { name: 'About: Who must approve the payout?' }))
      expect(screen.getByRole('note')).toHaveTextContent(/take their buy-in back/i)
    })

    it('moves the share-words caution behind an icon on the share view', async () => {
      const createPool = vi.fn().mockResolvedValue({ pool: POOL_ADDR, phrase: 'able acid also apex' })
      usePools.mockReturnValue(pools({ createPool }))
      renderModal()
      tapAmount('10')
      fireEvent.click(screen.getByRole('button', { name: /create pool/i }))
      await waitFor(() => expect(createPool).toHaveBeenCalled())
      await screen.findByTestId('pool-phrase')

      expect(screen.queryByText(/share them with the group you mean/i)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'About sharing the words' }))
      expect(screen.getByRole('note')).toHaveTextContent(/share them with the group you mean/i)
    })
  })
})
