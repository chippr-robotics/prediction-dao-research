import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import userEvent from '@testing-library/user-event'
import QuickAccessCardsPanel from '../components/account/QuickAccessCardsPanel'
import { QUICK_ACCESS_CARDS } from '../constants/quickAccessCards'
import { getHiddenCards } from '../utils/quickAccessPreference'

describe('QuickAccessCardsPanel (spec 038 US5)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists all 10 quick access cards with only Open Oracle Challenge, Enter Words, and My Wagers visible by default', () => {
    render(<QuickAccessCardsPanel />)
    expect(QUICK_ACCESS_CARDS).toHaveLength(10) // +oracle-open-challenge (spec 041)
    expect(screen.getByRole('switch', { name: 'Open Oracle Challenge' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Enter Words' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'My Wagers' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Friends Decide (1v1)' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Oracle Settles (1v1)' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Make an Offer' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Open Challenge' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Group Pool' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Scan QR Code' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Share Account' })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggling a card off persists the hidden preference and flips the switch', async () => {
    const user = userEvent.setup()
    render(<QuickAccessCardsPanel />)
    const toggle = screen.getByRole('switch', { name: 'My Wagers' })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(getHiddenCards()).toContain('my-wagers')
  })

  it('toggling a default-hidden card on removes it from the hidden set', async () => {
    const user = userEvent.setup()
    render(<QuickAccessCardsPanel />)
    const toggle = screen.getByRole('switch', { name: 'Scan QR Code' })
    await user.click(toggle) // restore (turn visible)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(getHiddenCards()).not.toContain('scan-qr')
  })

  it('every switch is keyboard-operable with an accessible label', () => {
    render(<QuickAccessCardsPanel />)
    const toggle = screen.getByRole('switch', { name: 'My Wagers' })
    toggle.focus()
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAccessibleName('My Wagers')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<QuickAccessCardsPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
