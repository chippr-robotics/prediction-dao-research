/**
 * NotificationBell + ActivityFeed tests (spec 031; generalizes spec 012).
 *
 * The bell/feed now consume the unified ActivityProvider context (useActivity). Read semantics (FR-013):
 * opening the feed does NOT mark entries read; acknowledging an entry (click) or "Mark all read" does. The
 * bell surfaces unread AND a distinct action-needed indicator (FR-011).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { MemoryRouter } from 'react-router-dom'
// Raw source check (spec 038 FR-012): jsdom doesn't apply real stylesheets
// (Vitest's default `css: false`), so computed-style assertions can't catch
// a padding regression here — reading the shipped CSS text directly can.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const bellCss = readFileSync(
  resolve(process.cwd(), 'src/components/notifications/NotificationBell.css'),
  'utf-8'
)

const { ctx, walletState, navigateSpy } = vi.hoisted(() => {
  const ctx = {
    entries: [],
    unreadCount: 0,
    actionNeededCount: 0,
    actionNeededByDomain: {},
    isPolling: false,
    lastPolledAt: null,
    markEntryRead: vi.fn(),
    markRefRead: vi.fn(),
    markAllRead: vi.fn(),
    refresh: vi.fn(),
  }
  return {
    ctx,
    walletState: { isConnected: true, account: '0xabc', chainId: 80002 },
    navigateSpy: vi.fn(),
  }
})

vi.mock('../hooks/useActivity', () => ({
  useActivity: () => ctx,
  useActivityOptional: () => (walletState.providerAbsent ? null : ctx),
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
  const wagerId = overrides.wagerId || '1'
  return {
    id: '1:accepted',
    domain: 'wagers',
    refId: wagerId,
    type: 'accepted',
    wagerId,
    message: "0xbbbb…0002 accepted 'Lakers in 6' — it's live",
    severity: 'success',
    actionable: false,
    link: { to: '/app', state: { openWagerId: wagerId } },
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
  ctx.actionNeededCount = 0
  ctx.lastPolledAt = NOW
  ctx.markEntryRead.mockClear()
  ctx.markRefRead.mockClear()
  ctx.markAllRead.mockClear()
  navigateSpy.mockClear()
  walletState.isConnected = true
  walletState.providerAbsent = false
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NotificationBell visibility + a11y', () => {
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
    rerender(<MemoryRouter><NotificationBell /></MemoryRouter>)
    expect(screen.getByTestId('bell-count').textContent).toBe('5')
  })

  it('surfaces a distinct action-needed indicator in the aria-label and a dot (FR-011)', () => {
    ctx.unreadCount = 2
    ctx.actionNeededCount = 2
    renderBell()
    expect(screen.getByRole('button', { name: 'Notifications, 2 unread, 2 need action' })).toBeInTheDocument()
    expect(screen.getByTestId('bell-action')).toBeInTheDocument()
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

  it('caps a large unread count display at "99+" without breaking the header (spec 038 FR-012)', () => {
    ctx.unreadCount = 250
    renderBell()
    expect(screen.getByTestId('bell-count').textContent).toBe('99+')
    expect(screen.getByRole('button', { name: 'Notifications, 250 unread' })).toBeInTheDocument()
  })

  it('.notification-bell resets padding/border so it never inherits the global button rule (spec 038 FR-012)', () => {
    // The global `button { padding: 0.6em 1.2em }` (index.css), combined with
    // the app's border-box reset, crushed the 18px icon whenever the button
    // had more than one child (icon + unread badge) — the shipped CSS must
    // reset padding/box-sizing on this component directly rather than relying
    // on the fragile `button:has(> svg:only-child)` carve-out.
    expect(bellCss).toMatch(/\.notification-bell\s*\{[^}]*padding:\s*0\s*;/)
    expect(bellCss).toMatch(/\.notification-bell\s*\{[^}]*box-sizing:\s*border-box\s*;/)
    expect(bellCss).toMatch(/\.notification-bell\s*\{[^}]*min-width:\s*36px\s*;/)
  })

  it('the bell is keyboard-focusable with an accessible name', () => {
    ctx.unreadCount = 1
    renderBell()
    const btn = screen.getByRole('button', { name: /notifications/i })
    btn.focus()
    expect(btn).toHaveFocus()
  })

  it('has no accessibility violations with an unread badge and action dot both present', async () => {
    ctx.unreadCount = 4
    ctx.actionNeededCount = 1
    const { container } = renderBell()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('ActivityFeed open/close + read semantics', () => {
  it('opens the feed without marking anything read (FR-013)', () => {
    ctx.entries = [entry()]
    ctx.unreadCount = 1
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByRole('dialog', { name: /activity/i })).toBeInTheDocument()
    expect(ctx.markAllRead).not.toHaveBeenCalled()
    expect(ctx.markEntryRead).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Notifications/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes on Escape', () => {
    ctx.entries = [entry()]
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getByRole('dialog', { name: /activity/i })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog', { name: /activity/i }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /activity/i })).toBeNull()
  })

  it('renders entries in the order provided (newest first) with unread styling + domain tag', () => {
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
    expect(items[0].textContent).toContain('Wager') // domain tag
  })

  it('acknowledging an entry marks it read, navigates via its link, and closes', () => {
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

  it('filters the feed by domain when more than one domain is present (FR-025)', () => {
    ctx.entries = [
      entry({ id: 'w1', wagerId: '1', message: 'wager thing', domain: 'wagers' }),
      { id: 'd1', domain: 'dao', refId: '0xdao#5', type: 'voting-open', message: 'DAO vote open', severity: 'info', actionable: true, link: null, createdAt: NOW, read: false },
    ]
    renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'DAO', pressed: false }))
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('DAO vote open')
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

describe('accessibility audit (FR-023)', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('closed bell has no axe violations', async () => {
    ctx.unreadCount = 3
    const { container } = renderBell()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('open feed (multi-domain, filtered) has no axe violations', async () => {
    ctx.entries = [
      entry(),
      entry({ id: '2:won-claimable', wagerId: '2', message: 'You won! Claim 50 USDC', severity: 'success', actionable: true }),
      { id: 'd1', domain: 'dao', refId: '0xdao#5', type: 'voting-open', message: 'A proposal is open for your vote', severity: 'warning', actionable: true, link: null, createdAt: NOW, read: true },
    ]
    ctx.unreadCount = 2
    ctx.actionNeededCount = 2
    const { container } = renderBell()
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
