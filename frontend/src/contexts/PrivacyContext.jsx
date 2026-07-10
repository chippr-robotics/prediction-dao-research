import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { classifyOrientation } from '../lib/privacy/tilt'
import { PrivacyContext } from './PrivacyContext.js'

/**
 * PrivacyProvider — owns the live tilt-to-hide "viewing state" (spec 047).
 *
 * Reads the per-account `tiltToHide` preference, subscribes to
 * `deviceorientation` while enabled, and derives `hidden` (mask now?) from the
 * pure classifier. Degrades to "values shown" on desktop / sensor-less devices
 * or when motion permission is unavailable/denied (FR-008/FR-009). The persisted
 * on/off flag lives in UserPreferencesContext; only the fast-changing viewing
 * state lives here, so orientation updates never touch storage.
 *
 * `support`/`permission` are derived from device capability plus a small amount
 * of event-driven state, so the effect only ever calls setState from async
 * callbacks (the orientation handler and the probe timeout), never synchronously.
 */
export function PrivacyProvider({ children }) {
  const { preferences } = useUserPreferences()
  // Default enabled (FR-003): only an explicit `false` disables it.
  const enabled = preferences?.tiltToHide !== false

  // Event-driven state.
  const [detectedSupport, setDetectedSupport] = useState('unknown') // 'unknown'|'supported'|'unsupported'
  const [permissionState, setPermissionState] = useState('unknown') // 'unknown'|'granted'|'denied'
  const [orientationState, setOrientationState] = useState('viewing')

  const supportsApi =
    typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined'
  const needsPermission =
    supportsApi && typeof window.DeviceOrientationEvent.requestPermission === 'function'
  const motionAllowed = !needsPermission || permissionState === 'granted'

  // Derived, capability-aware views for consumers (US3 messaging).
  const support = !supportsApi ? 'unsupported' : detectedSupport
  const permission = !needsPermission
    ? 'granted'
    : permissionState === 'unknown'
      ? 'prompt'
      : permissionState

  const requestMotionPermission = useCallback(async () => {
    if (!supportsApi) return 'unsupported'
    if (!needsPermission) return 'granted'
    try {
      const result = await window.DeviceOrientationEvent.requestPermission()
      const granted = result === 'granted'
      setPermissionState(granted ? 'granted' : 'denied')
      return granted ? 'granted' : 'denied'
    } catch {
      setPermissionState('denied')
      return 'denied'
    }
  }, [supportsApi, needsPermission])

  useEffect(() => {
    // Only subscribe when enabled, supported, and motion is allowed. All state
    // updates happen inside the async callbacks below (never in the effect body).
    if (!enabled || !supportsApi || !motionAllowed) return undefined

    let current = 'viewing'
    let gotReading = false
    const handleOrientation = (event) => {
      if (event == null || event.beta == null || event.gamma == null) return
      gotReading = true
      setDetectedSupport('supported')
      const next = classifyOrientation({ beta: event.beta, gamma: event.gamma }, current)
      if (next !== current) {
        current = next
        setOrientationState(next)
      }
    }

    window.addEventListener('deviceorientation', handleOrientation)
    // Desktop browsers may expose the API but never fire it — probe and degrade.
    const probe = setTimeout(() => {
      if (!gotReading) setDetectedSupport('unsupported')
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
