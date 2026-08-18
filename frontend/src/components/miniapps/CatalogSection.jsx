/**
 * CatalogSection — one store section as a BOUNDED, horizontally-scrolling rail.
 *
 * The problem this solves is the PinnedAppsStrip problem at store scale: a
 * category with many apps used to render them all as full-width rows, so one
 * long section pushed every section below it off the screen. A section is now
 * one rail of fixed-width cards — its height is constant whatever the app
 * count — capped at {@link SECTION_VISIBLE_CAP} cards, with a "More" control
 * that opens a MODAL listing the whole set.
 *
 * Two rules carried over from the pinned strip (spec 081), because they were
 * hard-won there:
 *
 *   1. **The cap is disclosed, not silent.** Horizontally-scrollable content
 *      with no affordance is routinely missed, and a truncated list reads as
 *      complete. The "More" control names the section and states how many
 *      cards are beyond the cap.
 *   2. **The control sits BELOW the rail, never inside it.** A trailing card
 *      inside the scroller is the one element most likely to be scrolled out
 *      of view — the disclosure must not depend on the scrolling it discloses.
 *
 * The modal follows AppSheet's dialog mechanics (role="dialog" + aria-modal,
 * Escape, backdrop tap, focus to close on open) and returns focus to the
 * "More" control on close. `dismissLocked` suspends Escape/backdrop dismissal
 * while a child overlay (the app-details sheet) is open above this modal —
 * without it, one Escape press would close both.
 *
 * Rendering is delegated: `renderItem(item)` returns the <li> for one entry,
 * so the registry rows and the operator-tool rows keep their own components
 * and this section stays purely structural.
 */
import { useEffect, useRef, useState } from 'react'

/** Cards shown in the rail before the More control takes over. */
export const SECTION_VISIBLE_CAP = 10

export default function CatalogSection({
  headingId,
  title,
  note,
  items,
  renderItem,
  itemNoun = 'apps',
  dismissLocked = false,
}) {
  const [showAll, setShowAll] = useState(false)
  const moreRef = useRef(null)
  const closeRef = useRef(null)

  const overflowing = items.length > SECTION_VISIBLE_CAP
  const railItems = overflowing ? items.slice(0, SECTION_VISIBLE_CAP) : items
  const hiddenCount = items.length - SECTION_VISIBLE_CAP

  // Focus lands on the modal's close control once, on open (AppSheet's rule).
  useEffect(() => {
    if (showAll) closeRef.current?.focus()
  }, [showAll])

  // Escape dismisses while the modal is mounted — unless a child overlay
  // (the details sheet) is open above it and owns the next Escape.
  useEffect(() => {
    if (!showAll || dismissLocked) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setShowAll(false)
        moreRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showAll, dismissLocked])

  function closeModal() {
    setShowAll(false)
    moreRef.current?.focus()
  }

  return (
    <section className="miniapp-catalog-group" aria-labelledby={headingId}>
      <h4 className="miniapp-catalog-group-title" id={headingId}>
        {title}
      </h4>
      {note}

      <ul className="miniapp-catalog-grid miniapp-catalog-rail">
        {railItems.map(renderItem)}
      </ul>

      {overflowing && (
        <button
          type="button"
          ref={moreRef}
          className="miniapp-catalog-more"
          onClick={() => setShowAll(true)}
        >
          More {title} {itemNoun} (+{hiddenCount})
        </button>
      )}

      {showAll && (
        <div
          className="miniapp-sheet-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !dismissLocked) closeModal()
          }}
        >
          <div
            className="miniapp-sheet miniapp-section-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${headingId}-modal-title`}
          >
            <div className="miniapp-sheet-head">
              <div className="miniapp-sheet-title">
                <h4 id={`${headingId}-modal-title`}>{title}</h4>
                <p className="miniapp-sheet-category">
                  All {items.length} {itemNoun}
                </p>
              </div>
              <button
                type="button"
                ref={closeRef}
                className="miniapp-sheet-close"
                aria-label={`Close the full ${title} list`}
                onClick={closeModal}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="miniapp-glyph">
                  <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <ul className="miniapp-catalog-grid miniapp-section-modal-list">
              {items.map(renderItem)}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}
