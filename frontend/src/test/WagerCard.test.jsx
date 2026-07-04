import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WagerCardGrid from '../components/fairwins/WagerCardGrid'
import { deriveAddressName } from '../lib/naming/addressName'

// The activity watcher is optional; stub it so the grid renders without a
// provider. Tests assign activityRef.current per scenario to drive the
// action-needed tags; the mock reads it lazily so the same object is returned
// on every render.
const activityRef = vi.hoisted(() => ({ current: { actionNeededByWagerId: {} } }))
vi.mock('../hooks/useWagerActivity', () => ({
  useWagerActivityOptional: () => activityRef.current,
}))

const ME = '0x1234567890123456789012345678901234567890'
const OTHER = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'

// Minimal formatter props mirroring what MyMarketsModal passes.
const baseProps = {
  account: ME,
  getStatusClass: () => 'status-active',
  getStatusLabel: (s) => (s === 'resolved' ? 'Resolved' : 'Active'),
  getTimeRemaining: () => '2d',
  formatDate: () => 'Jun 1, 2026',
  onSelect: vi.fn(),
  onDecrypt: vi.fn(),
  onResolve: vi.fn(),
  onAccept: vi.fn(),
  onClaim: vi.fn(),
  onRefund: vi.fn(),
  onClearExpired: vi.fn(),
}

const activeWager = (over = {}) => ({
  id: '1', marketType: 'friend', description: 'Lakers ML vs Mike',
  creator: ME, participants: [ME, OTHER], status: 'active', computedStatus: 'active',
  stakeAmount: '15.0', stakeTokenSymbol: 'USDC', ...over,
})

