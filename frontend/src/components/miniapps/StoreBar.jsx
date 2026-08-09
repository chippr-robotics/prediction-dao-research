/**
 * StoreBar (spec 077, US2) — the store's own section navigation: Market / My Apps / Search.
 *
 * This is presentation state INSIDE the Apps tab, not a second app navigation. Spec 069 settled
 * who owns global navigation (`NAV_GROUPS` + the account button), so the concept art's bottom bar
 * is adapted rather than copied: entries ride the tab's existing `?view=` seam — the same one
 * `view=submit` already uses — which keeps browser Back semantics and bookmarkability for free,
 * and its "Profile" entry is deliberately absent (the host's account controls already are that).
 *
 * Entries are plain links inside a labelled `<nav>`: keyboard-operable by construction, active
 * entry marked `aria-current="page"`. The glyphs sit beside visible text labels, so no meaning
 * rides on iconography alone.
 */
import { Link } from 'react-router-dom'
import NavIcon from '../nav/NavIcon'
import { STORE_VIEWS } from './storeViews'

const ENTRIES = [
  { view: STORE_VIEWS.MARKET, label: 'Market', icon: 'grid', to: '/wallet?tab=apps' },
  { view: STORE_VIEWS.MINE, label: 'My Apps', icon: 'star', to: '/wallet?tab=apps&view=mine' },
  { view: STORE_VIEWS.SEARCH, label: 'Search', icon: 'search', to: '/wallet?tab=apps&view=search' },
]

export default function StoreBar({ active }) {
  return (
    <nav className="miniapp-store-bar" aria-label="Store sections">
      {ENTRIES.map((entry) => {
        const isActive = active === entry.view
        return (
          <Link
            key={entry.view}
            className={`miniapp-store-bar-link${isActive ? ' is-active' : ''}`}
            to={entry.to}
            aria-current={isActive ? 'page' : undefined}
          >
            <NavIcon name={entry.icon} size={18} />
            {entry.label}
          </Link>
        )
      })}
    </nav>
  )
}
