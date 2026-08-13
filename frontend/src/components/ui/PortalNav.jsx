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
 *
 * An item with no `icon` renders no icon tile when expanded (text only) unless it
 * opts in with `showIcon: true`, in which case it gets the same initial-letter
 * fallback the collapsed rail always shows — for entries whose glyph IS their
 * name, like a favorited mini-app's Quick Access shortcut.
 *
 * An item may also carry `matches` — sub-surfaces inside it that a search matched (see
 * lib/nav/filterNav.js). They render as indented shortcut rows beneath their section, so a query
 * that hit a protocol name reaches the actual screen rather than only the section that contains
 * it. Like `collapsibleGroups` this is opt-in by data: an item without `matches` renders exactly
 * as it always has, which is every item on every other surface this component serves.
 *
 * `collapsibleGroups` (spec 081) turns the group headings into accordion toggles.
 * It is OPT-IN and absent by default, because this component is also the Admin
 * Panel's and My Account's rail: when it is not passed, the render path below is
 * byte-for-byte the one those surfaces have always taken (a presentational
 * `<span>` heading followed by bare items). Only the nav drawer passes it. It is
 * also ignored entirely while `collapsed` — the 64px desktop gutter has no room
 * for a control, and every section's glyph must stay reachable there.
 */
import { Fragment, useId } from 'react'
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
  collapsibleGroups,
  emptyMessage,
}) {
  const isTabs = variant === 'tabs'
  // Namespaces the generated `aria-controls` ids so two rails on one page cannot collide.
  const railId = useId()
  // Collapse is a property of the EXPANDED panel only (see the header comment).
  const accordion = collapsed ? null : collapsibleGroups

  const renderItemButton = (item) => (
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
          what it did before — nothing at all — unless the item opted into the
          fallback via `showIcon`. */}
      {(item.icon || item.showIcon || collapsed) && (
        <span className="portal-nav-item-icon" aria-hidden="true">
          {item.icon ? <NavIcon name={item.icon} /> : <span className="portal-nav-item-initial">{item.label?.[0]}</span>}
        </span>
      )}
      <span className="portal-nav-item-label">{item.label}</span>
    </button>
  )

  // Search shortcuts into a section's sub-surfaces. Never rendered in the collapsed gutter — 64px
  // has no room for them, and nothing filters there anyway. The count of anything left out is
  // stated rather than swallowed: a member who typed a broad term should be told the section holds
  // more of them, not shown a truncated list that reads as complete.
  const renderItemMatches = (item) => (
    <div className="portal-nav-matches" role="group" aria-label={`Inside ${item.label}`}>
      {item.matches.map((match) => (
        <button
          key={match.id}
          type="button"
          className="portal-nav-subitem"
          onClick={() => onSelect(match.id)}
        >
          <span className="portal-nav-subitem-label">{match.label}</span>
          {match.summary && <span className="portal-nav-subitem-summary">{match.summary}</span>}
        </button>
      ))}
      {item.matchOverflow > 0 && (
        <span className="portal-nav-matches-more">
          +{item.matchOverflow} more in {item.label}
        </span>
      )}
    </div>
  )

  const renderItem = (item) => {
    if (collapsed || !item.matches?.length) return renderItemButton(item)
    return (
      <Fragment key={item.id}>
        {renderItemButton(item)}
        {renderItemMatches(item)}
      </Fragment>
    )
  }

  // Accordion form: the heading becomes the control, and the items it governs live in a
  // labelled group that is UNMOUNTED when collapsed. Not `display: none` — a heading claiming
  // aria-expanded="false" while its items remain in the DOM and the tab order is claiming
  // something untrue, and query-based tests would keep finding rows the member cannot reach.
  const renderCollapsibleGroup = (group, index) => {
    const key = accordion.keyFor ? accordion.keyFor(group) : group.label
    const expanded = accordion.expanded?.[key] === true
    // The DOM id is sanitized INDEPENDENTLY of the logical key. `key` may be any string a host
    // chooses — with no `keyFor` it is the raw label, and "Quick Access" would put a space in an
    // id. `aria-controls` is a space-separated IDREF list, so that does not merely look wrong: it
    // parses as two references, neither of which exists, and the heading silently controls
    // nothing. The index keeps it unique when two labels sanitize to the same thing.
    const panelId = `${railId}-${index}-${String(key).replace(/[^a-zA-Z0-9_-]+/g, '-')}`
    return (
      <Fragment key={group.label}>
        <button
          type="button"
          className={`portal-nav-group-label portal-nav-group-toggle ${expanded ? 'expanded' : ''}`}
          // "<label> section", not the bare label: a group and one of its items can legitimately
          // share a name (the Apps group holds the single "Apps" catalog entry since spec 073),
          // and two adjacent buttons both announced as "Apps" is ambiguous by ear and ambiguous
          // to a by-name query. The visible text is a substring of this, so WCAG 2.5.3 Label in
          // Name still holds.
          aria-label={`${group.label} section`}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => accordion.onToggle?.(key)}
        >
          <span className="portal-nav-group-toggle-text">{group.label}</span>
          <span className="portal-nav-group-chevron" aria-hidden="true" />
        </button>
        {expanded && (
          <div id={panelId} role="group" aria-label={group.label} className="portal-nav-group-items">
            {group.items.map(renderItem)}
          </div>
        )}
      </Fragment>
    )
  }

  const renderPlainGroup = (group) => (
    <Fragment key={group.label}>
      <span className="portal-nav-group-label" role="presentation">
        {group.label}
      </span>
      {group.items.map(renderItem)}
    </Fragment>
  )

  // A rail filtered down to nothing says so out loud. Rendering an empty panel would read as
  // "the menu is broken", not "nothing matched what you typed".
  const isEmpty = groups ? groups.length === 0 : !items?.length

  return (
    <nav
      id={id}
      className={`portal-nav ${collapsed ? 'portal-nav--collapsed' : ''}`}
      role={isTabs ? 'tablist' : undefined}
      aria-orientation={isTabs ? 'vertical' : undefined}
      aria-label={ariaLabel}
    >
      {isEmpty && emptyMessage ? (
        <p className="portal-nav-empty" role="status">
          {emptyMessage}
        </p>
      ) : groups ? (
        groups.map((group, index) =>
          accordion ? renderCollapsibleGroup(group, index) : renderPlainGroup(group),
        )
      ) : (
        items.map(renderItem)
      )}
    </nav>
  )
}
