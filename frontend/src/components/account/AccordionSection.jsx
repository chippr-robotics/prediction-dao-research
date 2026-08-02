/**
 * Collapsible settings section — the building block of the Recovery tab.
 *
 * A settings surface with six stacked panels is unreadable when every panel is
 * expanded at once. Each panel wraps itself in one of these instead: collapsed
 * by default, showing a heading, a one-line `summary` of its current state, and
 * an optional `badge` when something needs attention — so the member can scan
 * the whole tab in one screen and open only what they came for.
 *
 * Behaviour notes:
 * - Uses the AccordionGroup above it when there is one; otherwise keeps its own
 *   open state (so a section still works rendered on its own, e.g. in tests).
 * - Children stay MOUNTED while collapsed (that is what makes the open/close
 *   animation possible) but the region is `inert`, so nothing inside is
 *   focusable or reachable by assistive tech until it is open.
 * - The height animation is CSS-only (`grid-template-rows: 0fr → 1fr`), so it is
 *   compositor-friendly and needs no measuring; it is disabled under
 *   `prefers-reduced-motion`.
 */

import { useId, useState } from 'react'
import PropTypes from 'prop-types'
import { useAccordionGroup } from './accordionContext'
import './AccordionSection.css'

export default function AccordionSection({
  id,
  title,
  summary = null,
  badge = null,
  badgeTone = 'info',
  icon = null,
  defaultOpen = false,
  children,
  className = '',
  'data-testid': dataTestId,
}) {
  const reactId = useId()
  const sectionId = id || reactId
  const group = useAccordionGroup()
  const [localOpen, setLocalOpen] = useState(defaultOpen)

  const open = group ? group.isOpen(sectionId) : localOpen
  const toggle = () => (group ? group.toggle(sectionId) : setLocalOpen((v) => !v))

  const headerId = `${sectionId}-header`
  const regionId = `${sectionId}-region`

  return (
    <section
      className={`acc ${className}`.trim()}
      data-open={open ? 'true' : 'false'}
      data-testid={dataTestId}
    >
      <h3 className="acc__heading">
        <button
          type="button"
          id={headerId}
          className="acc__trigger"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={toggle}
        >
          {icon && <span className="acc__icon" aria-hidden="true">{icon}</span>}
          <span className="acc__text">
            <span className="acc__title">{title}</span>
            {summary && !open && <span className="acc__summary">{summary}</span>}
          </span>
          {badge && <span className={`acc__badge acc__badge--${badgeTone}`}>{badge}</span>}
          <svg className="acc__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h3>

      <div
        className="acc__region"
        id={regionId}
        role="region"
        aria-labelledby={headerId}
        inert={!open}
      >
        <div className="acc__region-inner">
          <div className="acc__body">{children}</div>
        </div>
      </div>
    </section>
  )
}

AccordionSection.propTypes = {
  /** Stable id — required when inside an AccordionGroup so open state survives re-renders. */
  id: PropTypes.string,
  title: PropTypes.node.isRequired,
  /** One-line state summary shown while collapsed (e.g. "Last backup: never"). */
  summary: PropTypes.node,
  /** Short chip shown in the header, typically when the section needs attention. */
  badge: PropTypes.node,
  badgeTone: PropTypes.oneOf(['info', 'warn', 'ok']),
  icon: PropTypes.node,
  defaultOpen: PropTypes.bool,
  children: PropTypes.node,
  className: PropTypes.string,
  'data-testid': PropTypes.string,
}
