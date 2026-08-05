/**
 * Device-scoped preference for which screen the app opens on: the Home
 * surface (pay/request/wager, spec 053/058) or the Portfolio view (spec 074).
 *
 * Left unset ('auto'), the choice follows the viewport — mobile opens on
 * Home, larger screens open on Portfolio, since a member on a bigger display
 * wants to see their balance and assets first rather than a create-a-wager
 * form. A member can still pin either view regardless of device. Follows the
 * homePreference.js pattern: plain localStorage, graceful fallbacks, never
 * throws — the choice must apply on first paint, including while disconnected.
 */

import { HOME_ITEM, PORTFOLIO_PATH } from '../config/appNav'

const LANDING_VIEW_KEY = 'fairwins_landing_view_v1'

export const LANDING_VIEWS = ['auto', 'home', 'portfolio']
const DEFAULT_LANDING_VIEW = 'auto'

/** Raw stored preference; 'auto' on missing/corrupt/unavailable storage. */
export function getLandingViewPreference() {
  try {
    const saved = localStorage.getItem(LANDING_VIEW_KEY)
    return LANDING_VIEWS.includes(saved) ? saved : DEFAULT_LANDING_VIEW
  } catch (error) {
    console.warn('Error reading landing view preference:', error)
    return DEFAULT_LANDING_VIEW
  }
}

/** Persist the landing view preference; invalid values are ignored. */
export function setLandingViewPreference(view) {
  if (!LANDING_VIEWS.includes(view)) return
  try {
    localStorage.setItem(LANDING_VIEW_KEY, view)
  } catch (error) {
    // Private browsing / quota: degrade to session-only default.
    console.warn('Error saving landing view preference:', error)
  }
}

/** Resolve the preference to an actual view, with 'auto' following the viewport. */
export function resolveLandingView(isMobile) {
  const pref = getLandingViewPreference()
  if (pref === 'home' || pref === 'portfolio') return pref
  return isMobile ? 'home' : 'portfolio'
}

/** Resolve the preference straight to the route the app should open on. */
export function resolveLandingPath(isMobile) {
  return resolveLandingView(isMobile) === 'portfolio' ? PORTFOLIO_PATH : HOME_ITEM.to
}
