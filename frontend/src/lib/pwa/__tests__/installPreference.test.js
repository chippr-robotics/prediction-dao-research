import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  INSTALL_PROMPT_HIDDEN_KEY,
  isInstallPromptHidden,
  setInstallPromptHidden,
  isInstallPromptSnoozed,
  snoozeInstallPromptForSession,
  subscribeInstallPref,
} from '../installPreference'

describe('installPreference', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('defaults to not hidden and not snoozed', () => {
    expect(isInstallPromptHidden()).toBe(false)
    expect(isInstallPromptSnoozed()).toBe(false)
  })

  it('persists the permanent hidden flag to localStorage', () => {
    setInstallPromptHidden(true)
    expect(isInstallPromptHidden()).toBe(true)
    // Stored under the global prefs bucket, not wallet-scoped.
    const bucket = JSON.parse(localStorage.getItem('fw_global_prefs'))
    expect(bucket[INSTALL_PROMPT_HIDDEN_KEY]).toBe(true)

    setInstallPromptHidden(false)
    expect(isInstallPromptHidden()).toBe(false)
  })

  it('snoozes only for the session (sessionStorage, not localStorage)', () => {
    snoozeInstallPromptForSession()
    expect(isInstallPromptSnoozed()).toBe(true)
    expect(localStorage.getItem('fw_global_prefs')).toBeNull()
  })

  it('notifies subscribers when the hidden flag changes', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeInstallPref(cb)
    setInstallPromptHidden(true)
    expect(cb).toHaveBeenCalledTimes(1)
    unsubscribe()
    setInstallPromptHidden(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers when snoozed', () => {
    const cb = vi.fn()
    const unsubscribe = subscribeInstallPref(cb)
    snoozeInstallPromptForSession()
    expect(cb).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
