/**
 * Blockscout Block Explorer Configuration
 *
 * Centralized configuration for Blockscout URLs across the application.
 * All explorer links should use these utilities to ensure consistency.
 */

// Blockscout base URLs by chain ID
export const BLOCKSCOUT_URLS = {
  61: 'https://etc.blockscout.com',      // ETC Mainnet
  63: 'https://etc-mordor.blockscout.com', // Mordor Testnet
}

/**
 * Get the Blockscout base URL for a given chain ID
 * @param {number} chainId - The chain ID (61 for mainnet, 63 for Mordor)
 * @returns {string} The Blockscout base URL
 */
export const getBlockscoutBaseUrl = (chainId) => {
  return BLOCKSCOUT_URLS[chainId] || BLOCKSCOUT_URLS[63] // Default to Mordor
}

/**
 * Get the full Blockscout URL for an address, transaction, or block
 * @param {number} chainId - The chain ID
 * @param {string} hash - The address, transaction hash, or block number
 * @param {'address' | 'tx' | 'block' | 'token'} type - The type of resource
 * @returns {string} The full Blockscout URL
 */
export const getBlockscoutUrl = (chainId, hash, type = 'address') => {
  const baseUrl = getBlockscoutBaseUrl(chainId)
  return `${baseUrl}/${type}/${hash}`
}

/**
 * Get Blockscout URL for an address with optional tab
 * @param {number} chainId - The chain ID
 * @param {string} address - The contract or wallet address
 * @param {'contract' | 'transactions' | 'token_transfers' | 'internal_txns'} tab - Optional tab to open
 * @returns {string} The full Blockscout URL with optional tab
 */
export const getAddressUrl = (chainId, address, tab = null) => {
  const baseUrl = getBlockscoutBaseUrl(chainId)
  const url = `${baseUrl}/address/${address}`
  return tab ? `${url}?tab=${tab}` : url
}

/**
 * Get Blockscout URL for a transaction
 * @param {number} chainId - The chain ID
 * @param {string} txHash - The transaction hash
 * @returns {string} The full Blockscout URL for the transaction
 */
export const getTransactionUrl = (chainId, txHash) => {
  const baseUrl = getBlockscoutBaseUrl(chainId)
  return `${baseUrl}/tx/${txHash}`
}

/**
 * Get Blockscout URL for a block
 * @param {number} chainId - The chain ID
 * @param {string | number} blockNumber - The block number
 * @returns {string} The full Blockscout URL for the block
 */
export const getBlockUrl = (chainId, blockNumber) => {
  const baseUrl = getBlockscoutBaseUrl(chainId)
  return `${baseUrl}/block/${blockNumber}`
}

/**
 * Get Blockscout URL for a token page
 * @param {number} chainId - The chain ID
 * @param {string} tokenAddress - The token contract address
 * @returns {string} The full Blockscout URL for the token
 */
export const getTokenUrl = (chainId, tokenAddress) => {
  const baseUrl = getBlockscoutBaseUrl(chainId)
  return `${baseUrl}/token/${tokenAddress}`
}

// Default export for convenience
export default {
  BLOCKSCOUT_URLS,
  getBlockscoutBaseUrl,
  getBlockscoutUrl,
  getAddressUrl,
  getTransactionUrl,
  getBlockUrl,
  getTokenUrl,
}
