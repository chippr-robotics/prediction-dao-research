/**
 * Validation utilities for role management
 */

/**
 * Validate Ethereum address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid Ethereum address
 */
export function isValidEthereumAddress(address) {
  if (!address || typeof address !== 'string') {
    return false
  }
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Validate role name
 * @param {string} role - Role name to validate
 * @param {Object} validRoles - Object containing valid role names
 * @returns {boolean} True if valid role
 */
export function isValidRole(role, validRoles) {
  if (!role || !validRoles) {
    return false
  }
  return Object.values(validRoles).includes(role)
}

/**
 * Normalize Ethereum address to lowercase
 * @param {string} address - Address to normalize
 * @returns {string} Normalized address
 */
export function normalizeAddress(address) {
  if (!address || typeof address !== 'string') {
    return ''
  }
  return address.toLowerCase()
}
