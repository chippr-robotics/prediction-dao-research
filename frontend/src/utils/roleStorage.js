/**
 * Role storage utilities
 * Uses wallet address as unique ID for local storage
 * Following principle of least privilege
 */

const ROLE_STORAGE_KEY = 'fw_user_roles'
const ROLE_PURCHASE_KEY = 'fw_role_purchases'

/**
 * Get the storage key for a specific user's roles
 * @param {string} walletAddress - User's wallet address
 * @returns {string} Storage key
 */
function getRoleStorageKey(walletAddress) {
  if (!walletAddress) {
    throw new Error('Wallet address is required')
  }
  // Normalize wallet address to lowercase
  const normalizedAddress = walletAddress.toLowerCase()
  return `${ROLE_STORAGE_KEY}_${normalizedAddress}`
}

/**
 * Get all roles for a user
 * @param {string} walletAddress - User's wallet address
 * @returns {Array<string>} Array of role names
 */
export function getUserRoles(walletAddress) {
  try {
    const storageKey = getRoleStorageKey(walletAddress)
    const rolesData = localStorage.getItem(storageKey)
    return rolesData ? JSON.parse(rolesData) : []
  } catch (error) {
    console.error('Error getting user roles:', error)
    return []
  }
}

/**
 * Save roles for a user
 * @param {string} walletAddress - User's wallet address
 * @param {Array<string>} roles - Array of role names
 */
export function saveUserRoles(walletAddress, roles) {
  try {
    const storageKey = getRoleStorageKey(walletAddress)
    localStorage.setItem(storageKey, JSON.stringify(roles))
  } catch (error) {
    console.error('Error saving user roles:', error)
  }
}

/**
 * Check if user has a specific role
 * @param {string} walletAddress - User's wallet address
 * @param {string} role - Role to check
 * @returns {boolean} True if user has the role
 */
export function hasRole(walletAddress, role) {
  try {
    const roles = getUserRoles(walletAddress)
    return roles.includes(role)
  } catch (error) {
    console.error('Error checking user role:', error)
    return false
  }
}

/**
 * Add a role to a user
 * @param {string} walletAddress - User's wallet address
 * @param {string} role - Role to add
 */
export function addUserRole(walletAddress, role) {
  try {
    const roles = getUserRoles(walletAddress)
    if (!roles.includes(role)) {
      roles.push(role)
      saveUserRoles(walletAddress, roles)
    }
  } catch (error) {
    console.error('Error adding user role:', error)
  }
}

/**
 * Remove a role from a user
 * @param {string} walletAddress - User's wallet address
 * @param {string} role - Role to remove
 */
export function removeUserRole(walletAddress, role) {
  try {
    const roles = getUserRoles(walletAddress)
    const updatedRoles = roles.filter(r => r !== role)
    saveUserRoles(walletAddress, updatedRoles)
  } catch (error) {
    console.error('Error removing user role:', error)
  }
}

/**
 * Clear all roles for a user
 * @param {string} walletAddress - User's wallet address
 */
export function clearUserRoles(walletAddress) {
  try {
    const storageKey = getRoleStorageKey(walletAddress)
    localStorage.removeItem(storageKey)
  } catch (error) {
    console.error('Error clearing user roles:', error)
  }
}

/**
 * Get all users with roles (for admin purposes)
 * @returns {Object} Object mapping wallet addresses to their roles
 */
export function getAllUsersWithRoles() {
  try {
    const allUsers = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(ROLE_STORAGE_KEY + '_')) {
        const address = key.replace(ROLE_STORAGE_KEY + '_', '')
        const roles = JSON.parse(localStorage.getItem(key) || '[]')
        if (roles.length > 0) {
          allUsers[address] = roles
        }
      }
    }
    return allUsers
  } catch (error) {
    console.error('Error getting all users with roles:', error)
    return {}
  }
}

/**
 * Record a role purchase
 * @param {string} walletAddress - User's wallet address
 * @param {string} role - Role purchased
 * @param {Object} purchaseDetails - Purchase transaction details
 */
export function recordRolePurchase(walletAddress, role, purchaseDetails) {
  try {
    const purchases = getRolePurchases(walletAddress)
    purchases.push({
      role,
      timestamp: Date.now(),
      ...purchaseDetails
    })
    
    const normalizedAddress = walletAddress.toLowerCase()
    const storageKey = `${ROLE_PURCHASE_KEY}_${normalizedAddress}`
    localStorage.setItem(storageKey, JSON.stringify(purchases))
  } catch (error) {
    console.error('Error recording role purchase:', error)
  }
}

/**
 * Get purchase history for a user
 * @param {string} walletAddress - User's wallet address
 * @returns {Array<Object>} Array of purchase records
 */
export function getRolePurchases(walletAddress) {
  try {
    const normalizedAddress = walletAddress.toLowerCase()
    const storageKey = `${ROLE_PURCHASE_KEY}_${normalizedAddress}`
    const purchasesData = localStorage.getItem(storageKey)
    return purchasesData ? JSON.parse(purchasesData) : []
  } catch (error) {
    console.error('Error getting role purchases:', error)
    return []
  }
}
