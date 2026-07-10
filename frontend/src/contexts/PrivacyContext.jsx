import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { classifyOrientation } from '../lib/privacy/tilt'
import { PrivacyContext } from './PrivacyContext.js'

/**
 * PrivacyProvider — owns the live tilt-to-hide "viewing state" (spec 046).
 *
 * Reads the per-account `tiltToHide` preference, subscribes to
 * `deviceorientation` while enabled, and derives `hidden` (mask now?) from the
 * pure classifier. Degrades to "values shown" on desktop / sensor-less devices
 * or when motion permission is unavailable/denied (FR-008/FR-009). The persisted
 * on/off flag lives in UserPreferencesContext; only the fast-changing viewing
 * state lives here, so orientation updates never touch storage.
 */
export function PrivacyProvider({ children }) {
  const { preferences } = useUserPreferences()
  // Default enabled (FR-003): only an explicit `false` disables it.
  const enabled = preferences?.tiltToHide !== false

  const [support, setSupport] = useState('unknown')
  const [permission, setPermission] = useState('unknown')
  const [orientationState, setOrientationState] = useState('viewing')

  const supportsApi =
    typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined'
  const needsPermission =
    supportsApi && typeof window.DeviceOrientationEvent.requestPermission === 'function'
  const motionAllowed = !needsPermission || permission === 'granted'

  const requestMotionPermission = useCallback(async () => {
    if (!supportsApi) {
      setSupport('unsupported')
      return 'unsupported'
    }
    if (!needsPermission) {
      return 'granted'
    }
    try {
      const result = await window.DeviceOrientationEvent.requestPermission()
      const granted = result === 'granted'
      setPermission(granted ? 'granted' : 'denied')
      return granted ? 'granted' : 'denied'
    } catch {
      setPermission('denied')
      return 'denied'
    }
  }, [supportsApi, needsPermission])

  useEffect(() => {
    if (!enabled) {
      setSupport('unknown')
      setPermission('unknown')
      setOrientationState('viewing')
      return undefined
    }
    if (!supportsApi) {
      setSupport('unsupported')
      return undefined
    }
    if (!motionAllowed) {
      // Needs an explicit permission grant (iOS) via a user gesture.
      setPermission((prev) => (prev === 'unknown' ? 'prompt' : prev))
      return undefined
    }

    let current = 'viewing'
    let gotReading = false
    const handleOrientation = (event) => {
      if (event == null || event.beta == null || event.gamma == null) return
      gotReading = true
      setSupport('supported')
      const next = classifyOrientation({ beta: event.beta, gamma: event.gamma }, current)
      if (next !== current) {
        current = next
        setOrientationState(next)
      }
    }

    window.addEventListener('deviceorientation', handleOrientation)
    // Desktop browsers may expose the API but never fire it — probe and degrade.
    const probe = setTimeout(() => {
      if (!gotReading) setSupport('unsupported')
    }, 1500)

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
      clearTimeout(probe)
    }
  }, [enabled, supportsApi, motionAllowed])

  const hidden =
    enabled && support === 'supported' && motionAllowed && orientationState === 'hidden'

  const value = useMemo(
    () => ({ hidden, enabled, support, permission, requestMotionPermission }),
    [hidden, enabled, support, permission, requestMotionPermission],
  )

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}
