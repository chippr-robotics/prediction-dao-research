import { useContext } from 'react'
import { PrivacyContext } from '../contexts/PrivacyContext'

/**
 * Access the tilt-to-hide privacy state (spec 047).
 *
 * Unlike most context hooks this does NOT throw when used outside its provider:
 * it returns a safe "values shown" default so any component that wraps a value in
 * <SensitiveValue> keeps working (unmasked) when rendered without a
 * PrivacyProvider — e.g. in isolated component tests.
 *
 * @returns {{
 *   hidden: boolean,
 *   enabled: boolean,
 *   support: 'unknown'|'supported'|'unsupported',
 *   permission: 'unknown'|'prompt'|'granted'|'denied',
 *   requestMotionPermission: () => Promise<'granted'|'denied'|'unsupported'>,
 * }}
 */
export function usePrivacy() {
  const context = useContext(PrivacyContext)
  if (!context) {
    return {
      hidden: false,
      enabled: false,
      support: 'unknown',
      permission: 'unknown',
      requestMotionPermission: async () => 'unsupported',
    }
  }
  return context
}
