import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WagerTable from '../components/fairwins/WagerTable'
import { deriveAddressName } from '../lib/naming/addressName'

vi.mock('../hooks/useWagerActivity', () => ({
  useWagerActivityOptional: () => ({ actionNeededByWagerId: {} }),
}))

const ME = '0x1234567890123456789012345678901234567890'
const OTHER = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12'

const baseProps = {
  account: ME,
  getStatusClass: () => 'status-active',
  getStatusLabel: (s) => (s === 'resolved' ? 'Resolved' : 'Active'),
  getTimeRemaining: () => '2d',
  formatDate: () => 'Jun 1, 2026',
  onSelect: vi.fn(),
  onView: vi.fn(),
  onResolve: vi.fn(),
  onAccept: vi.fn(),
  onClaim: vi.fn(),
  onRefund: vi.fn(),
  onClearExpired: vi.fn(),
}

const wager = (over = {}) => ({
  id: '1', marketType: 'friend', description: 'Lakers ML vs Mike',
  creator: ME, participants: [ME, OTHER], status: 'active', computedStatus: 'active',
  stakeAmount: '15.0', stakeTokenSymbol: 'USDC', ...over,
})

describe('WagerTable (spec 018) — the single My Wagers list view', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders compact rows with wager, amount, date and state columns', () => {
    render(<WagerTable {...baseProps} markets={[wager()]} />)
    expect(screen.getByRole('columnheader', { name: 'Wager' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'State' })).toBeInTheDocument()
    expect(screen.getByText('Lakers ML vs Mike')).toBeInTheDocument()
    expect(screen.getByText('15.0')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('opens the detail view when a row is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onView = vi.fn()
    render(<WagerTable {...baseProps} onSelect={onSelect} onView={onView} markets={[wager()]} />)
    await user.click(screen.getByText('Lakers ML vs Mike').closest('tr'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].id).toBe('1')
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('runs the row action without opening the detail view', async () => {
    const user = userEvent.setup()
    const onClaim = vi.fn()
    const onSelect = vi.fn()
    const won = wager({ id: '7', status: 'resolved', computedStatus: 'resolved', winner: ME, paid: false })
    render(<WagerTable {...baseProps} onSelect={onSelect} onClaim={onClaim} showOutcome markets={[won]} />)
    const row = screen.getByText('Lakers ML vs Mike').closest('tr')
    await user.click(within(row).getByRole('button', { name: /^claim$/i }))
    expect(onClaim).toHaveBeenCalledTimes(1)
    // Clicking the action must not bubble to the row's detail navigation.
    expect(onSelect).not.toHaveBeenCalled()
  })

  describe('keyboard activation of the row', () => {
    it('opens the detail view on Enter and on Space', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(<WagerTable {...baseProps} onSelect={onSelect} markets={[wager()]} />)
      const row = screen.getByText('Lakers ML vs Mike').closest('tr')

      row.focus()
      await user.keyboard('{Enter}')
      expect(onSelect).toHaveBeenCalledTimes(1)

      await user.keyboard(' ')
      expect(onSelect).toHaveBeenCalledTimes(2)
    })

    it('does not open the detail view when a row action is keyed', async () => {
      const user = userEvent.setup()
      const onClaim = vi.fn()
      const onSelect = vi.fn()
      const won = wager({ id: '7', status: 'resolved', computedStatus: 'resolved', winner: ME, paid: false })
      render(<WagerTable {...baseProps} onSelect={onSelect} onClaim={onClaim} showOutcome markets={[won]} />)

      const row = screen.getByText('Lakers ML vs Mike').closest('tr')
      within(row).getByRole('button', { name: /^claim$/i }).focus()
      // Space is how a button is pressed; the keydown bubbles to the row, which
      // must not treat it as "open this wager".
      await user.keyboard(' ')
      expect(onClaim).toHaveBeenCalledTimes(1)
      expect(onSelect).not.toHaveBeenCalled()
    })
  })

  it('does not offer a Claim action to the losing side', () => {
    const lost = wager({ id: '43', status: 'resolved', computedStatus: 'resolved', winner: OTHER, paid: false })
    render(<WagerTable {...baseProps} onClaim={vi.fn()} showOutcome markets={[lost]} />)
    expect(screen.queryByRole('button', { name: /^claim$/i })).not.toBeInTheDocument()
  })

  it('offers a Resolve control in the row when the resolve window is open', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn()
    const onSelect = vi.fn()
    // ME is the creator on an "either party resolves" wager whose trading window
    // has closed → the resolve window is open right now.
    const resolvable = wager({
      resolutionType: 0,
      tradingEndTime: Date.now() - 60 * 60 * 1000,
    })
    render(
      <WagerTable {...baseProps} onSelect={onSelect} onResolve={onResolve}
        showResolveCountdown markets={[resolvable]} />
    )

    const row = screen.getByText('Lakers ML vs Mike').closest('tr')
    await user.click(within(row).getByRole('button', { name: /^resolve$/i }))
    expect(onResolve).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  describe('encrypted wagers', () => {
    it('offers an inline Decrypt action for an encrypted, undecrypted wager', async () => {
      const user = userEvent.setup()
      const onDecrypt = vi.fn()
      const m = wager({ isEncrypted: true, decryptedMetadata: null })
      render(
        <WagerTable {...baseProps} onDecrypt={onDecrypt} isDecrypting={() => false} markets={[m]} />
      )
      await user.click(screen.getByRole('button', { name: /^decrypt$/i }))
      expect(onDecrypt).toHaveBeenCalledWith('1')
    })

    it('shows a disabled in-progress state while decrypting', () => {
      const m = wager({ isEncrypted: true, decryptedMetadata: null })
      render(
        <WagerTable {...baseProps} onDecrypt={vi.fn()} isDecrypting={() => true} markets={[m]} />
      )
      // Scope to the actions cell: the row itself is role="button", and its
      // accessible name is the whole row text.
      const actions = document.querySelector('.mm-table-actions')
      expect(within(actions).getByRole('button', { name: /decrypting/i })).toBeDisabled()
    })

    it('offers a retry when decryption failed', () => {
      const m = wager({ isEncrypted: true, decryptedMetadata: null, decryptionError: 'Signature rejected' })
      render(
        <WagerTable {...baseProps} onDecrypt={vi.fn()} isDecrypting={() => false} markets={[m]} />
      )
      const actions = document.querySelector('.mm-table-actions')
      expect(within(actions).getByRole('button', { name: /retry decrypt/i })).toBeInTheDocument()
      expect(within(actions).queryByRole('button', { name: /^decrypt$/i })).not.toBeInTheDocument()
    })

    it('offers no decrypt control once the terms are revealed', () => {
      const m = wager({ isEncrypted: true, decryptedMetadata: { terms: 'Lakers win outright' } })
      render(
        <WagerTable {...baseProps} onDecrypt={vi.fn()} isDecrypting={() => false} markets={[m]} />
      )
      expect(screen.queryByRole('button', { name: /decrypt/i, exact: false })).not.toBeInTheDocument()
    })
  })

  it('flags a draw proposal on the row (spec 040 US2)', () => {
    const w = wager({ id: '99', drawProposedBy: ME })
    render(<WagerTable {...baseProps} markets={[w]} />)
    expect(screen.getByText('Draw pending')).toBeInTheDocument()
  })

  it('names the opponent on the row by generated name (spec 040 US1)', () => {
    render(<WagerTable {...baseProps} markets={[wager()]} />)
    expect(screen.getByText(deriveAddressName(OTHER).label)).toBeInTheDocument()
  })
})
