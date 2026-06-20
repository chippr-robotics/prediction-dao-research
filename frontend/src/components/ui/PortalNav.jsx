/**
 * PortalNav — a vertical, admin-portal-style tab rail. Renders the sections
 * down the left side as an accessible vertical tablist. Shared by My Account
 * (WalletPage) and the Admin Panel so both read like a portal.
 *
 * Items: [{ id, label }]. The active item is reflected with aria-selected and
 * an accent border. Pair with role="tabpanel" content keyed off the same id.
 */
import './PortalNav.css'

export default function PortalNav({ items, activeId, onSelect, ariaLabel }) {
  return (
    <nav
      className="portal-nav"
      role="tablist"
      aria-orientation="vertical"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeId}
          className={`portal-nav-item ${item.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
