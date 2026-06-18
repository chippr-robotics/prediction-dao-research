import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WagerCardGrid from '../components/fairwins/WagerCardGrid'

// The activity watcher is optional; stub it so the grid renders without a provider.
vi.mock('../hooks/useWagerActivity', () => ({
  useWagerActivityOptional: () => ({ actionNeededByWagerId: {} }),
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
  beforeEach(() => vi.clearAllMocks())

  it('renders a collapsed card with stake, token, title and status pill', () => {
    render(<WagerCardGrid {...baseProps} markets={[activeWager()]} />)
    expect(screen.getByText('15.0')).toBeInTheDocument()
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('Lakers ML vs Mike')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    // Collapsed: metadata grid not yet shown.
    expect(screen.queryByText('Wager ID')).not.toBeInTheDocument()
  })

  it('expands in place on click, revealing metadata and View details', async () => {
    const user = userEvent.setup()
    render(<WagerCardGrid {...baseProps} markets={[activeWager()]} />)
    const header = screen.getByText('Lakers ML vs Mike').closest('[role="button"]')
    expect(header).toHaveAttribute('aria-expanded', 'false')
    await user.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Wager ID')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view details/i })).toBeInTheDocument()
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

  it('View details calls onSelect with the wager', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<WagerCardGrid {...baseProps} onSelect={onSelect} markets={[activeWager()]} />)
    await user.click(screen.getByText('Lakers ML vs Mike'))
    await user.click(screen.getByRole('button', { name: /view details/i }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].id).toBe('1')
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

  it('does not show a Claim action to the losing side', async () => {
    const user = userEvent.setup()
    const lost = activeWager({ id: '43', description: 'Lost Wager', status: 'resolved', computedStatus: 'resolved', winner: OTHER, paid: false })
    render(<WagerCardGrid {...baseProps} onClaim={vi.fn()} showOutcome markets={[lost]} />)
    await user.click(screen.getByText('Lost Wager'))
    expect(screen.queryByRole('button', { name: /^claim$/i })).not.toBeInTheDocument()
  })

  it('renders the opponent preview line only in comfortable density', () => {
    const { rerender } = render(<WagerCardGrid {...baseProps} density="compact" markets={[activeWager()]} />)
    // Compact: no preview line (the short opponent address is not shown collapsed).
    expect(screen.queryByText(/0xABCD/i)).not.toBeInTheDocument()
    rerender(<WagerCardGrid {...baseProps} density="comfortable" markets={[activeWager()]} />)
    expect(screen.getByText(/0xABCD/i)).toBeInTheDocument()
  })
})
