import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Control the "connected account" the provider sees.
const state = vi.hoisted(() => ({ account: '0xA000000000000000000000000000000000000001' }))
vi.mock('../../hooks/useWeb3', () => ({
  useWeb3: () => ({ account: state.account, isConnected: true }),
}))

import { UserPreferencesProvider } from '../../contexts/UserPreferencesContext.jsx'
import { useUserPreferences } from '../../hooks/useUserPreferences'

const ACCOUNT_A = '0xA000000000000000000000000000000000000001'
const ACCOUNT_B = '0xB000000000000000000000000000000000000002'

function wrapper({ children }) {
  return <UserPreferencesProvider>{children}</UserPreferencesProvider>
}

describe('UserPreferencesContext — tiltToHide (spec 047)', () => {
  beforeEach(() => {
    localStorage.clear()
    state.account = ACCOUNT_A
  })

  it('defaults tiltToHide to true for an account that has not set it', () => {
    const { result } = renderHook(() => useUserPreferences(), { wrapper })
    expect(result.current.preferences.tiltToHide).toBe(true)
  })

  it('setTiltToHide(false) persists to localStorage keyed by account', () => {
    const { result } = renderHook(() => useUserPreferences(), { wrapper })
    act(() => result.current.setTiltToHide(false))
    expect(result.current.preferences.tiltToHide).toBe(false)
    expect(localStorage.getItem(`fw_user_${ACCOUNT_A.toLowerCase()}_tilt_to_hide`)).toBe('false')
  })

  it('reloads the stored value per account', () => {
    localStorage.setItem(`fw_user_${ACCOUNT_A.toLowerCase()}_tilt_to_hide`, 'false')
    const { result } = renderHook(() => useUserPreferences(), { wrapper })
    expect(result.current.preferences.tiltToHide).toBe(false)
  })

  it('keeps each account independent (B stays default-on when A is off)', () => {
    localStorage.setItem(`fw_user_${ACCOUNT_A.toLowerCase()}_tilt_to_hide`, 'false')
    state.account = ACCOUNT_B
    const { result } = renderHook(() => useUserPreferences(), { wrapper })
    expect(result.current.preferences.tiltToHide).toBe(true)
  })
})
