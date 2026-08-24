/**
 * Key Registry Service
 *
 * Wraps KeyRegistry on-chain reads/writes for encryption key management.
 * Users register their X25519 public keys on-chain so that wager creators
 * can look up an opponent's key and encrypt wager details for them without
 * any shared secret or direct interaction.
 */

import { ethers } from 'ethers'
import { KEY_REGISTRY_ABI } from '../abis/KeyRegistry'
import { getContractAddress, getContractAddressForChain } from '../config/contracts'
import { getCurrentDocument } from './legalDocs'

// In-memory cache: address → { publicKeyHex, timestamp }
const keyCache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Get a read-only KeyRegistry contract instance.
 * Falls back to legacy `zkKeyManager` config field for Mordor deployments.
 */
async function getKeyRegistryContract(provider) {
  // Resolve KeyRegistry for the chain the provider talks to, so a key lookup on
  // one network never reads another's registry. Fall back to the build-time
  // chain only when the provider can't report its network.
  let address
  try {
    const cid = Number((await provider.getNetwork()).chainId)
    address = getContractAddressForChain('keyRegistry', cid) || getContractAddressForChain('zkKeyManager', cid)
  } catch {
    address = getContractAddress('keyRegistry') || getContractAddress('zkKeyManager')
  }
  if (!address) {
    throw new Error('KeyRegistry contract address not configured')
  }
  return new ethers.Contract(address, KEY_REGISTRY_ABI, provider)
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
 * The three outcomes of a key lookup (issue #1286).
 *
 * `not-registered` is a FACT ABOUT ANOTHER MEMBER — the registry answered, and it holds no key
 * for them. `unreadable` is a fact about US — the read failed, the registry is not configured on
 * this chain, or it returned something that is not a 32-byte X25519 key, so we cannot say either
 * way. Collapsing the two into one `null` is how an RPC blip on the wager create path came out as
 * "your opponent has not registered their encryption key": a definite claim about someone else,
 * manufactured by our own failure. Same shape as the estate reads (`read` / `not-deployed` /
 * `unreadable`), and `publicKey` exists only on `read`.
 */
export const KEY_LOOKUP = Object.freeze({
  READ: 'read',
  NOT_REGISTERED: 'not-registered',
  UNREADABLE: 'unreadable',
})

/**
 * Look up a user's registered encryption public key, distinguishing "no key" from "no answer".
 *
 * @param {string} address - Ethereum address to look up
 * @param {ethers.Provider} provider - RPC provider
 * @returns {Promise<{state: string, publicKey?: Uint8Array, reason?: string}>}
 */
export async function lookupPublicKeyState(address, provider) {
  if (!address || !provider) {
    return { state: KEY_LOOKUP.UNREADABLE, reason: 'No address or provider to read with' }
  }

  const normalized = address.toLowerCase()

  // Check cache. Only DEFINITE outcomes are ever cached — a failed read must not turn into a
  // five-minute claim that the member has no key.
  const cached = keyCache.get(normalized)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.publicKeyBytes
      ? { state: KEY_LOOKUP.READ, publicKey: cached.publicKeyBytes }
      : { state: KEY_LOOKUP.NOT_REGISTERED }
  }

  try {
    const contract = await getKeyRegistryContract(provider)
    const publicKeyHex = await contract.getPublicKey(address)

    const publicKeyBytes = publicKeyHex ? hexToBytes(publicKeyHex) : new Uint8Array(0)

    if (publicKeyBytes.length === 0) {
      // The registry answered and holds nothing — a real negative. Cache the miss to avoid
      // repeated RPC calls.
      keyCache.set(normalized, { publicKeyBytes: null, timestamp: Date.now() })
      return { state: KEY_LOOKUP.NOT_REGISTERED }
    }

    // Present but not an X25519 key: the registry gave us bytes we cannot use. That says
    // nothing about whether the member registered — do NOT report it as "not registered".
    if (publicKeyBytes.length !== 32) {
      console.warn(`[keyRegistry] Unexpected key length for ${address}: ${publicKeyBytes.length} bytes`)
      return { state: KEY_LOOKUP.UNREADABLE, reason: `Registry returned ${publicKeyBytes.length} bytes, expected 32` }
    }

    keyCache.set(normalized, { publicKeyBytes, timestamp: Date.now() })
    return { state: KEY_LOOKUP.READ, publicKey: publicKeyBytes }
  } catch (error) {
    console.error(`[keyRegistry] Failed to lookup key for ${address}:`, error.message)
    return { state: KEY_LOOKUP.UNREADABLE, reason: error.message }
  }
}

/**
 * Look up a user's registered encryption public key from ZKKeyManager
 *
 * Convenience wrapper over {@link lookupPublicKeyState} for callers that cannot act on the
 * difference. Anything that reports the result TO A MEMBER must use the state form instead —
 * `null` here still means "no key OR no answer".
 *
 * @param {string} address - Ethereum address to look up
 * @param {ethers.Provider} provider - RPC provider
 * @returns {Promise<Uint8Array|null>} X25519 public key bytes, or null if not registered
 */
export async function lookupPublicKey(address, provider) {
  const result = await lookupPublicKeyState(address, provider)
  return result.state === KEY_LOOKUP.READ ? result.publicKey : null
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
    const contract = await getKeyRegistryContract(provider)
    // v2 KeyRegistry uses hasKey(); legacy ZKKeyManager used hasValidKey()
    if (typeof contract.hasKey === 'function') {
      return await contract.hasKey(address)
    }
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

  let address
  try {
    const cid = Number((await signer.provider.getNetwork()).chainId)
    address = getContractAddressForChain('keyRegistry', cid) || getContractAddressForChain('zkKeyManager', cid)
  } catch {
    address = getContractAddress('keyRegistry') || getContractAddress('zkKeyManager')
  }
  if (!address) {
    throw new Error('KeyRegistry contract not configured')
  }

  const contract = new ethers.Contract(address, KEY_REGISTRY_ABI, signer)
  // Both old ZKKeyManager (string param) and new KeyRegistry (bytes param) accept a 0x-prefixed hex string.
  // Spec 007 (FR-043): when the KeyRegistry supports it, record the eligibility ack on-chain
  // referencing the in-force Terms version hash. Fall back to plain registerKey for older
  // deployments that lack the overload (pre-redeploy).
  const termsHash = getCurrentDocument('terms')?.hash
  let tx
  if (termsHash && typeof contract.registerKeyWithEligibility === 'function') {
    try {
      tx = await contract.registerKeyWithEligibility('0x' + publicKeyHex, '0x' + termsHash)
    } catch (e) {
      console.warn('registerKeyWithEligibility unavailable on-chain; falling back to registerKey:', e?.message)
      tx = await contract.registerKey('0x' + publicKeyHex)
    }
  } else {
    tx = await contract.registerKey('0x' + publicKeyHex)
  }
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
 * Build the KeyRegistry `registerKey` call batch for a passkey smart account
 * (spec 041) — submitted through WalletContext.sendCalls as a single WebAuthn
 * ceremony, since a passkey session has no ethers signer.
 *
 * Mirrors {@link registerEncryptionKey}: prefers `registerKeyWithEligibility`
 * (Spec 007 FR-043 — records the in-force Terms version hash on-chain) when a
 * terms hash is supplied and the ABI exposes it, else plain `registerKey`.
 *
 * @param {Uint8Array} publicKeyBytes - X25519 public key (32 bytes)
 * @param {number} chainId - chain the passkey account is on
 * @param {string|null} [termsHash] - in-force Terms version hash (bare 64-hex or 0x-prefixed)
 * @returns {Array<{target: string, data: string, value: bigint}>} single-call batch
 */
export function buildRegisterKeyCalls(publicKeyBytes, chainId, termsHash = null) {
  if (!publicKeyBytes || publicKeyBytes.length !== 32) {
    throw new Error('Invalid public key: must be 32 bytes')
  }
  const address = getContractAddressForChain('keyRegistry', chainId) || getContractAddressForChain('zkKeyManager', chainId)
  if (!address) throw new Error('KeyRegistry contract not configured')

  const iface = new ethers.Interface(KEY_REGISTRY_ABI)
  const publicKeyHex = '0x' + bytesToHex(publicKeyBytes)
  const normTerms = typeof termsHash === 'string'
    ? (termsHash.startsWith('0x') ? termsHash : '0x' + termsHash)
    : null
  const hasEligibility = iface.fragments.some(
    (f) => f.type === 'function' && f.name === 'registerKeyWithEligibility'
  )

  const data = (normTerms && hasEligibility)
    ? iface.encodeFunctionData('registerKeyWithEligibility', [publicKeyHex, normTerms])
    : iface.encodeFunctionData('registerKey', [publicKeyHex])

  return [{ target: address, data, value: 0n }]
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
