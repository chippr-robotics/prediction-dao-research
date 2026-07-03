import { useEffect, useId, useRef, useState } from 'react'
import { fromDatetimeLocal, toDatetimeLocal, formatTileClock, formatTileDay } from './wagerTimeline'
import './SetTimeModal.css'

/**
 * SetTimeModal — the single "type an exact date & time" entry point shared by
 * every deadline timeline in the app (spec 038). Opened by tapping a
 * DeadlineTimeline milestone tile; enforces the same [min, max] bounds as
 * dragging the tile's dot so both entry points agree on what's allowed.
 */
function SetTimeModal({ open, title = 'Set date and time', label, value, min, max, onCancel, onSet }) {
  // value should always be finite by the time this opens; min/max are the
  // safe pure fallbacks if it somehow isn't (never Date.now() — impure).
  const fallbackMs = Number.isFinite(value) ? value : (Number.isFinite(min) ? min : max)
  const [draft, setDraft] = useState(() => toDatetimeLocal(fallbackMs))
  const dialogRef = useRef(null)
  const titleId = useId()
  const inputId = useId()

  // Re-derive the draft from `value` whenever the dialog transitions to open
  // (covers both a fresh mount and a reused instance being reopened for a
  // different milestone). Adjusting state during render on a prop change is
  // the React-recommended alternative to a synchronizing effect.
  const [syncedOpen, setSyncedOpen] = useState(false)
  if (open && !syncedOpen) {
    setSyncedOpen(true)
    setDraft(toDatetimeLocal(fallbackMs))
  } else if (!open && syncedOpen) {
    setSyncedOpen(false)
  }

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      // Minimal focus trap: keep Tab cycling within the dialog's focusable elements.
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const input = dialogRef.current?.querySelector('input')
    input?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  const draftMs = fromDatetimeLocal(draft)
  const inRange = Number.isFinite(draftMs) && draftMs >= min && draftMs <= max
  const rangeText = Number.isFinite(min) && Number.isFinite(max)
    ? `Pick a time between ${formatTileClock(new Date(min))} · ${formatTileDay(new Date(min))} and ` +
      `${formatTileClock(new Date(max))} · ${formatTileDay(new Date(max))}.`
    : null

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onCancel()
  }

  return (
    <div className="stm-backdrop" onClick={handleBackdrop}>
      <div
        className="stm-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 id={titleId} className="stm-title">{title}</h3>
        {label && <label htmlFor={inputId} className="stm-label">{label}</label>}

        <input
          id={inputId}
          type="datetime-local"
          className="stm-input fm-datetime-input"
          value={draft}
          min={Number.isFinite(min) ? toDatetimeLocal(min) : undefined}
          max={Number.isFinite(max) ? toDatetimeLocal(max) : undefined}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={!inRange}
          aria-label={label ? undefined : title}
        />

        {!inRange && rangeText && (
          <p className="stm-error" role="alert">{rangeText}</p>
        )}

        <div className="stm-actions">
          <button type="button" className="fm-btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="fm-btn-primary"
            disabled={!inRange}
            onClick={() => inRange && onSet(draftMs)}
          >
            Set
          </button>
        </div>
      </div>
    </div>
  )
}

export default SetTimeModal
