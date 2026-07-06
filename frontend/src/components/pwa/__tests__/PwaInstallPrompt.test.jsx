import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import PwaInstallPrompt from '../PwaInstallPrompt'
import { isInstallPromptHidden } from '../../../lib/pwa/installPreference'

// Fire a fake Chromium beforeinstallprompt event and return the userChoice control.
function fireBeforeInstallPrompt(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt')
  event.prompt = vi.fn()
  event.userChoice = Promise.resolve({ outcome })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

// Advance past the reveal delay (SHOW_DELAY_MS = 1200).
function revealSheet() {
  act(() => {
    vi.advanceTimersByTime(1300)
  })
}

describe('PwaInstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing until an install prompt is available', () => {
    render(<PwaInstallPrompt />)
    revealSheet()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the install sheet after the delay once installable', () => {
    render(<PwaInstallPrompt />)
    fireBeforeInstallPrompt()
    // Not shown immediately...
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    revealSheet()
    // ...shown after the delay.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Install FairWins')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
  })

  it('triggers the native prompt and dismisses on Install', async () => {
    render(<PwaInstallPrompt />)
    const event = fireBeforeInstallPrompt('accepted')
    revealSheet()

    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(event.prompt).toHaveBeenCalledTimes(1)

    // After the choice resolves, the sheet is dismissed for the session.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Don\'t show again" persists the opt-out and hides the sheet', () => {
    render(<PwaInstallPrompt />)
    fireBeforeInstallPrompt()
    revealSheet()

    fireEvent.click(screen.getByRole('button', { name: /don't show again/i }))
    expect(isInstallPromptHidden()).toBe(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Continue in browser" dismisses for the session without persisting opt-out', () => {
    render(<PwaInstallPrompt />)
    fireBeforeInstallPrompt()
    revealSheet()

    fireEvent.click(screen.getByRole('button', { name: /continue in browser/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Not a permanent opt-out.
    expect(isInstallPromptHidden()).toBe(false)
  })

  it('does not show when the user has permanently opted out', () => {
    localStorage.setItem('fw_global_prefs', JSON.stringify({ pwaInstallPromptHidden: true }))
    render(<PwaInstallPrompt />)
    fireBeforeInstallPrompt()
    revealSheet()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
