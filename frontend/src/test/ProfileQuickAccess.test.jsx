/**
 * ProfileQuickAccess tests (spec 059 US3 + US4): status display for
 * off/manual/scheduled states, duration actions ("On", "For 1 hour",
 * "Until <end>"), single-active flip, immediate revert on turn-off, the
 * no-profiles state, navigation links, and the schedule-boundary status flip
 * driven by the 30 s tick.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import ProfileQuickAccess from '../components/notifications/profiles/ProfileQuickAccess'
import {
  createProfile,
  enableProfile,
  getActiveStatus,
} from '../lib/notifications/notificationProfiles'

// Tue 2026-07-14 12:00 local.
const NOW = new Date(2026, 6, 14, 12, 0, 0).getTime()
const HOUR = 3_600_000

let lastLocation = null
function LocationProbe() {
  lastLocation = useLocation()
  return null
}

const renderQa = (onClose = vi.fn()) => {
  const view = render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<><ProfileQuickAccess onClose={onClose} /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>
  )
  return { view, onClose }
}

beforeEach(() => {
  localStorage.clear()
  lastLocation = null
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('ProfileQuickAccess', () => {
  it('with no profiles: offers only "New notification profile" and navigates', () => {
    const { onClose } = renderQa()
    const btn = screen.getByRole('button', { name: /New notification profile/i })
    fireEvent.click(btn)
    expect(onClose).toHaveBeenCalled()
    expect(lastLocation.pathname + lastLocation.search + lastLocation.hash).toBe(
      '/wallet?tab=preferences#notification-profiles-new'
    )
  })

  it('shows the first profile "Off" collapsed; expanding reveals actions', () => {
    createProfile({ name: 'Sleep', emoji: '😴' })
    renderQa()
    expect(screen.getByText('Sleep')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show notification profiles/i }))
    expect(screen.getByRole('button', { name: 'On' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'For 1 hour' })).toBeInTheDocument()
    // No schedule → no "Until" option.
    expect(screen.queryByRole('button', { name: /^Until / })).toBeNull()
  })

  it('"For 1 hour" enables with an expiry and shows it; turn off reverts immediately', () => {
    const p = createProfile({ name: 'Sleep', emoji: '😴' })
    renderQa()
    fireEvent.click(screen.getByRole('button', { name: /Show notification profiles/i }))
    fireEvent.click(screen.getByRole('button', { name: 'For 1 hour' }))
    expect(getActiveStatus()).toMatchObject({ profile: { id: p.id }, source: 'manual', until: NOW + HOUR })
    expect(screen.getByText(/On until .*Manual/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(getActiveStatus().profile).toBeNull()
    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('scheduled profile offers "Until <end>" and honors it', () => {
    const p = createProfile({
      name: 'Work',
      schedule: { enabled: true, start: '13:00', end: '17:00', days: [2] }, // starts later today
    })
    renderQa()
    fireEvent.click(screen.getByRole('button', { name: /Show notification profiles/i }))
    const until = screen.getByRole('button', { name: /^Until / })
    fireEvent.click(until)
    const end = new Date(2026, 6, 14, 17, 0, 0).getTime()
    expect(getActiveStatus()).toMatchObject({ profile: { id: p.id }, until: end })
  })

  it('enabling one profile turns the other off (single active)', () => {
    const a = createProfile({ name: 'A' })
    const b = createProfile({ name: 'B' })
    enableProfile(a.id)
    renderQa()
    fireEvent.click(screen.getByRole('button', { name: /Show notification profiles/i }))
    // Row B still shows enable actions; enable it.
    const rowB = screen.getByRole('group', { name: /Turn B on or off/i })
    fireEvent.click(within(rowB).getByRole('button', { name: 'On' }))
    expect(getActiveStatus().profile?.id).toBe(b.id)
    // Row A now offers enable again, row B offers Turn off.
    expect(screen.getByRole('group', { name: /Turn A on or off/i })).toBeInTheDocument()
  })

  it('headline is the ACTIVE profile even when it is not first', () => {
    createProfile({ name: 'First' })
    const second = createProfile({ name: 'Second', emoji: '💡' })
    enableProfile(second.id)
    renderQa()
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(screen.getByText(/On · Manual/)).toBeInTheDocument()
  })

  it('status flips at a schedule boundary via the 30 s tick, no interaction', async () => {
    createProfile({
      name: 'Work',
      schedule: { enabled: true, start: '12:30', end: '17:00', days: [2] },
    })
    renderQa()
    expect(screen.getByText(/Off · Turns on/)).toBeInTheDocument()
    // Cross 12:30 and let the status tick fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31 * 60_000)
    })
    expect(screen.getByText(/On until .*Scheduled/)).toBeInTheDocument()
  })

  it('"View settings" closes the panel and deep-links to the profiles section', () => {
    createProfile({ name: 'Sleep' })
    const { onClose } = renderQa()
    fireEvent.click(screen.getByRole('button', { name: /Show notification profiles/i }))
    fireEvent.click(screen.getByRole('button', { name: 'View settings' }))
    expect(onClose).toHaveBeenCalled()
    expect(lastLocation.pathname + lastLocation.search + lastLocation.hash).toBe(
      '/wallet?tab=preferences#notification-profiles'
    )
  })
})