describe('WagerCard (via WagerCardGrid)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activityRef.current = { actionNeededByWagerId: {} }
  })

  it('renders a collapsed card with stake, token, title and status pill', () => {
    render(<WagerCardGrid {...baseProps} markets={[activeWager()]} />)
    expect(screen.getByText('15.0')).toBeInTheDocument()
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('Lakers ML vs Mike')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    // Collapsed: metadata grid not yet shown.
    expect(screen.queryByText('Wager ID')).not.toBeInTheDocument()
  })

  it('expands in place on click, revealing metadata (no redundant View details)', async () => {
    const user = userEvent.setup()
    render(<WagerCardGrid {...baseProps} markets={[activeWager()]} />)
    const header = screen.getByText('Lakers ML vs Mike').closest('[role="button"]')
    expect(header).toHaveAttribute('aria-expanded', 'false')
    await user.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Wager ID')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    // spec 018 FR-001: the expanded card IS the detail — no "View details" button.
    expect(screen.queryByRole('button', { name: /view details/i })).not.toBeInTheDocument()
  })

  it('keeps at most one card expanded (accordion)', async () => {
    const user = userEvent.setup()
    const markets = [activeWager({ id: '1', description: 'Alpha' }), activeWager({ id: '2', description: 'Beta' })]
    render(<WagerCardGrid {...baseProps} markets={markets} />)
    const a = screen.getByText('Alpha').closest('[role="button"]')
    const b = screen.getByText('Beta').closest('[role="button"]')
    await user.click(a)
    expect(a).toHaveAttribute('aria-expanded', 'true')
    await user.click(b)
    expect(b).toHaveAttribute('aria-expanded', 'true')
    expect(a).toHaveAttribute('aria-expanded', 'false')
  })

  it('lets the user hide and re-show decrypted private terms (spec 018 FR-002)', async () => {
    const user = userEvent.setup()
    const m = activeWager({ isEncrypted: true, decryptedMetadata: { terms: 'Lakers win outright' } })
    render(<WagerCardGrid {...baseProps} isDecrypting={() => false} markets={[m]} />)
    await user.click(screen.getByText('Lakers ML vs Mike'))
    // Decrypted terms are visible…
    expect(screen.getByText('Lakers win outright')).toBeInTheDocument()
    // …hide them…
    await user.click(screen.getByRole('button', { name: /^hide$/i }))
    expect(screen.queryByText('Lakers win outright')).not.toBeInTheDocument()
    // …and show them again (no re-decryption).
    await user.click(screen.getByRole('button', { name: /^show$/i }))
    expect(screen.getByText('Lakers win outright')).toBeInTheDocument()
  })

  it('offers no hide control for a plain (non-encrypted) wager', async () => {
    const user = userEvent.setup()
    const m = activeWager({ decryptedMetadata: { terms: 'Open terms' } })
    render(<WagerCardGrid {...baseProps} markets={[m]} />)
    await user.click(screen.getByText('Lakers ML vs Mike'))
    expect(screen.getByText('Open terms')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^hide$/i })).not.toBeInTheDocument()
  })

  it('shows an inline decrypt affordance for an encrypted, undecrypted wager', async () => {
    const user = userEvent.setup()
    const onDecrypt = vi.fn()
    const m = activeWager({ isEncrypted: true, decryptedMetadata: null })
    render(<WagerCardGrid {...baseProps} onDecrypt={onDecrypt} isDecrypting={() => false} markets={[m]} />)
    await user.click(screen.getByText('Lakers ML vs Mike'))
    const decryptBtn = screen.getByRole('button', { name: /decrypt wager details/i })
    await user.click(decryptBtn)
    expect(onDecrypt).toHaveBeenCalledWith('1')
  })

  it('shows a terms-unavailable retry when decryption failed', async () => {
    const user = userEvent.setup()
    const m = activeWager({ isEncrypted: true, decryptedMetadata: null, decryptionError: 'Signature rejected' })
    render(<WagerCardGrid {...baseProps} isDecrypting={() => false} markets={[m]} />)
    await user.click(screen.getByText('Lakers ML vs Mike'))
    expect(screen.getByText(/terms unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /decrypt wager details/i })).not.toBeInTheDocument()
  })

  it('shows a Claim action only for the unpaid winner of a resolved wager', async () => {
    const user = userEvent.setup()
    const onClaim = vi.fn()
    const won = activeWager({ id: '42', description: 'Won Wager', status: 'resolved', computedStatus: 'resolved', winner: ME, paid: false })
    render(<WagerCardGrid {...baseProps} onClaim={onClaim} showOutcome markets={[won]} />)
    await user.click(screen.getByText('Won Wager'))
    const claimBtn = screen.getByRole('button', { name: /^claim$/i })
    await user.click(claimBtn)
    expect(onClaim).toHaveBeenCalledTimes(1)
  })

  it('flags a claimable wager with a Claim tag while collapsed, then shows the button when expanded', async () => {
    const user = userEvent.setup()
    activityRef.current = { actionNeededByWagerId: { '42': 'claim' } }
    const won = activeWager({ id: '42', description: 'Won Wager', status: 'resolved', computedStatus: 'resolved', winner: ME, paid: false })
    render(<WagerCardGrid {...baseProps} onClaim={vi.fn()} showOutcome markets={[won]} />)

    const card = screen.getByText('Won Wager').closest('.wc-card')
    // Collapsed: the Claim button lives in the body, so the tag is the visible cue.
    expect(screen.queryByRole('button', { name: /^claim$/i })).not.toBeInTheDocument()
    const tag = card.querySelector('.wc-action-needed')
    expect(tag).toBeInTheDocument()
    expect(tag).toHaveTextContent(/claim/i)

    // Expanding reveals the real Claim button and drops the now-redundant tag.
    await user.click(screen.getByText('Won Wager'))
    expect(screen.getByRole('button', { name: /^claim$/i })).toBeInTheDocument()
    expect(card.querySelector('.wc-action-needed')).toBeNull()
  })

  it('does not show a Claim action to the losing side', async () => {
    const user = userEvent.setup()
    const lost = activeWager({ id: '43', description: 'Lost Wager', status: 'resolved', computedStatus: 'resolved', winner: OTHER, paid: false })
    render(<WagerCardGrid {...baseProps} onClaim={vi.fn()} showOutcome markets={[lost]} />)
    await user.click(screen.getByText('Lost Wager'))
    expect(screen.queryByRole('button', { name: /^claim$/i })).not.toBeInTheDocument()
  })

  it('renders the opponent preview line only in comfortable density', () => {
    // The opponent now renders by friendly name (spec 040), not the raw address.
    const oppName = deriveAddressName(OTHER).label
    const { rerender } = render(<WagerCardGrid {...baseProps} density="compact" markets={[activeWager()]} />)
    // Compact: no preview line.
    expect(screen.queryByText(oppName)).not.toBeInTheDocument()
    rerender(<WagerCardGrid {...baseProps} density="comfortable" markets={[activeWager()]} />)
    expect(screen.getByText(oppName)).toBeInTheDocument()
  })

  it('shows draw submission chips when a draw is proposed (spec 040 US2)', async () => {
    const user = userEvent.setup()
    const w = activeWager({ id: '99', description: 'Draw Pending', drawProposedBy: ME })
    render(<WagerCardGrid {...baseProps} markets={[w]} />)
    // Evident even collapsed via the header badge.
    expect(screen.getByText('Draw pending')).toBeInTheDocument()
    await user.click(screen.getByText('Draw Pending'))
    expect(screen.getByText(/you proposed/i)).toBeInTheDocument()
    expect(screen.getByText(/You: submitted/i)).toBeInTheDocument()
    expect(screen.getByText(/Opponent: not yet/i)).toBeInTheDocument()
  })

  it('shows the opponent by generated name and reveals the address on click (spec 040 US1)', async () => {
    const user = userEvent.setup()
    render(<WagerCardGrid {...baseProps} markets={[activeWager()]} />)
    await user.click(screen.getByText('Lakers ML vs Mike'))
    const oppName = deriveAddressName(OTHER).label
    const toggle = screen.getByRole('button', { name: new RegExp(`show full address for ${oppName}`, 'i') })
    expect(toggle).toBeInTheDocument()
    // Raw address hidden until revealed; creator side is "You".
    expect(screen.queryByText(OTHER)).not.toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    await user.click(toggle)
    // The full address is revealed for verification.
    expect(screen.getByText(OTHER)).toBeInTheDocument()
  })
})
