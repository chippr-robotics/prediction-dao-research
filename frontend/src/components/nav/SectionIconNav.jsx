import { useLayoutEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../hooks/useMediaQuery'
import NavIcon from './NavIcon'
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
 *
 * The active tab is marked by a pill that slides beneath the selected icon —
 * measured against the actual DOM layout so it tracks precisely regardless of
 * label width or item count, then animated with a spring easing on change.
 */
export default function SectionIconNav({ items = [], activeId, onSelect, ariaLabel = 'Section navigation' }) {
  const isMobile = useIsMobile()
  const navRef = useRef(null)
  const iconRefs = useRef({})
  const [indicator, setIndicator] = useState(null)

  useLayoutEffect(() => {
    const navEl = navRef.current
    const iconEl = iconRefs.current[activeId]

    const measure = () => {
      if (!navEl || !iconEl) {
        setIndicator(null)
        return
      }
      const navRect = navEl.getBoundingClientRect()
      const iconRect = iconEl.getBoundingClientRect()
      setIndicator({
        left: iconRect.left - navRect.left,
        top: iconRect.top - navRect.top,
        width: iconRect.width,
        height: iconRect.height,
      })
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [activeId, items])

  if (!isMobile || items.length < 2) return null

  return (
    <nav className="section-icon-nav" aria-label={ariaLabel} ref={navRef}>
      {indicator && (
        <span
          className="section-icon-nav-indicator"
          aria-hidden="true"
          style={{
            transform: `translate(${indicator.left}px, ${indicator.top}px)`,
            width: indicator.width,
            height: indicator.height,
          }}
        />
      )}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`section-icon-nav-item ${item.id === activeId ? 'active' : ''}`}
          aria-current={item.id === activeId ? 'page' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <span
            className="section-icon-nav-icon"
            aria-hidden="true"
            ref={(el) => { iconRefs.current[item.id] = el }}
          >
            <NavIcon name={item.icon} size={20} />
          </span>
          <span className="section-icon-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
