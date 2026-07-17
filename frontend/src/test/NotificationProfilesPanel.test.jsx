/**
 * NotificationProfilesPanel tests (spec 059 US1 + US5): empty state, wizard
 * entry, listing with truthful status, per-profile on/off, editing every
 * attribute, and deletion (including the active profile).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationProfilesPanel from '../components/account/NotificationProfilesPanel'
import {
  createProfile,
  enableProfile,
  getProfiles,
  getProfile,
  getActiveStatus,
} from '../lib/notifications/notificationProfiles'

// Tue 2026-07-14 12:00 local.
const NOW = new Date(2026, 6, 14, 12, 0, 0).getTime()

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

const renderPanel = () =>
  render(
    <MemoryRouter>
      <NotificationProfilesPanel />
    </MemoryRouter>
  )

describe('NotificationProfilesPanel', () => {
  it('shows the empty state and opens the wizard from "New profile"', () => {
    renderPanel()
    expect(screen.getByText(/No profiles yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /New profile/i }))
    expect(screen.getByRole('heading', { name: 'Name your profile' })).toBeInTheDocument()
  })

  it('lists created profiles with name, emoji, and Off status', () => {
    createProfile({ name: 'Sleep', emoji: '😴' })
    renderPanel()
    expect(screen.getByText('Sleep')).toBeInTheDocument()
    expect(screen.getByText('😴')).toBeInTheDocument()
    expect(screen.getByText('Off', { selector: '.notif-profiles-status' })).toBeInTheDocument()
  })

  it('per-profile switch enables and disables the profile', () => {
    const p = createProfile({ name: 'Sleep' })
    renderPanel()
    const toggle = screen.getByRole('switch', { name: /Sleep profile off/i })
    fireEvent.click(toggle)
    expect(getActiveStatus().profile?.id).toBe(p.id)
    expect(screen.getByText(/On · Manual/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: /Sleep profile on/i }))
    expect(getActiveStatus().profile).toBeNull()
  })

  it('shows scheduled status truthfully (on until end, off with next start)', () => {
    createProfile({
      name: 'Work',
      schedule: { enabled: true, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] },
    })
    renderPanel()
    expect(screen.getByText(/On until .*Scheduled/)).toBeInTheDocument()
  })

  it('edits every attribute through the inline editor', () => {
    const p = createProfile({ name: 'Work', emoji: '💪', allowedDomains: ['wagers'] })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = screen.getByRole('group', { name: /Edit profile Work/ })
    fireEvent.change(within(editor).getByPlaceholderText('Profile name'), { target: { value: 'Deep Work' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Focus emoji' }))
    fireEvent.click(within(editor).getByLabelText('Custody'))
    fireEvent.click(within(editor).getByRole('switch', { name: /action-required/i }))
    // Add a schedule.
    fireEvent.click(within(editor).getByRole('switch', { name: 'Schedule' }))
    fireEvent.click(within(editor).getByRole('button', { name: 'Tuesday' }))
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }))
    expect(getProfile(p.id)).toMatchObject({
      name: 'Deep Work',
      emoji: '💡',
      allowedDomains: ['wagers', 'custody'],
      allowActionRequired: false,
      schedule: { enabled: true, days: [2] },
    })
    // Schedule covering now (Tue 09:00–17:00) makes it active immediately.
    expect(getActiveStatus().profile?.id).toBe(p.id)
  })

  it('deleting the active profile clears activation and the row', () => {
    const p = createProfile({ name: 'Sleep' })
    enableProfile(p.id)
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(getProfiles()).toHaveLength(0)
    expect(getActiveStatus().profile).toBeNull()
    expect(screen.getByText(/No profiles yet/i)).toBeInTheDocument()
  })

  it('embeds the base-layer delivery controls behind a "Delivery settings" disclosure', () => {
    renderPanel()
    const toggle = screen.getByRole('button', { name: /Delivery settings/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Collapsed: base-layer controls hidden; no duplicate standalone heading anywhere.
    expect(screen.queryByText('Mobile push notifications')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Mobile push notifications')).toBeInTheDocument()
    // Embedded mode drops the old panel's own "Notifications" heading.
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull()
  })

  it('Save is blocked while the schedule is enabled with no days', () => {
    createProfile({ name: 'Work' })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = screen.getByRole('group', { name: /Edit profile Work/ })
    fireEvent.click(within(editor).getByRole('switch', { name: 'Schedule' }))
    expect(within(editor).getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
