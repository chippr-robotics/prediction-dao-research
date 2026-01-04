/**
 * User preferences storage utilities
 * Uses wallet address as unique ID for session/local storage
 * Following web3 wallet best practices
 */

const STORAGE_PREFIX = 'fw_user_'
const GLOBAL_PREFS_KEY = 'fw_global_prefs'

/**
 * Get the storage key for a specific user
 * @param {string} walletAddress - User's wallet address
 * @param {string} key - Preference key
 * @returns {string} Storage key
 */
function getUserStorageKey(walletAddress, key) {
  if (!walletAddress) {
    throw new Error('Wallet address is required')
  }
  // Normalize wallet address to lowercase
  const normalizedAddress = walletAddress.toLowerCase()
  return `${STORAGE_PREFIX}${normalizedAddress}_${key}`
}

/**
 * Save user preference
 * @param {string} walletAddress - User's wallet address
 * @param {string} key - Preference key
 * @param {any} value - Preference value
 * @param {boolean} useLocalStorage - Use localStorage instead of sessionStorage
 */
export function saveUserPreference(walletAddress, key, value, useLocalStorage = false) {
  try {
    const storageKey = getUserStorageKey(walletAddress, key)
    const storage = useLocalStorage ? localStorage : sessionStorage
    storage.setItem(storageKey, JSON.stringify(value))
  } catch (error) {
    console.error('Error saving user preference:', error)
  }
}

/**
 * Get user preference
 * @param {string} walletAddress - User's wallet address
 * @param {string} key - Preference key
 * @param {any} defaultValue - Default value if not found
 * @param {boolean} useLocalStorage - Use localStorage instead of sessionStorage
 * @returns {any} Preference value
 */
export function getUserPreference(walletAddress, key, defaultValue = null, useLocalStorage = false) {
  try {
    const storageKey = getUserStorageKey(walletAddress, key)
    const storage = useLocalStorage ? localStorage : sessionStorage
    const value = storage.getItem(storageKey)
    return value ? JSON.parse(value) : defaultValue
  } catch (error) {
    console.error('Error getting user preference:', error)
    return defaultValue
  }
}

/**
 * Remove user preference
 * @param {string} walletAddress - User's wallet address
 * @param {string} key - Preference key
 * @param {boolean} useLocalStorage - Use localStorage instead of sessionStorage
 */
export function removeUserPreference(walletAddress, key, useLocalStorage = false) {
  try {
    const storageKey = getUserStorageKey(walletAddress, key)
    const storage = useLocalStorage ? localStorage : sessionStorage
    storage.removeItem(storageKey)
  } catch (error) {
    console.error('Error removing user preference:', error)
  }
}

/**
 * Clear all preferences for a user
 * @param {string} walletAddress - User's wallet address
 */
export function clearUserPreferences(walletAddress) {
  try {
    const normalizedAddress = walletAddress.toLowerCase()
    const prefix = `${STORAGE_PREFIX}${normalizedAddress}_`
    
    // Clear from both storage types
    ;[sessionStorage, localStorage].forEach(storage => {
      const keysToRemove = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => storage.removeItem(key))
    })
  } catch (error) {
    console.error('Error clearing user preferences:', error)
  }
}

/**
 * Save global preference (not tied to wallet)
 * @param {string} key - Preference key
 * @param {any} value - Preference value
 */
export function saveGlobalPreference(key, value) {
  try {
    const prefs = getGlobalPreferences()
    prefs[key] = value
    localStorage.setItem(GLOBAL_PREFS_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error('Error saving global preference:', error)
  }
}

/**
 * Get global preference (not tied to wallet)
 * @param {string} key - Preference key
 * @param {any} defaultValue - Default value if not found
 * @returns {any} Preference value
 */
export function getGlobalPreference(key, defaultValue = null) {
  try {
    const prefs = getGlobalPreferences()
    return prefs[key] !== undefined ? prefs[key] : defaultValue
  } catch (error) {
    console.error('Error getting global preference:', error)
    return defaultValue
  }
}

/**
 * Get all global preferences
 * @returns {Object} All global preferences
 */
export function getGlobalPreferences() {
  try {
    const value = localStorage.getItem(GLOBAL_PREFS_KEY)
    return value ? JSON.parse(value) : {}
  } catch (error) {
    console.error('Error getting global preferences:', error)
    return {}
  }
}

/**
 * Check if user has ClearPath status (active/inactive)
 * @param {string} walletAddress - User's wallet address
 * @returns {Object} ClearPath status info
 */
export function getClearPathStatus(walletAddress) {
  return getUserPreference(walletAddress, 'clearpath_status', {
    active: false,
    lastUpdated: null
  }, true) // Use localStorage for persistence
}

/**
 * Update ClearPath status
 * @param {string} walletAddress - User's wallet address
 * @param {boolean} active - Whether ClearPath is active
 */
export function updateClearPathStatus(walletAddress, active) {
  saveUserPreference(walletAddress, 'clearpath_status', {
    active,
    lastUpdated: Date.now()
  }, true) // Use localStorage for persistence
}

/**
 * Get demo mode status (true = mock data, false = real blockchain data)
 * @param {string} walletAddress - User's wallet address
 * @returns {boolean} Demo mode status
 */
export function getDemoMode(walletAddress) {
  return getUserPreference(walletAddress, 'demo_mode', true, true) // Default to demo mode (mock data)
}

/**
 * Update demo mode status
 * @param {string} walletAddress - User's wallet address
 * @param {boolean} enabled - Whether demo mode is enabled (true = mock, false = real)
 */
export function updateDemoMode(walletAddress, enabled) {
  saveUserPreference(walletAddress, 'demo_mode', enabled, true) // Use localStorage for persistence
}
