import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { axe } from 'vitest-axe'
import userEvent from '@testing-library/user-event'
import NotificationPreferencesPanel from '../components/account/NotificationPreferencesPanel'
import { NOTIFICATION_CATEGORIES, getNotificationPrefs } from '../lib/notifications/deliveryPreferences'

// A permission-granted Notification stub so the master push toggle is operable.
function stubNotification(permission = 'granted', requestResult = 'granted') {
  const stub = vi.fn()
  stub.permission = permission
  // Mirror real browser behavior: granting the prompt updates Notification.permission.
  stub.requestPermission = vi.fn().mockImplementation(async () => {
    stub.permission = requestResult
    return requestResult
  })
  vi.stubGlobal('Notification', stub)
}

describe('NotificationPreferencesPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    stubNotification('granted', 'granted')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a category row per notification domain, defaulting to In-app', () => {
    render(<NotificationPreferencesPanel />)
    for (const category of NOTIFICATION_CATEGORIES) {
      const group = screen.getByRole('radiogroup', { name: category.label })
      const inApp = within(group).getByRole('radio', { name: 'In-app' })
      expect(inApp).toHaveAttribute('aria-checked', 'true')
    }
  })

  it('selecting Silent for a category persists the mode', async () => {
    const user = userEvent.setup()
    render(<NotificationPreferencesPanel />)
    const wagers = screen.getByRole('radiogroup', { name: 'Wagers' })
    await user.click(within(wagers).getByRole('radio', { name: 'Silent' }))
    expect(within(wagers).getByRole('radio', { name: 'Silent' })).toHaveAttribute('aria-checked', 'true')
    expect(getNotificationPrefs().modes.wagers).toBe('silent')
  })

  it('enabling mobile push requests permission and flips the master switch on', async () => {
    const user = userEvent.setup()
    Notification.permission = 'default'
    render(<NotificationPreferencesPanel />)
    const master = screen.getByRole('switch', { name: /mobile push/i })
    expect(master).toHaveAttribute('aria-checked', 'false')
    await user.click(master)
    expect(Notification.requestPermission).toHaveBeenCalled()
    expect(master).toHaveAttribute('aria-checked', 'true')
    expect(getNotificationPrefs().pushEnabled).toBe(true)
  })

  it('shows a warning when a category is Push while master push is off', async () => {
    const user = userEvent.setup()
    render(<NotificationPreferencesPanel />) // push off by default
    const dao = screen.getByRole('radiogroup', { name: 'Governance' })
    await user.click(within(dao).getByRole('radio', { name: 'Push' }))
    expect(screen.getByText(/enable mobile push above/i)).toBeInTheDocument()
  })

  it('disables the master switch when notifications are blocked', () => {
    Notification.permission = 'denied'
    render(<NotificationPreferencesPanel />)
    expect(screen.getByRole('switch', { name: /mobile push/i })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<NotificationPreferencesPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
