import { useState } from 'react'
import { artworkFor } from '../miniapps/appArtwork'
import NavIcon from './NavIcon'

/**
 * PinnedAppsStrip (spec 081) — the member's pinned mini-apps as one horizontal row of icon
 * tiles at the top of the expanded nav drawer.
 *
 * WHY A STRIP. Pinning used to append a full-width labelled row to Quick Access, and pins are
 * unbounded — so the one section of the menu the member controls was the one section that could
 * push Finance and Tools off the bottom of a phone screen. A strip bounds the region at ONE row's
 * height no matter how many apps are pinned: five pins and fifty pins render the same drawer
 * height.
 *
 * WHY ALSO A CAP. The strip scrolls horizontally, but horizontally-scrollable content with no
 * visible affordance is routinely missed. Past `VISIBLE_PINNED_CAP` a control states how many are
 * hidden and reveals them in place — the count is the honest disclosure that something is out of
 * view, not just a way to reach it. That control sits BELOW the row rather than at the end of it:
 * inside the scroller it was the first thing pushed out of sight, which made the one element whose
 * job is to disclose hidden pins the element most likely to be hidden.
 *
 * Expansion is component-local on purpose: it is a momentary view choice for one drawer
 * session, not a preference worth persisting across devices and reloads.
 *
 * Home and Portfolio deliberately do NOT live here. They are destinations the product ships and
 * that a first-time member needs to READ; only the member-grown, unbounded set becomes tiles.
 */

/** How many tiles show before the overflow control takes over. A constant, not a setting. */
export const VISIBLE_PINNED_CAP = 5

export default function PinnedAppsStrip({ items, activeId, onSelect }) {
  const [showAll, setShowAll] = useState(false)

  // No pins ⇒ no region at all. An empty shortcuts strip is a label with nothing behind it.
  if (!items?.length) return null

  const overflowing = items.length > VISIBLE_PINNED_CAP
  const visible = overflowing && !showAll ? items.slice(0, VISIBLE_PINNED_CAP) : items
  const hiddenCount = items.length - VISIBLE_PINNED_CAP

  return (
    <div
      className={`pinned-apps-strip ${showAll ? 'pinned-apps-strip--all' : ''}`}
      role="group"
      aria-label="Pinned apps"
    >
      <div className="pinned-apps-row">
        {visible.map((item) => {
          // The same curated store artwork the catalog card shows (spec 077), keyed by the same
          // slug the launch route uses — a shortcut should look like the thing it launches. It is
          // TOTAL, so an app the host has no art for gets the generic illustration rather than a
          // broken image; the label underneath is what separates two generics, which is exactly
          // how the store's own rows behave. A pinned ADMIN TOOL (spec 093 follow-up) has no
          // registry slug to key artwork by; its tile shows the tool's own NavIcon glyph — the
          // same mark its Control Room tile and store row carry.
          const { Art } = artworkFor(item.slug)
          return (
            <button
              key={item.id}
              type="button"
              className={`pinned-app-tile ${item.id === activeId ? 'active' : ''}`}
              // The visible label is clamped to fit a tile, so the FULL app name has to be the
              // accessible name — a screen reader must not be handed the same clipped string a
              // sighted member can at least hover to complete.
              aria-label={item.label}
              aria-current={item.id === activeId ? 'page' : undefined}
              title={item.label}
              onClick={() => onSelect(item.id)}
            >
              <span className="pinned-app-tile-icon" aria-hidden="true">
                {item.glyph ? <NavIcon name={item.glyph} size={22} /> : <Art />}
              </span>
              <span className="pinned-app-tile-label" aria-hidden="true">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Below the row, not inside it: the count is the disclosure that pins are hidden, and a
          control living in the same horizontally-scrolling line as the tiles it describes is
          the one thing that can itself be scrolled out of sight. */}
      {overflowing && (
        <button
          type="button"
          className="pinned-app-more"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Show fewer' : `Show all ${items.length} (+${hiddenCount})`}
        </button>
      )}
    </div>
  )
}
