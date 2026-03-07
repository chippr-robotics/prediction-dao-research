/**
 * Key Registry Service
 *
 * Wraps ZKKeyManager on-chain reads/writes for encryption key management.
 * Users register their X25519 public keys on-chain so that wager creators
 * can look up an opponent's key and encrypt wager details for them without
 * any shared secret or direct interaction.
 */

import { ethers } from 'ethers'
import { ZK_KEY_MANAGER_ABI } from '../abis/ZKKeyManager'
import { getContractAddress } from '../config/contracts'

// In-memory cache: address → { publicKeyHex, timestamp }
const keyCache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Get a read-only ZKKeyManager contract instance
 * @param {ethers.Provider} provider
 * @returns {ethers.Contract}
 */
function getZKKeyManagerContract(provider) {
  const address = getContractAddress('zkKeyManager')
  if (!address) {
    throw new Error('ZKKeyManager contract address not configured')
  }
  return new ethers.Contract(address, ZK_KEY_MANAGER_ABI, provider)
}

/**
 * Convert a hex string (with or without 0x prefix) to Uint8Array
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return bytes
}

/**
 * Convert Uint8Array to hex string (no 0x prefix)
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Look up a user's registered encryption public key from ZKKeyManager
 *
 * @param {string} address - Ethereum address to look up
 * @param {ethers.Provider} provider - RPC provider
 * @returns {Promise<Uint8Array|null>} X25519 public key bytes, or null if not registered
 */
export async function lookupPublicKey(address, provider) {
  if (!address || !provider) return null

  const normalized = address.toLowerCase()

  // Check cache
  const cached = keyCache.get(normalized)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.publicKeyBytes
  }

  try {
    const contract = getZKKeyManagerContract(provider)
    const publicKeyHex = await contract.getPublicKey(address)

    if (!publicKeyHex || publicKeyHex === '') {
      // No key registered — cache the miss to avoid repeated RPC calls
      keyCache.set(normalized, { publicKeyBytes: null, timestamp: Date.now() })
      return null
    }

    const publicKeyBytes = hexToBytes(publicKeyHex)

    // Validate X25519 key length (32 bytes)
    if (publicKeyBytes.length !== 32) {
      console.warn(`[keyRegistry] Unexpected key length for ${address}: ${publicKeyBytes.length} bytes`)
      return null
    }

    keyCache.set(normalized, { publicKeyBytes, timestamp: Date.now() })
    return publicKeyBytes
  } catch (error) {
    console.error(`[keyRegistry] Failed to lookup key for ${address}:`, error.message)
    return null
  }
}

/**
 * Check if a user has a valid registered encryption key
 *
 * @param {string} address - Ethereum address
 * @param {ethers.Provider} provider - RPC provider
 * @returns {Promise<boolean>}
 */
export async function hasRegisteredKey(address, provider) {
  if (!address || !provider) return false

  try {
    const contract = getZKKeyManagerContract(provider)
    return await contract.hasValidKey(address)
  } catch (error) {
    console.error(`[keyRegistry] Failed to check key for ${address}:`, error.message)
    return false
  }
}

/**
 * Register an encryption public key on-chain
 *
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {Uint8Array} publicKeyBytes - X25519 public key (32 bytes)
 * @returns {Promise<{ hash: string, status: string }>} Transaction result
 */
export async function registerEncryptionKey(signer, publicKeyBytes) {
  if (!signer) throw new Error('Wallet not connected')
  if (!publicKeyBytes || publicKeyBytes.length !== 32) {
    throw new Error('Invalid public key: must be 32 bytes')
  }

  const publicKeyHex = bytesToHex(publicKeyBytes)

  const address = getContractAddress('zkKeyManager')
  if (!address) {
    throw new Error('ZKKeyManager contract not configured')
  }

  const contract = new ethers.Contract(address, ZK_KEY_MANAGER_ABI, signer)
  const tx = await contract.registerKey(publicKeyHex)
  const receipt = await tx.wait()

  // Invalidate cache for this user
  const userAddress = await signer.getAddress()
  keyCache.delete(userAddress.toLowerCase())

  return {
    hash: receipt.hash,
    status: receipt.status === 1 ? 'success' : 'failed'
  }
}

/**
 * Ensure a user's key is registered on-chain. If already registered, no-op.
 *
 * @param {ethers.Signer} signer - Connected wallet signer
 * @param {string} account - User's address
 * @param {Uint8Array} publicKeyBytes - X25519 public key (32 bytes)
 * @returns {Promise<boolean>} true if key was newly registered, false if already existed
 */
export async function ensureKeyRegistered(signer, account, publicKeyBytes) {
  if (!signer || !account || !publicKeyBytes) return false

  const provider = signer.provider || signer
  const alreadyRegistered = await hasRegisteredKey(account, provider)
  if (alreadyRegistered) return false

  await registerEncryptionKey(signer, publicKeyBytes)
  return true
}

/**
 * Clear the key cache for a specific address or all addresses
 * @param {string} [address] - If provided, clear only this address. Otherwise clear all.
 */
export function clearKeyCache(address) {
  if (address) {
    keyCache.delete(address.toLowerCase())
  } else {
    keyCache.clear()
  }
}

export { bytesToHex, hexToBytes }
