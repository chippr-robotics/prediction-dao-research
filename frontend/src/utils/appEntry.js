/**
 * App-entry routing helpers — "how many steps until this visitor can sign?"
 *
 * Nothing in FairWins works without a connected account, so a visitor who has
 * used this browser before should land on the app (and its unlock prompt), not
 * on the marketing page with a "Launch App" button in the way. These helpers
 * answer two questions for the landing route:
 *
 *   hasWalletHistory()   — has this browser ever had an account attached?
 *                          (a recorded passkey, or a wagmi connector it used)
 *   shouldStayOnLanding() — did the visitor deliberately ask for the marketing
 *                          page this tab session? ("Leave" on the entry gate,
 *                          or /?stay=1)
 *
 * The stay flag is sessionStorage, not localStorage: wanting to read the
 * marketing page once is not a durable preference.
 */

import { knownCredentials, isTransactComplete } from '../lib/passkey/credentials'

// wagmi persists the last connector it connected with; `disconnectWallet`
// clears it, so an explicit sign-out correctly reads as "no history".
const RECENT_CONNECTOR_KEY = 'wagmi.recentConnectorId'
const STAY_KEY = 'fairwins.landing.stay.v1'

/** True when this browser has previously attached an account of any kind. */
export function hasWalletHistory() {
  try {
    if (knownCredentials().some(isTransactComplete)) return true
  } catch {
    /* credential book unreadable — fall through to the connector check */
  }
  try {
    return Boolean(localStorage.getItem(RECENT_CONNECTOR_KEY))
  } catch {
    return false
  }
}

/** Remember, for this tab session, that the visitor wants the landing page. */
export function keepOnLanding() {
  try {
    sessionStorage.setItem(STAY_KEY, '1')
  } catch {
    /* storage disabled — the visitor can still use /?stay=1 */
  }
}

export function shouldStayOnLanding() {
  try {
    return sessionStorage.getItem(STAY_KEY) === '1'
  } catch {
    return false
  }
}
