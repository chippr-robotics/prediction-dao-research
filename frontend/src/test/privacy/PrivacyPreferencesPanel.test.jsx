import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import PrivacyPreferencesPanel from '../../components/account/PrivacyPreferencesPanel'

const mockPrefs = vi.hoisted(() => ({
  preferences: { tiltToHide: true },
  setTiltToHide: vi.fn(),
}))
const mockPrivacy = vi.hoisted(() => ({
  hidden: false,
  enabled: true,
  support: 'supported',
  permission: 'granted',
  requestMotionPermission: vi.fn(async () => 'granted'),
}))

vi.mock('../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => mockPrefs,
}))
vi.mock('../../hooks/usePrivacy', () => ({
  usePrivacy: () => mockPrivacy,
}))

beforeEach(() => {
  mockPrefs.preferences = { tiltToHide: true }
  mockPrefs.setTiltToHide = vi.fn()
  mockPrivacy.support = 'supported'
  mockPrivacy.permission = 'granted'
  mockPrivacy.requestMotionPermission = vi.fn(async () => 'granted')
})

describe('PrivacyPreferencesPanel (spec 046)', () => {
  it('renders an accessible switch that is on by default', () => {
    render(<PrivacyPreferencesPanel />)
    const toggle = screen.getByRole('switch', { name: /hide balances when phone is flat/i })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/hide when you lay your phone flat/i)).toBeInTheDocument()
  })

  it('turns tilt-to-hide off on click', () => {
    render(<PrivacyPreferencesPanel />)
    fireEvent.click(screen.getByRole('switch', { name: /hide balances when phone is flat/i }))
    expect(mockPrefs.setTiltToHide).toHaveBeenCalledWith(false)
  })

  it('describes the off state and turns back on', () => {
    mockPrefs.preferences = { tiltToHide: false }
    render(<PrivacyPreferencesPanel />)
    const toggle = screen.getByRole('switch', { name: /hide balances when phone is flat/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/stay visible regardless/i)).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(mockPrefs.setTiltToHide).toHaveBeenCalledWith(true)
  })

  it('requests motion permission when enabling and permission is not yet granted', () => {
    mockPrefs.preferences = { tiltToHide: false }
    mockPrivacy.permission = 'prompt'
    render(<PrivacyPreferencesPanel />)
    fireEvent.click(screen.getByRole('switch', { name: /hide balances when phone is flat/i }))
    expect(mockPrivacy.requestMotionPermission).toHaveBeenCalled()
  })

  it('communicates that the feature is mobile-only on unsupported devices', () => {
    mockPrivacy.support = 'unsupported'
    render(<PrivacyPreferencesPanel />)
    expect(screen.getByText(/mobile device with motion sensing/i)).toBeInTheDocument()
  })

  it('surfaces a denied motion permission', () => {
    mockPrivacy.permission = 'denied'
    render(<PrivacyPreferencesPanel />)
    expect(screen.getByText(/motion access was denied/i)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(<PrivacyPreferencesPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
