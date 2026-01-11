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
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim())
}

/**
 * Check if a string looks like an ENS name
 * ENS names end with .eth (or other TLDs like .xyz, .app, etc.)
 * @param {string} input - The input to check
 * @returns {boolean} True if the input looks like an ENS name
 */
export function isEnsName(input) {
  if (!input || typeof input !== 'string') return false
  const trimmed = input.trim().toLowerCase()
  // ENS TLDs: .eth, .xyz, .app, .dao, .nft, .art, .club, .id, .luxe, .kred, .link
  // Also support subdomains like sub.name.eth
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.(eth|xyz|app|dao|nft|art|club|id|luxe|kred|link)$/i.test(trimmed)
}

/**
 * Validate Ethereum address or ENS name format
 * @param {string} input - Address or ENS name to validate
 * @returns {boolean} True if valid Ethereum address or ENS name format
 */
export function isValidAddressOrEns(input) {
  if (!input || typeof input !== 'string') {
    return false
  }
  return isValidEthereumAddress(input) || isEnsName(input)
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
