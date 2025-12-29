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
 * Get the saved view preference from localStorage
 * @returns {string} - 'grid' or 'compact', defaults to 'grid'
 */
export function getViewPreference() {
  try {
    const saved = localStorage.getItem(VIEW_PREFERENCE_KEY)
    return saved === VIEW_MODES.COMPACT ? VIEW_MODES.COMPACT : VIEW_MODES.GRID
  } catch (error) {
    console.error('Error reading view preference:', error)
    return VIEW_MODES.GRID
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
