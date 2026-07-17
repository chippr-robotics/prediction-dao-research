/**
 * ProfileWizard tests (spec 059 US1): the 4-step Signal-style creation flow —
 * presets fill name+emoji, name required, state survives back navigation,
 * schedule skippable, zero-days schedule can't be saved enabled, and Done
 * persists exactly the chosen shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProfileWizard from '../components/notifications/profiles/ProfileWizard'
import { getProfiles } from '../lib/notifications/notificationProfiles'

// Tue 2026-07-14 12:00 local.
const NOW = new Date(2026, 6, 14, 12, 0, 0).getTime()

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

const next = () => fireEvent.click(screen.getByRole('button', { name: /next|skip/i }))

describe('ProfileWizard', () => {
  it('preset fills name and emoji, then Next advances', () => {
    render(<ProfileWizard onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Name your profile' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sleep/ }))
    expect(screen.getByPlaceholderText('Profile name')).toHaveValue('Sleep')
    next()
    expect(screen.getByRole('heading', { name: 'Allowed notifications' })).toBeInTheDocument()
  })

  it('blocks continuing with an empty name', () => {
    render(<ProfileWizard onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'Focus time' } })
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('keeps step state across back/forward navigation', () => {
    render(<ProfileWizard onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'Work' } })
    next()
    fireEvent.click(screen.getByLabelText(/Wagers/))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByPlaceholderText('Profile name')).toHaveValue('Work')
    next()
    expect(screen.getByLabelText(/Wagers/)).toBeChecked()
  })

  it('skipping the schedule creates a manual-only profile with chosen allow-list', () => {
    const onClose = vi.fn()
    render(<ProfileWizard onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Sleep/ }))
    next()
    fireEvent.click(screen.getByLabelText(/Wagers/))
    // Turn one exception off to prove toggles persist.
    fireEvent.click(screen.getByRole('switch', { name: /action-required/i }))
    next()
    expect(screen.getByRole('heading', { name: 'Add a schedule' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('heading', { name: 'Profile created' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
    const [profile] = getProfiles()
    expect(profile).toMatchObject({
      name: 'Sleep',
      emoji: '😴',
      allowedDomains: ['wagers'],
      allowActionRequired: false,
      allowDeadlineReminders: true,
      schedule: null,
    })
  })

  it('an enabled schedule with zero days blocks continuing until a day is picked', () => {
    render(<ProfileWizard onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Focus/ }))
    next()
    next()
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule' }))
    const goBtn = screen.getByRole('button', { name: 'Next' }) // label flips from Skip when enabled
    expect(goBtn).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one day/i)
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(goBtn).toBeEnabled()
    fireEvent.click(goBtn)
    expect(screen.getByRole('heading', { name: 'Profile created' })).toBeInTheDocument()
    const [profile] = getProfiles()
    expect(profile.schedule).toMatchObject({ enabled: true, start: '09:00', end: '17:00', days: [1] })
  })

  it('stores a custom overnight schedule', () => {
    render(<ProfileWizard onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Sleep/ }))
    next()
    next()
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule' }))
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '21:00' } })
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '07:00' } })
    for (const day of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
      fireEvent.click(screen.getByRole('button', { name: day }))
    }
    expect(screen.getByText(/overnight/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    const [profile] = getProfiles()
    expect(profile.schedule).toMatchObject({ enabled: true, start: '21:00', end: '07:00', days: [0, 1, 2, 3, 4, 5, 6] })
  })

  it('warns plainly when nothing at all is allowed', () => {
    render(<ProfileWizard onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Focus/ }))
    next()
    fireEvent.click(screen.getByRole('switch', { name: /action-required/i }))
    fireEvent.click(screen.getByRole('switch', { name: /deadline/i }))
    expect(screen.getByText(/no notifications at all/i)).toBeInTheDocument()
  })

  it('cancel closes without creating anything', () => {
    const onClose = vi.fn()
    render(<ProfileWizard onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new profile' }))
    expect(onClose).toHaveBeenCalled()
    expect(getProfiles()).toHaveLength(0)
  })
})
