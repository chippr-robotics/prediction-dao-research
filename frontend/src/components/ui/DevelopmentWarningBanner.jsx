import { useState, useEffect, useRef } from 'react'
import './DevelopmentWarningBanner.css'

const DEV_WARNING_DISMISSED_KEY = 'dev_warning_banner_dismissed'
const DEV_BANNER_HEIGHT_VAR = '--dev-banner-height'

/**
 * Border-box height of the banner as it is actually laid out.
 *
 * Prefer the observation the browser handed us (`borderBoxSize`, which includes the padding the
 * old hardcoded constant tried to add up by hand); fall back to measuring the element when the
 * entry is absent (first paint, the resize-listener path) or reports only a content box.
 *
 * `borderBoxSize` is an array in the spec and a bare object in older Firefox — accept both.
 */
function observedHeight(element, entry) {
  const box = entry?.borderBoxSize
  const blockSize = Array.isArray(box) ? box[0]?.blockSize : box?.blockSize
  if (typeof blockSize === 'number') return blockSize
  const rect = element?.getBoundingClientRect?.()
  return typeof rect?.height === 'number' ? rect.height : 0
}

/**
 * Dismissible warning banner displayed at the top of the site
 * to inform users that the site is under active development.
 *
 * The banner is `position: fixed`, so it occupies no flow space of its own. It publishes its
 * height on <html> as the `--dev-banner-height` custom property, and two kinds of consumer read
 * it: the app shell reserves it as `padding-top` (App.css), and every other fixed or sticky
 * surface offsets itself by it — the header (Header.css), the nav drawer (AppNavDrawer.css) and
 * the network-error banner (App.css).
 *
 * That height is MEASURED, never assumed: this copy fits one line on a desktop and wraps to
 * roughly three at 390px, so any constant is wrong at some width, and the banner then covers the
 * controls underneath it (issue #1248 — it hid the wallet-connect button outright). Publish what
 * the element actually renders and the reservation is correct at every width, in every font size,
 * in every language.
 */
function DevelopmentWarningBanner() {
  // Initialize state from localStorage to avoid effect
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem(DEV_WARNING_DISMISSED_KEY) === 'true'
  })
  const bannerRef = useRef(null)

  // Publish the banner's real height as a CSS custom property, and keep it in step as the banner
  // reflows.
  useEffect(() => {
    const root = document.documentElement
    const clear = () => root.style.removeProperty(DEV_BANNER_HEIGHT_VAR)

    if (isDismissed) {
      root.style.setProperty(DEV_BANNER_HEIGHT_VAR, '0px')
      return clear
    }

    const element = bannerRef.current
    if (!element) return clear

    const publish = (entry) => {
      // Round up: a sub-pixel under-reservation is a sub-pixel overlap.
      const height = Math.ceil(observedHeight(element, entry))
      root.style.setProperty(DEV_BANNER_HEIGHT_VAR, `${height}px`)
    }

    publish()

    if (typeof ResizeObserver === 'undefined') {
      // No observer available: a width change is the only reflow trigger we can still see.
      const onResize = () => publish()
      window.addEventListener('resize', onResize)
      return () => {
        window.removeEventListener('resize', onResize)
        clear()
      }
    }

    const observer = new ResizeObserver((entries) => {
      publish(entries[entries.length - 1])
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      clear()
    }
  }, [isDismissed])

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem(DEV_WARNING_DISMISSED_KEY, 'true')
  }

  if (isDismissed) {
    return null
  }

  return (
    <div
      className="dev-warning-banner"
      data-testid="dev-warning-banner"
      ref={bannerRef}
      role="alert"
      aria-live="polite"
    >
      <div className="dev-warning-content">
        <span className="dev-warning-icon" aria-hidden="true">⚠️</span>
        <span className="dev-warning-text">
          This site is under active development. Check back soon!{' '}
          <a
            href="https://chipprbots.com"
            target="_blank"
            rel="noopener noreferrer"
            className="dev-warning-link"
          >
            Visit chipprbots.com
          </a>
          {' '}for updates.
        </span>
        <button
          className="dev-warning-close"
          onClick={handleDismiss}
          aria-label="Dismiss warning banner"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default DevelopmentWarningBanner
