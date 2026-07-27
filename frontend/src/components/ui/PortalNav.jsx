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
 *
 * `collapsed` renders the icon-only rail: every entry still renders, so the whole
 * section list stays one tap away, but the text label is visually hidden rather
 * than dropped — the button keeps its accessible name, so screen readers and
 * `getByRole('tab', { name })` see the same rail collapsed or expanded. Group
 * headings become hairline rules (a 200px-wide word cannot survive a 64px rail).
 */
import { Fragment } from 'react'
import NavIcon from '../nav/NavIcon'
import './PortalNav.css'

export default function PortalNav({
  items,
  groups,
  activeId,
  onSelect,
  ariaLabel,
  variant = 'tabs',
  collapsed = false,
  id,
}) {
  const isTabs = variant === 'tabs'

  const renderItem = (item) => (
    <button
      key={item.id}
      type="button"
      role={isTabs ? 'tab' : undefined}
      aria-selected={isTabs ? item.id === activeId : undefined}
      aria-current={!isTabs && item.id === activeId ? 'page' : undefined}
      className={`portal-nav-item ${item.id === activeId ? 'active' : ''}`}
      // Collapsed, the glyph is the only thing on screen; the native tooltip is
      // what tells a mouse user which area it is.
      title={collapsed ? item.label : undefined}
      onClick={() => onSelect(item.id)}
    >
      {/* Collapsed, an icon-less item would be an unreadable blank row, so the
          rail falls back to its initial. Expanded, it keeps rendering exactly
          what it did before: nothing at all. */}
      {(item.icon || collapsed) && (
        <span className="portal-nav-item-icon" aria-hidden="true">
          {item.icon ? <NavIcon name={item.icon} /> : <span className="portal-nav-item-initial">{item.label?.[0]}</span>}
        </span>
      )}
      <span className="portal-nav-item-label">{item.label}</span>
    </button>
  )

  return (
    <nav
      id={id}
      className={`portal-nav ${collapsed ? 'portal-nav--collapsed' : ''}`}
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
