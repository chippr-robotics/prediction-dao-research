/**
 * Block Explorer Configuration
 *
 * Centralized helpers for per-chain explorer URLs across the application.
 * All explorer links should use these utilities to ensure consistency.
 */

import { NETWORKS } from './networks'

// Legacy per-chain base map, kept ONLY as a fallback for any chain not carrying an
// `explorer.baseUrl` in networks.js. networks.js is the single source of truth
// (constitution V) — new chains (e.g. the Ethereum family, spec 048) resolve from there.
// Note: Polygon networks use PolygonScan (Etherscan-style), ETC networks use Blockscout.
export const BLOCKSCOUT_URLS = {
  61: 'https://etc.blockscout.com',         // ETC Mainnet
  63: 'https://etc-mordor.blockscout.com',  // Mordor Testnet
  137: 'https://polygonscan.com',           // Polygon mainnet
  80002: 'https://amoy.polygonscan.com',    // Polygon Amoy testnet
}

/**
 * Get the block explorer base URL for a given chain ID.
 *
 * Resolves strictly per-chain from `NETWORKS[chainId].explorer.baseUrl` (single source
 * of truth), falling back to the legacy map only for chains still listed there. An
 * unknown chain yields '' — NO cross-network default — so a caller renders no link
 * rather than a link pointing at the wrong network (FR-016, honest-state).
 *
 * @param {number} chainId - The chain ID
 * @returns {string} The block explorer base URL, or '' when the chain is unknown
 */
export const getBlockscoutBaseUrl = (chainId) => {
  const fromConfig = NETWORKS[chainId]?.explorer?.baseUrl
  return fromConfig || BLOCKSCOUT_URLS[chainId] || ''
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
  if (!baseUrl) return ''
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
  if (!baseUrl) return ''
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
  if (!baseUrl) return ''
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
  if (!baseUrl) return ''
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
  if (!baseUrl) return ''
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
