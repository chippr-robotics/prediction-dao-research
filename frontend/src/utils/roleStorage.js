/**
 * Role storage utilities
 * Uses wallet address as unique ID for local storage
 * Following principle of least privilege
 *
 * Spec 008 (FR-007): records are scoped per network. Every function accepts an
 * optional trailing `chainId`; when provided, the storage key includes it so a
 * role/purchase recorded on one network never surfaces while connected to
 * another. When omitted, the legacy account-only key is used (back-compat for
 * the disconnected/unknown-chain case) — callers that know the chain MUST pass
 * it so reads and writes share the same key.
 */

const ROLE_STORAGE_KEY = 'fw_user_roles'
const ROLE_PURCHASE_KEY = 'fw_role_purchases'

/**
 * Build a per-(chain, address) storage key. Falls back to the legacy
 * account-only key when `chainId` is null/undefined.
 * @param {string} prefix - Base key (roles or purchases)
 * @param {string} walletAddress - User's wallet address
 * @param {number|string} [chainId] - Connected chain id
 * @returns {string} Storage key
 */
function buildKey(prefix, walletAddress, chainId) {
  if (!walletAddress) {
    throw new Error('Wallet address is required')
  }
  const normalizedAddress = walletAddress.toLowerCase()
  return chainId != null
    ? `${prefix}_${chainId}_${normalizedAddress}`
    : `${prefix}_${normalizedAddress}`
}

/**
 * Get the storage key for a specific user's roles
 * @param {string} walletAddress - User's wallet address
 * @param {number|string} [chainId] - Connected chain id
 * @returns {string} Storage key
 */
function getRoleStorageKey(walletAddress, chainId) {
  return buildKey(ROLE_STORAGE_KEY, walletAddress, chainId)
}

/**
 * Get all roles for a user
 * @param {string} walletAddress - User's wallet address
 * @param {number|string} [chainId] - Connected chain id
 * @returns {Array<string>} Array of role names
 */
export function getUserRoles(walletAddress, chainId) {
  try {
    const storageKey = getRoleStorageKey(walletAddress, chainId)
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
 * @param {number|string} [chainId] - Connected chain id
 */
export function saveUserRoles(walletAddress, roles, chainId) {
  try {
    const storageKey = getRoleStorageKey(walletAddress, chainId)
    localStorage.setItem(storageKey, JSON.stringify(roles))
  } catch (error) {
    console.error('Error saving user roles:', error)
  }
}

/**
 * Check if user has a specific role
 * @param {string} walletAddress - User's wallet address
 * @param {string} role - Role to check
 * @param {number|string} [chainId] - Connected chain id
 * @returns {boolean} True if user has the role
 */
export function hasRole(walletAddress, role, chainId) {
  try {
    const roles = getUserRoles(walletAddress, chainId)
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
 * @param {number|string} [chainId] - Connected chain id
 */
export function addUserRole(walletAddress, role, chainId) {
  try {
    const roles = getUserRoles(walletAddress, chainId)
    if (!roles.includes(role)) {
      roles.push(role)
      saveUserRoles(walletAddress, roles, chainId)
    }
  } catch (error) {
    console.error('Error adding user role:', error)
  }
}

/**
 * Remove a role from a user
 * @param {string} walletAddress - User's wallet address
 * @param {string} role - Role to remove
 * @param {number|string} [chainId] - Connected chain id
 */
export function removeUserRole(walletAddress, role, chainId) {
  try {
    const roles = getUserRoles(walletAddress, chainId)
    const updatedRoles = roles.filter(r => r !== role)
    saveUserRoles(walletAddress, updatedRoles, chainId)
  } catch (error) {
    console.error('Error removing user role:', error)
  }
}

/**
 * Clear all roles for a user
 * @param {string} walletAddress - User's wallet address
 * @param {number|string} [chainId] - Connected chain id
 */
export function clearUserRoles(walletAddress, chainId) {
  try {
    const storageKey = getRoleStorageKey(walletAddress, chainId)
    localStorage.removeItem(storageKey)
  } catch (error) {
    console.error('Error clearing user roles:', error)
  }
}

/**
 * Get all users with roles (for admin purposes). Tolerates both per-chain
 * (`fw_user_roles_<chainId>_<addr>`) and legacy (`fw_user_roles_<addr>`) keys;
 * the map is keyed by the wallet address regardless of chain.
 * @returns {Object} Object mapping wallet addresses to their roles
 */
export function getAllUsersWithRoles() {
  try {
    const allUsers = {}
    const prefix = ROLE_STORAGE_KEY + '_'
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) {
        const rest = key.slice(prefix.length)
        // `<chainId>_<addr>` (per-chain) or `<addr>` (legacy); address has no '_'
        const address = rest.includes('_') ? rest.slice(rest.lastIndexOf('_') + 1) : rest
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
 * @param {number|string} [chainId] - Connected chain id
 */
export function recordRolePurchase(walletAddress, role, purchaseDetails, chainId) {
  try {
    const purchases = getRolePurchases(walletAddress, chainId)
    purchases.push({
      role,
      timestamp: Date.now(),
      ...purchaseDetails
    })

    const storageKey = buildKey(ROLE_PURCHASE_KEY, walletAddress, chainId)
    localStorage.setItem(storageKey, JSON.stringify(purchases))
  } catch (error) {
    console.error('Error recording role purchase:', error)
  }
}

/**
 * Get purchase history for a user
 * @param {string} walletAddress - User's wallet address
 * @param {number|string} [chainId] - Connected chain id
 * @returns {Array<Object>} Array of purchase records
 */
export function getRolePurchases(walletAddress, chainId) {
  try {
    const storageKey = buildKey(ROLE_PURCHASE_KEY, walletAddress, chainId)
    const purchasesData = localStorage.getItem(storageKey)
    return purchasesData ? JSON.parse(purchasesData) : []
  } catch (error) {
    console.error('Error getting role purchases:', error)
    return []
  }
}
