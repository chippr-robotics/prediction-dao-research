import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './InfoTip.css'

// Any InfoTip announcing it opened closes every other one, so at most one
// bubble exists document-wide (spec 039 FR-004) without shared state.
const OPEN_EVENT = 'fairwins:infotip-open'
const EDGE_GUTTER = 8

/**
 * InfoTip (spec 039) — the shared tap-to-reveal help toggletip: an ⓘ button
 * beside a form label that shows one static explainer in a speech bubble.
 * Tap/click/Enter/Space toggles; outside-tap or Escape dismisses (Escape is
 * swallowed so an enclosing modal's own Escape handler doesn't also fire).
 * Contract: specs/039-wager-info-tooltips/contracts/infotip-component.md.
 *
 * `bubbleRole` is for the ScreeningInfoButton wrapper only (rich dialog
 * content); wager views must not pass it.
 */
export default function InfoTip({ label, children, className = '', bubbleRole = 'note' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const bubbleRef = useRef(null)
  const instanceId = useId()
  const regionId = `infotip-${instanceId}`

  useEffect(() => {
    const onOtherOpen = (e) => { if (e.detail !== instanceId) setOpen(false) }
    document.addEventListener(OPEN_EVENT, onOtherOpen)
    return () => document.removeEventListener(OPEN_EVENT, onOtherOpen)
  }, [instanceId])

  useEffect(() => {
    if (!open) return undefined
    const onDocMouseDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKeyCapture = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyCapture, true)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyCapture, true)
    }
  }, [open])

  // Keep the opened bubble fully inside the viewport (spec 039 FR-008):
  // shift horizontally away from the side edges, flip above the icon when
  // there is no room below. Skipped when layout isn't real (jsdom).
  useLayoutEffect(() => {
    if (!open) return
    const el = bubbleRef.current
    if (!el) return
    el.style.removeProperty('--infotip-shift')
    el.classList.remove('infotip-bubble-above')
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    const vw = document.documentElement.clientWidth || window.innerWidth
    let shift = 0
    if (rect.right > vw - EDGE_GUTTER) shift = vw - EDGE_GUTTER - rect.right
    if (rect.left + shift < EDGE_GUTTER) shift = EDGE_GUTTER - rect.left
    if (shift !== 0) el.style.setProperty('--infotip-shift', `${shift}px`)
    const vh = window.innerHeight || document.documentElement.clientHeight
    if (vh && rect.bottom > vh - EDGE_GUTTER && rect.top > rect.height + EDGE_GUTTER) {
      el.classList.add('infotip-bubble-above')
    }
  }, [open, children])

  const handleToggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: instanceId }))
    setOpen(true)
  }

  return (
    <span className={`infotip-wrap ${className}`.trim()} ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className="infotip-btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={handleToggle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      <span id={regionId} className="infotip-region" aria-live="polite">
        {open && (
          <span
            className="infotip-bubble"
            ref={bubbleRef}
            role={bubbleRole}
            aria-label={bubbleRole === 'dialog' ? label : undefined}
          >
            {children}
          </span>
        )}
      </span>
    </span>
  )
}
