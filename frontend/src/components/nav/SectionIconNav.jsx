import { useIsMobile } from '../../hooks/useMediaQuery'
import './SectionIconNav.css'

/**
 * SectionIconNav — a mobile-only bottom bar that pins the current section's
 * sibling sub-items as tap targets, so a user deep in one area (Finance, Tools,
 * an Admin section…) can jump between its related views without reopening the
 * menu.
 *
 * Presentational: the host passes the sibling `items` (each `{ id, label, icon }`),
 * the `activeId`, and an `onSelect`. Renders nothing on desktop or when there are
 * fewer than two siblings (a single view has nothing to switch between).
 */
export default function SectionIconNav({ items = [], activeId, onSelect, ariaLabel = 'Section navigation' }) {
  const isMobile = useIsMobile()

  if (!isMobile || items.length < 2) return null

  return (
    <nav className="section-icon-nav" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`section-icon-nav-item ${item.id === activeId ? 'active' : ''}`}
          aria-current={item.id === activeId ? 'page' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <span className="section-icon-nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="section-icon-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
