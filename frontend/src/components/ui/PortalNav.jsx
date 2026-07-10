/**
 * PortalNav — a vertical, admin-portal-style section rail. Shared by the Admin
 * Panel, the global nav drawer, and other portal-style surfaces.
 *
 * Flat form: pass `items` = [{ id, label, icon? }].
 * Grouped form: pass `groups` = [{ label, items: [...] }] to break the rail into
 * labelled sections (e.g. Finance / Tools / Apps). The group labels are
 * presentational headers.
 *
 * `variant` picks the semantics of the entries:
 *   - 'tabs' (default): a `role="tablist"` of `role="tab"` buttons that switch
 *     panels within the SAME page (active reflected via aria-selected). Pair with
 *     role="tabpanel" content keyed off the same id.
 *   - 'nav': a navigation landmark of plain buttons that route ELSEWHERE (active
 *     reflected via aria-current="page"). Use this when selecting an entry
 *     navigates between routes rather than swapping an in-page panel.
 */
import { Fragment } from 'react'
import './PortalNav.css'

export default function PortalNav({ items, groups, activeId, onSelect, ariaLabel, variant = 'tabs' }) {
  const isTabs = variant === 'tabs'

  const renderItem = (item) => (
    <button
      key={item.id}
      type="button"
      role={isTabs ? 'tab' : undefined}
      aria-selected={isTabs ? item.id === activeId : undefined}
      aria-current={!isTabs && item.id === activeId ? 'page' : undefined}
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
      role={isTabs ? 'tablist' : undefined}
      aria-orientation={isTabs ? 'vertical' : undefined}
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
