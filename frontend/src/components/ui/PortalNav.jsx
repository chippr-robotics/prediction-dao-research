/**
 * PortalNav — a vertical, admin-portal-style tab rail. Renders the sections
 * down the left side as an accessible vertical tablist. Shared by My Account
 * (WalletPage) and the Admin Panel so both read like a portal.
 *
 * Flat form: pass `items` = [{ id, label }].
 * Grouped form: pass `groups` = [{ label, items: [{ id, label }] }] to break the
 * rail into labelled sections (e.g. Admin / Finance / Tools / Apps). The group
 * labels are presentational headers; every entry stays a tab in the one tablist
 * so keyboard/tablist semantics are unchanged. The active item is reflected with
 * aria-selected and an accent border. Pair with role="tabpanel" content keyed
 * off the same id.
 */
import { Fragment } from 'react'
import './PortalNav.css'

export default function PortalNav({ items, groups, activeId, onSelect, ariaLabel }) {
  const renderItem = (item) => (
    <button
      key={item.id}
      type="button"
      role="tab"
      aria-selected={item.id === activeId}
      className={`portal-nav-item ${item.id === activeId ? 'active' : ''}`}
      onClick={() => onSelect(item.id)}
    >
      {item.icon && (
        <span className="portal-nav-item-icon" aria-hidden="true">{item.icon}</span>
      )}
      <span className="portal-nav-item-label">{item.label}</span>
    </button>
  )

  return (
    <nav
      className="portal-nav"
      role="tablist"
      aria-orientation="vertical"
      aria-label={ariaLabel}
    >
      {groups
        ? groups.map((group) => (
            <Fragment key={group.label}>
              <span className="portal-nav-group-label" role="presentation">
                {group.label}
              </span>
              {group.items.map(renderItem)}
            </Fragment>
          ))
        : items.map(renderItem)}
    </nav>
  )
}
