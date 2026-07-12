/**
 * WagersPage (spec 053) — the `/wagers` destination. The full quick-action grid (every create type
 * + track/share action) and its modals were relocated here off the home screen, which now opens on
 * the inline create-a-challenge view. The grid + modal wiring lives in the Dashboard component,
 * rendered here under the "Wagers" navigation entry.
 */
import Dashboard from './Dashboard'

function WagersPage() {
  return <Dashboard />
}

export default WagersPage
