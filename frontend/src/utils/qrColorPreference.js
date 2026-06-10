/**
 * Curated color palette + per-device persistence for the wallet-address QR
 * (spec 011). Follows the viewPreference.js pattern: plain-string storage,
 * graceful fallbacks, never throws.
 *
 * Every palette entry is a dark foreground rendered on a fixed #FFFFFF
 * background with a WCAG contrast ratio >= 7:1 (the contract floor is 4.5:1,
 * enforced by qrColorPreference.test.js), so any selectable option produces a
 * scannable code by construction. The flagship brand green #36B37E measures
 * only 2.66:1 on white and is deliberately excluded; Forest is the
 * brand-adjacent substitute. Inverted (light-on-dark) options are excluded —
 * many scanners cannot read them.
 */

const QR_COLOR_PREF_KEY = 'fairwins_qrcolor_v1'

export const QR_COLOR_PALETTE = [
  { id: 'midnight', name: 'Midnight', fg: '#0E141B' },
  { id: 'forest', name: 'Forest', fg: '#14532D' },
  { id: 'ocean', name: 'Ocean', fg: '#1E3A8A' },
  { id: 'plum', name: 'Plum', fg: '#581C87' },
]

export const DEFAULT_QR_COLOR_ID = 'midnight'

function isPaletteId(id) {
  return QR_COLOR_PALETTE.some((entry) => entry.id === id)
}

/**
 * Resolve a palette entry by id, falling back to the default entry for
 * unknown ids so callers always get a renderable color.
 * @param {string} id - palette id
 * @returns {{ id: string, name: string, fg: string }}
 */
export function getQRColorEntry(id) {
  return (
    QR_COLOR_PALETTE.find((entry) => entry.id === id) ||
    QR_COLOR_PALETTE.find((entry) => entry.id === DEFAULT_QR_COLOR_ID)
  )
}

/**
 * Read the saved QR color preference for this device.
 * @returns {string} a valid palette id (default 'midnight')
 */
export function getQRColorPreference() {
  try {
    const saved = localStorage.getItem(QR_COLOR_PREF_KEY)
    if (isPaletteId(saved)) {
      return saved
    }
    return DEFAULT_QR_COLOR_ID
  } catch (error) {
    console.warn('Error reading QR color preference:', error)
    return DEFAULT_QR_COLOR_ID
  }
}

/**
 * Persist the QR color preference for this device. Unknown ids are ignored;
 * storage failures (private browsing, quota) degrade to session-only state.
 * @param {string} id - palette id to save
 */
export function setQRColorPreference(id) {
  try {
    if (isPaletteId(id)) {
      localStorage.setItem(QR_COLOR_PREF_KEY, id)
    }
  } catch (error) {
    console.warn('Error saving QR color preference:', error)
  }
}
