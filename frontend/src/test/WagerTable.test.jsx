import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WagerTable from '../components/fairwins/WagerTable'

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

describe('WagerTable (spec 018)', () => {
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
})
