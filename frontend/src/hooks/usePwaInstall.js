import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  isInstallPromptHidden,
  isInstallPromptSnoozed,
  setInstallPromptHidden,
  snoozeInstallPromptForSession,
  subscribeInstallPref,
} from '../lib/pwa/installPreference'

/** Is the app currently running as an installed/standalone PWA? */
function detectStandalone() {
  if (typeof window === 'undefined') return false
  const displayModeStandalone =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches)
  // iOS Safari exposes navigator.standalone instead of the display-mode media query.
  const iosStandalone = window.navigator.standalone === true
  return Boolean(displayModeStandalone || iosStandalone)
}

/** iOS Safari never fires `beforeinstallprompt`; installs are manual (Share → Add to Home Screen). */
function detectIos() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent || ''
  const isIosDevice =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as a Mac; disambiguate by touch support.
    (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)
  // Exclude in-app browsers that can't add to home screen anyway (Chrome/Firefox on iOS
  // use CriOS/FxiOS and cannot install; only real Safari can).
  const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)
  return isIosDevice && isSafari
}

// External-store glue so `hidden` stays in sync with the Preferences toggle.
const subscribeHidden = (cb) => subscribeInstallPref(cb)
const getHiddenSnapshot = () => isInstallPromptHidden()
const getHiddenServerSnapshot = () => false

/**
 * usePwaInstall — browser-agnostic PWA install state.
 *
 * Captures the deferred `beforeinstallprompt` event (Chromium) so we can trigger
 * the native install dialog from our own UI, detects iOS (manual-install path) and
 * standalone mode, and exposes the persistent "don't show again" preference plus a
 * per-session snooze.
 *
 * @returns {{
 *   isStandalone: boolean,   // already running as an installed app
 *   isIos: boolean,          // iOS Safari — show manual Add-to-Home-Screen steps
 *   canPrompt: boolean,      // a native install prompt is available to trigger
 *   isInstalled: boolean,    // an install completed during this session
 *   hidden: boolean,         // user permanently opted out ("don't show again")
 *   snoozed: boolean,        // dismissed for this session only
 *   promptInstall: () => Promise<'accepted'|'dismissed'|'unavailable'>,
 *   dismissForSession: () => void,
 *   setHidden: (v: boolean) => void,
 * }}
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isStandalone, setIsStandalone] = useState(detectStandalone)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIos] = useState(detectIos)
  const [snoozed, setSnoozed] = useState(isInstallPromptSnoozed)

  const hidden = useSyncExternalStore(subscribeHidden, getHiddenSnapshot, getHiddenServerSnapshot)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const onBeforeInstallPrompt = (e) => {
      // Prevent Chromium's default mini-infobar so we can present our own bottom-sheet.
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onAppInstalled = () => {
      setDeferredPrompt(null)
      setIsInstalled(true)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    // Track live display-mode changes (e.g. user installs then launches standalone).
    let mql
    const onDisplayChange = () => setIsStandalone(detectStandalone())
    if (typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(display-mode: standalone)')
      mql.addEventListener?.('change', onDisplayChange)
    }

    // Keep the per-session snooze in sync if another surface sets it.
    const unsubscribe = subscribeInstallPref(() => setSnoozed(isInstallPromptSnoozed()))

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      mql?.removeEventListener?.('change', onDisplayChange)
      unsubscribe()
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable'
    deferredPrompt.prompt()
    try {
      const { outcome } = await deferredPrompt.userChoice
      // A deferred prompt can only be used once; drop it regardless of outcome.
      setDeferredPrompt(null)
      return outcome === 'accepted' ? 'accepted' : 'dismissed'
    } catch {
      setDeferredPrompt(null)
      return 'dismissed'
    }
  }, [deferredPrompt])

  const dismissForSession = useCallback(() => {
    snoozeInstallPromptForSession()
    setSnoozed(true)
  }, [])

  const setHidden = useCallback((value) => {
    setInstallPromptHidden(value)
  }, [])

  return {
    isStandalone,
    isIos,
    canPrompt: Boolean(deferredPrompt),
    isInstalled,
    hidden,
    snoozed,
    promptInstall,
    dismissForSession,
    setHidden,
  }
}
