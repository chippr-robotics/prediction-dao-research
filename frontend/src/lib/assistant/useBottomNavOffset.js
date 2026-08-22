/**
 * Tether a viewport-fixed control to the mobile bottom nav (spec 095).
 *
 * THE BOTTOM NAV IS NOT ALWAYS THERE, AND ITS HEIGHT IS NOT A TOKEN. `SectionIconNav` renders only
 * on mobile, only with two or more sibling items, and — on `/wallet` — only while connected, so it
 * is absent on Settings, Network, Membership and every disconnected view. Its height is implicit
 * (icon + label + padding + safe area) and existing consumers hardcode `84px` and `64px`. A
 * launcher that assumed either number would float over the nav on one screen and hang in space on
 * the next, so this hook MEASURES the live element instead of adding a fourth magic number.
 *
 * Two observers, because two different things change:
 *   · ResizeObserver — the nav is present and its height changed (font scaling, a label wrapping).
 *   · MutationObserver — the nav appeared or disappeared as the member moved between tabs. React
 *     does not tell us: the nav is rendered by another component in another subtree.
 * Both are coalesced onto one animation frame, and a measurement that did not change never sets
 * state, so an SPA's ordinary DOM churn costs a comparison rather than a render.
 *
 * SAFE AREA IS THE CALLER'S JOB, AND ONLY WHEN THE NAV IS ABSENT: `SectionIconNav.css` already puts
 * `env(safe-area-inset-bottom)` inside its own padding, so the measured height INCLUDES it. Adding
 * it again on top would double-count the inset on exactly the devices that have one. That is why
 * this returns `navPresent` alongside the number rather than a single figure the caller cannot
 * interpret.
 */
import { useEffect, useState } from 'react'

/** The fixed bottom nav's selector. One place; `SectionIconNav.css` owns the class. */
export const BOTTOM_NAV_SELECTOR = '.section-icon-nav'

/** Gap between the nav's top edge and the tethered control. */
export const NAV_GAP_PX = 8

/** Offset used when there is no bottom nav on this screen. */
export const BASE_OFFSET_PX = 16

/**
 * @returns {{offset: number, navPresent: boolean}} `offset` in CSS px from the viewport bottom.
 */
export function useBottomNavOffset() {
  const [state, setState] = useState({ offset: BASE_OFFSET_PX, navPresent: false })

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    let frame = 0
    let observedNav = null
    let cancelled = false

    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null

    function measure() {
      frame = 0
      if (cancelled) return
      const nav = document.querySelector(BOTTOM_NAV_SELECTOR)

      // Re-point the ResizeObserver only when the element identity actually changed.
      if (resizeObserver && nav !== observedNav) {
        if (observedNav) resizeObserver.unobserve(observedNav)
        if (nav) resizeObserver.observe(nav)
        observedNav = nav
      }

      const height = nav ? Math.round(nav.getBoundingClientRect().height) : 0
      const next = nav
        ? { offset: height + NAV_GAP_PX, navPresent: true }
        : { offset: BASE_OFFSET_PX, navPresent: false }
      setState((prev) =>
        prev.offset === next.offset && prev.navPresent === next.navPresent ? prev : next
      )
    }

    function schedule() {
      if (frame) return
      frame =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(measure)
          : setTimeout(measure, 0)
    }

    measure()

    const mutationObserver =
      typeof MutationObserver === 'function'
        ? new MutationObserver(() => schedule())
        : null
    mutationObserver?.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)

    return () => {
      cancelled = true
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      mutationObserver?.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
    }
  }, [])

  return state
}

export default useBottomNavOffset
