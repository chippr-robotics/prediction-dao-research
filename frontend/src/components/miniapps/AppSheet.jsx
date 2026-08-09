/**
 * AppSheet (spec 077 iteration 2, FR-017) — the app-details bottom sheet.
 *
 * Tapping a catalog row opens this sheet; it is where the detail and the actions moved when the
 * rows went store-style. Three rules carried over from the card era, unchanged in meaning:
 *
 *   1. **`verified` decides the actions.** Open and the My Apps toggle exist only for a verified
 *      listing with a usable slug — the same `canFavorite`/launchable pair the cards enforced.
 *      An unverified (stale-snapshot) sheet shows the refusal explanation instead of a disabled
 *      button: the launch is refused on principle, not busy.
 *   2. **The two refusal reasons stay distinct.** "Listing could not be verified" (provenance)
 *      and "name can't be a web address" (slug) are different facts and keep their own copy,
 *      provenance first.
 *   3. **The sheet decides nothing.** It renders what the panel's one fetched listing says;
 *      no fetches, no re-derivation.
 *
 * Dialog mechanics: `role="dialog"` + `aria-modal`, labelled by the app name; dismissed by the
 * close button, a backdrop tap, or Escape (document-level listener while mounted). Focus moves
 * to the close button on open; the PANEL restores focus to the invoking row on close (it owns
 * the row refs). Sheet content scrolls internally so long descriptions never push the actions
 * off-screen.
 */
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { APP_CATEGORY_LABELS } from '../../abis/miniAppRegistry'
import { RocketGlyph } from './appArt'
import { artworkFor } from './appArtwork'

export default function AppSheet({ app, slug, verified, isFavorite, onToggleFavorite, onClose }) {
  const closeRef = useRef(null)
  const titleId = `miniapp-sheet-${app.id}-title`
  const descriptionId = `miniapp-sheet-${app.id}-description`
  const categoryLabel = APP_CATEGORY_LABELS[app.category] ?? `Category ${app.category}`
  const { Art } = artworkFor(slug)
  const openable = verified && Boolean(slug)

  // Focus lands on the close control ONCE, when the sheet opens. This must not share an effect
  // with anything keyed on `onClose`: the panel re-creates that handler every render, so a
  // combined effect re-fires on any state change inside the sheet (toggling My Apps) and steals
  // focus from the control the member just pressed.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // Escape dismisses for as long as the sheet is mounted. Re-attaching when `onClose`'s identity
  // changes is harmless — the listener carries no focus or state of its own.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="miniapp-sheet-backdrop"
      // Backdrop tap dismisses; taps INSIDE the sheet bubble up to this handler too, so only a
      // click that started and ended on the backdrop itself counts.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="miniapp-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="miniapp-sheet-head">
          <div className="miniapp-sheet-art" aria-hidden="true">
            <Art />
          </div>
          <div className="miniapp-sheet-title">
            <h4 id={titleId}>{app.name}</h4>
            <p className="miniapp-sheet-category">{categoryLabel}</p>
          </div>
          <button
            type="button"
            ref={closeRef}
            className="miniapp-sheet-close"
            aria-label={`Close ${app.name} details`}
            onClick={onClose}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="miniapp-glyph">
              <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {app.description && (
          <p className="miniapp-sheet-description" id={descriptionId}>
            {app.description}
          </p>
        )}

        <dl className="miniapp-sheet-meta">
          <div>
            <dt>Vendor</dt>
            <dd>
              <code>{app.vendor || '—'}</code>
            </dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>v{app.approved.version}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{categoryLabel}</dd>
          </div>
        </dl>

        {openable ? (
          <div className="miniapp-sheet-actions">
            <Link
              className="miniapp-sheet-open"
              to={`/apps/${slug}`}
              aria-label={`Open ${app.name}`}
              aria-describedby={app.description ? descriptionId : undefined}
            >
              <RocketGlyph />
              Open
            </Link>
            <button
              type="button"
              className={`miniapp-sheet-favorite${isFavorite ? ' is-active' : ''}`}
              aria-pressed={isFavorite}
              onClick={() => onToggleFavorite(app, slug)}
            >
              {isFavorite ? `Remove ${app.name} from My Apps` : `Add ${app.name} to My Apps`}
            </button>
          </div>
        ) : (
          <p className="miniapp-sheet-refusal" role="note">
            {/* Provenance first: an unverified listing is the reason that matters, whatever else
                is also true of the record. */}
            {!verified
              ? 'Launch unavailable — this listing could not be verified.'
              : 'Launch unavailable — this app’s registered name can’t be used as a web address, so the host has no way to open it. Its vendor needs to re-register it under a usable name.'}
          </p>
        )}
      </div>
    </div>
  )
}
