import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const prefs = vi.hoisted(() => ({ tiltToHide: true }))
vi.mock('../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({ preferences: { tiltToHide: prefs.tiltToHide } }),
}))

import { PrivacyProvider } from '../../contexts/PrivacyContext.jsx'
import { usePrivacy } from '../../hooks/usePrivacy'

function Probe() {
  const { hidden, support, permission } = usePrivacy()
  return (
    <div>
      <span data-testid="hidden">{String(hidden)}</span>
      <span data-testid="support">{support}</span>
      <span data-testid="permission">{permission}</span>
    </div>
  )
}

function renderProvider() {
  return render(
    <PrivacyProvider>
      <Probe />
    </PrivacyProvider>,
  )
}

describe('PrivacyProvider (spec 047)', () => {
  beforeEach(() => {
    prefs.tiltToHide = true
    delete window.DeviceOrientationEvent.requestPermission
  })
  afterEach(() => {
    delete window.DeviceOrientationEvent.requestPermission
  })

  it('masks when the device is laid flat and reveals when lifted', () => {
    renderProvider()
    expect(screen.getByTestId('hidden').textContent).toBe('false')

    act(() => global.dispatchOrientation({ beta: 0, gamma: 0 })) // flat
    expect(screen.getByTestId('hidden').textContent).toBe('true')
    expect(screen.getByTestId('support').textContent).toBe('supported')

    act(() => global.dispatchOrientation({ beta: 70, gamma: 0 })) // viewing
    expect(screen.getByTestId('hidden').textContent).toBe('false')
  })

  it('never masks when the preference is off, and attaches no listener', () => {
    prefs.tiltToHide = false
    const addSpy = vi.spyOn(window, 'addEventListener')
    renderProvider()
    const orientationSubs = addSpy.mock.calls.filter((c) => c[0] === 'deviceorientation')
    expect(orientationSubs.length).toBe(0)
    act(() => global.dispatchOrientation({ beta: 0, gamma: 0 }))
    expect(screen.getByTestId('hidden').textContent).toBe('false')
    addSpy.mockRestore()
  })

  it('degrades to shown (unsupported) when the orientation API is absent', () => {
    const original = window.DeviceOrientationEvent
    delete window.DeviceOrientationEvent
    try {
      renderProvider()
      expect(screen.getByTestId('support').textContent).toBe('unsupported')
      expect(screen.getByTestId('hidden').textContent).toBe('false')
    } finally {
      window.DeviceOrientationEvent = original
    }
  })

  it('does not mask on iOS until motion permission is granted', () => {
    window.DeviceOrientationEvent.requestPermission = vi.fn(async () => 'denied')
    renderProvider()
    // No grant yet → prompt state, no masking even if a flat event somehow fires.
    expect(screen.getByTestId('permission').textContent).toBe('prompt')
    act(() => global.dispatchOrientation({ beta: 0, gamma: 0 }))
    expect(screen.getByTestId('hidden').textContent).toBe('false')
  })

  it('removes its orientation listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderProvider()
    unmount()
    const removed = removeSpy.mock.calls.some((c) => c[0] === 'deviceorientation')
    expect(removed).toBe(true)
    removeSpy.mockRestore()
  })
})
