/**
 * NotificationBell + ActivityFeed tests (spec 012, tasks T014–T016).
 *
 * Read semantics under test (FR-004): opening the feed does NOT mark entries
 * read; acknowledging an entry (click) or the explicit "Mark all read"
 * control does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { MemoryRouter } from 'react-router-dom'

const { ctx, walletState, navigateSpy } = vi.hoisted(() => {
  const ctx = {
    entries: [],
    unreadCount: 0,
    isPolling: false,
    lastPolledAt: null,
    markEntryRead: vi.fn(),
    markWagerRead: vi.fn(),
    markAllRead: vi.fn(),
    actionNeededByWagerId: {},
    actionNeededCount: 0,
    refresh: vi.fn(),
  }
  return {
    ctx,
    walletState: { isConnected: true, account: '0xabc', chainId: 80002 },
    navigateSpy: vi.fn(),
  }
})

vi.mock('../hooks/useWagerActivity', () => ({
  useWagerActivity: () => ctx,
  useWagerActivityOptional: () => (walletState.providerAbsent ? null : ctx),
}))

vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: () => walletState,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateSpy }
})

import NotificationBell from '../components/notifications/NotificationBell'

const NOW = 1765000000000

function entry(overrides = {}) {
  return {
    id: '1:accepted',
    type: 'accepted',
    wagerId: '1',
    message: "0xbbbb…0002 accepted 'Lakers in 6' — it's live",
    severity: 'success',
    actionable: false,
    createdAt: NOW - 60_000,
    read: false,
    ...overrides,
  }
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  ctx.entries = []
  ctx.unreadCount = 0
  ctx.lastPolledAt = NOW
  ctx.markEntryRead.mockClear()
  ctx.markWagerRead.mockClear()
  ctx.markAllRead.mockClear()
  navigateSpy.mockClear()
  walletState.isConnected = true
  walletState.providerAbsent = false
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NotificationBell visibility + a11y (T014/T015)', () => {
  it('renders a button whose aria-label announces the unread count', () => {
    ctx.unreadCount = 3
    renderBell()
    const btn = screen.getByRole('button', { name: 'Notifications, 3 unread' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('shows the count badge only when there are unread entries', () => {
    ctx.unreadCount = 0
    const { rerender } = renderBell()
    expect(screen.queryByTestId('bell-count')).toBeNull()
    ctx.unreadCount = 5
    rerender(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )
    expect(screen.getByTestId('bell-count').textContent).toBe('5')
  })

  it('renders nothing when the wallet is disconnected', () => {
    walletState.isConnected = false
    renderBell()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing outside the provider', () => {
    walletState.providerAbsent = true
    renderBell()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('ActivityFeed open/close + read semantics (T014/T016)', () => {
  it('opens the feed without marking anything read (FR-004)', () => {
    ctx.entries = [entry()]
    ctx.unreadCount = 1
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByRole('dialog', { name: /activity/i })).toBeInTheDocument()
    expect(ctx.markAllRead).not.toHaveBeenCalled()
    expect(ctx.markEntryRead).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Notifications/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('closes on Escape', () => {
    ctx.entries = [entry()]
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByRole('dialog', { name: /activity/i })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog', { name: /activity/i }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /activity/i })).toBeNull()
  })

  it('renders entries in the order provided (newest first) with unread styling', () => {
    ctx.entries = [
      entry({ id: '2:won-claimable', wagerId: '2', message: 'You won! Claim 50 USDC', read: false }),
      entry({ id: '1:accepted', wagerId: '1', read: true }),
    ]
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBe(2)
    expect(items[0].textContent).toContain('You won! Claim 50 USDC')
    expect(items[1].textContent).toContain('accepted')
  })

  it('acknowledging an entry marks it read, navigates to the wager, and closes', () => {
    ctx.entries = [entry()]
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    fireEvent.click(screen.getByRole('button', { name: /accepted 'Lakers in 6'/ }))
    expect(ctx.markEntryRead).toHaveBeenCalledWith('1:accepted')
    expect(navigateSpy).toHaveBeenCalledWith('/app', { state: { openWagerId: '1' } })
    expect(screen.queryByRole('dialog', { name: /activity/i })).toBeNull()
  })

  it('"Mark all read" calls markAllRead and keeps the feed open', () => {
    ctx.entries = [entry()]
    ctx.unreadCount = 1
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }))
    expect(ctx.markAllRead).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: /activity/i })).toBeInTheDocument()
  })

  it('shows the empty state when there are no entries', () => {
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('shows a staleness hint when the last poll is older than 5 minutes', () => {
    ctx.entries = [entry()]
    ctx.lastPolledAt = NOW - 6 * 60_000
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByText(/6m ago/)).toBeInTheDocument()
  })
})

describe('accessibility audit (T030 / FR-014)', () => {
  // axe needs real timers — it times out internally under vi.useFakeTimers.
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('closed bell has no axe violations', async () => {
    ctx.unreadCount = 3
    const { container } = renderBell()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('open feed with entries has no axe violations', async () => {
    ctx.entries = [
      entry(),
      entry({ id: '2:won-claimable', wagerId: '2', message: 'You won! Claim 50 USDC', severity: 'success', actionable: true }),
      entry({ id: '3:warn-acceptance', wagerId: '3', message: "Expires in 10h — accept before it's gone", severity: 'warning', read: true }),
    ]
    ctx.unreadCount = 2
    const { container } = renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
