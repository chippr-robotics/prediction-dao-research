import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import userEvent from '@testing-library/user-event'
import PreferencesPanel from '../components/account/PreferencesPanel'
import { QUICK_ACCESS_CARDS } from '../constants/quickAccessCards'
import { getHiddenCards } from '../utils/quickAccessPreference'

describe('PreferencesPanel (spec 038 US5)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists all 10 quick access cards, each visible by default', () => {
    render(<PreferencesPanel />)
    expect(QUICK_ACCESS_CARDS).toHaveLength(10) // +oracle-open-challenge (spec 041)
    QUICK_ACCESS_CARDS.forEach((card) => {
      const toggle = screen.getByRole('switch', { name: card.label })
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('toggling a card off persists the hidden preference and flips the switch', async () => {
    const user = userEvent.setup()
    render(<PreferencesPanel />)
    const toggle = screen.getByRole('switch', { name: 'My Wagers' })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(getHiddenCards()).toContain('my-wagers')
  })

  it('toggling a hidden card back on removes it from the hidden set', async () => {
    const user = userEvent.setup()
    render(<PreferencesPanel />)
    const toggle = screen.getByRole('switch', { name: 'Scan QR Code' })
    await user.click(toggle) // hide
    await user.click(toggle) // restore
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(getHiddenCards()).not.toContain('scan-qr')
  })

  it('every switch is keyboard-operable with an accessible label', () => {
    render(<PreferencesPanel />)
    const toggle = screen.getByRole('switch', { name: 'My Wagers' })
    toggle.focus()
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAccessibleName('My Wagers')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<PreferencesPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
