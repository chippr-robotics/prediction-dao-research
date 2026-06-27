import { useEffect, useRef } from 'react'

// Spec 030 — a lightweight bottom-sheet overlay for the ClearPath surface, mirroring the "My Wagers" panel
// (centered card on desktop, sheet rising from the bottom on mobile). Keeps the `cp-*` styling and stays
// self-contained (no global modal singleton). Renders nothing when closed; closes on backdrop click + Escape.
export default function CpBottomSheet({ open, onClose, title, children, labelledBy }) {
  const panelRef = useRef(null)
  // Keep the latest onClose in a ref so the open/focus effect depends ONLY on `open`. Otherwise an inline
  // onClose (new identity each render) would re-run the effect on every keystroke and re-focus the panel,
  // stealing focus from the form inputs mid-typing.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.() }
    document.addEventListener('keydown', onKey)
    // Lock background scroll while the sheet is up; restore on close.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (!open) return null

  return (
    <div className="cp-sheet-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div
        ref={panelRef}
        className="cp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title && !labelledBy ? title : undefined}
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <div className="cp-sheet-handle" aria-hidden="true" />
        {title && (
          <div className="cp-sheet-head">
            <h3 className="cp-sheet-title">{title}</h3>
            <button type="button" className="cp-icon-btn cp-sheet-close" onClick={onClose} aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        <div className="cp-sheet-body">{children}</div>
      </div>
    </div>
  )
}
