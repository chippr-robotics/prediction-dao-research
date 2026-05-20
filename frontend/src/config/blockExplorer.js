/**
 * Block Explorer Configuration
 *
 * Centralized utilities for explorer URLs. The actual per-chain base URLs are
 * defined in frontend/src/config/networks.js — this file derives from there so
 * adding a new chain only requires touching one config.
 *
 * Helper names that contain "Blockscout" are historical and are kept as
 * aliases; the URL-shape helpers below work with Polygonscan on Amoy.
 */

import { NETWORKS, getNetwork } from './networks'

// Base URLs by chain ID, derived from NETWORKS. Preserved as a named export
// for any consumer that read the constant directly.
export const BLOCKSCOUT_URLS = Object.fromEntries(
  Object.values(NETWORKS)
    .filter((n) => n.explorer?.baseUrl)
    .map((n) => [n.chainId, n.explorer.baseUrl])
)

/**
 * Get the explorer base URL for a given chain ID. Falls back to the configured
 * primary chain when an unknown chainId is passed.
 */
export const getExplorerBaseUrl = (chainId) => {
  return getNetwork(chainId)?.explorer?.baseUrl || ''
}

// Legacy alias preserved for back-compat with existing call sites.
export const getBlockscoutBaseUrl = getExplorerBaseUrl

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
