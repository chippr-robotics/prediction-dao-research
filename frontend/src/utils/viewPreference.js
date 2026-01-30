/**
 * Utility for managing user's view preference (grid vs compact)
 * Persists preference to localStorage
 */

const VIEW_PREFERENCE_KEY = 'marketViewPreference'

export const VIEW_MODES = {
  GRID: 'grid',
  COMPACT: 'compact'
}

/**
 * Check if device is mobile based on screen width
 * @returns {boolean} - true if screen width <= 768px
 */
function isMobileDevice() {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 768
}

/**
 * Get the saved view preference from localStorage
 * Falls back to compact on mobile, grid on desktop
 * @returns {string} - 'grid' or 'compact'
 */
export function getViewPreference() {
  try {
    const saved = localStorage.getItem(VIEW_PREFERENCE_KEY)
    // If user has saved preference, use it
    if (saved === VIEW_MODES.COMPACT || saved === VIEW_MODES.GRID) {
      return saved
    }
    // Default: compact on mobile, grid on desktop
    return isMobileDevice() ? VIEW_MODES.COMPACT : VIEW_MODES.GRID
  } catch (error) {
    console.error('Error reading view preference:', error)
    return isMobileDevice() ? VIEW_MODES.COMPACT : VIEW_MODES.GRID
  }
}

/**
 * Save the view preference to localStorage
 * @param {string} viewMode - 'grid' or 'compact'
 */
export function setViewPreference(viewMode) {
  try {
    if (viewMode === VIEW_MODES.GRID || viewMode === VIEW_MODES.COMPACT) {
      localStorage.setItem(VIEW_PREFERENCE_KEY, viewMode)
    }
  } catch (error) {
    console.error('Error saving view preference:', error)
  }
}
