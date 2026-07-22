/**
 * Legacy key & word-list recovery (Recovery section).
 *
 * Many members arrive holding an *old* secret: a raw EOA private key, or a
 * BIP-39 word list (12/15/18/21/24 words) from a previous wallet. FairWins can
 * take custody of that secret ONLY on this device, encrypted at rest, and — the
 * important part — help the member move the funds off that legacy key onto a
 * modern passkey smart account, which is what the rest of the app protects.
 *
 * Security posture (mirrors the passkey blob approach in lib/passkey/prfKeys.js):
 *  - the raw secret is NEVER persisted in the clear and never leaves the device;
 *  - at rest it is wrapped with AES-GCM under a key stretched from a
 *    member-chosen passphrase (PBKDF2-SHA256), so localStorage alone is useless;
 *  - a wrong passphrase fails the AES-GCM tag — we never fall through to a
 *    different/empty secret.
 *
 * A legacy EOA is a liability, not a destination: the module deliberately makes
 * "sweep the funds to a smart account" the headline action and stores the key
 * only so the member can finish that move (and retry if gas was short).
 */

import { ethers } from 'ethers'

// Versioned localStorage key for the encrypted legacy-key vault. Bumping the
// version is a migration, never an in-place reformat.
const VAULT_KEY = 'fairwins.recovery.legacyKeys.v1'

// PBKDF2 work factor. OWASP's 2023 floor for PBKDF2-HMAC-SHA256 is 600k; we sit
// above it. Stored per-entry so a future bump stays backward-compatible.
export const PBKDF2_ITERATIONS = 650000
const MIN_PASSPHRASE_LEN = 8

// BIP-39 word lists come in these lengths only.
const VALID_WORD_COUNTS = [12, 15, 18, 21, 24]
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/

const subtleOf = (deps = {}) => deps.subtle ?? globalThis.crypto?.subtle
const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))
const toB64 = (u8) => btoa(String.fromCharCode(...u8))
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/**
 * Classify a pasted secret without persisting anything. Recognizes a raw
 * private key (64 hex chars, optional 0x) or a valid BIP-39 mnemonic, and
 * returns the address it controls so the member can confirm it's the right one
 * before we ever store it.
 *
 * @param {string} input
 * @returns {{ kind: 'privateKey'|'mnemonic', address: string, secret: string, wordCount: number }
 *          | { kind: 'empty'|'invalid' }}
 */
export function classifySecret(input) {
  const raw = (input || '').trim()
  if (!raw) return { kind: 'empty' }

  // Private key — accept with or without the 0x prefix.
  const hex = raw.startsWith('0x') ? raw : `0x${raw}`
  if (PRIVATE_KEY_RE.test(hex)) {
    try {
      const wallet = new ethers.Wallet(hex)
      return { kind: 'privateKey', address: wallet.address, secret: hex.toLowerCase(), wordCount: 0 }
    } catch {
      /* not a usable key — fall through to invalid */
    }
  }

  // Word list — normalize whitespace/case the way BIP-39 expects.
  const words = raw.split(/\s+/).filter(Boolean)
  if (VALID_WORD_COUNTS.includes(words.length)) {
    const phrase = words.join(' ').toLowerCase()
    try {
      if (ethers.Mnemonic.isValidMnemonic(phrase)) {
        const wallet = ethers.HDNodeWallet.fromPhrase(phrase)
        return { kind: 'mnemonic', address: wallet.address, secret: phrase, wordCount: words.length }
      }
    } catch {
      /* invalid checksum / word — fall through */
    }
  }

  return { kind: 'invalid' }
}

/** Build an (optionally provider-connected) signer from a classified secret. */
export function walletFromSecret({ kind, secret }, provider = null) {
  const wallet = kind === 'mnemonic' ? ethers.HDNodeWallet.fromPhrase(secret) : new ethers.Wallet(secret)
  return provider ? wallet.connect(provider) : wallet
}

async function deriveWrapKey(passphrase, salt, iterations, subtle) {
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt a classified secret at rest under a passphrase-derived key. The
 * returned entry is a plain JSON blob safe to keep in localStorage — it reveals
 * the address (so the member can recognize it) but nothing about the secret.
 *
 * @returns {Promise<object>} vault entry
 */
export async function encryptLegacySecret({ secret, kind, address, passphrase, deps = {} }) {
  if (!secret) throw new Error('Nothing to encrypt.')
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LEN) {
    throw new Error(`Choose a passphrase of at least ${MIN_PASSPHRASE_LEN} characters.`)
  }
  const subtle = subtleOf(deps)
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveWrapKey(passphrase, salt, PBKDF2_ITERATIONS, subtle)
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret)))
  return {
    v: 1,
    kind,
    address,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(ct),
    iterations: PBKDF2_ITERATIONS,
    importedAt: deps.now ?? Date.now(),
  }
}

/**
 * Recover the raw secret from a vault entry. A wrong passphrase (or a tampered
 * blob) fails the AES-GCM tag and raises — we never return partial/other data.
 *
 * @returns {Promise<string>} the private key (0x…) or mnemonic phrase
 */
export async function decryptLegacySecret({ entry, passphrase, deps = {} }) {
  if (!entry) throw new Error('No stored key to unlock.')
  const subtle = subtleOf(deps)
  const salt = fromB64(entry.salt)
  const iv = fromB64(entry.iv)
  const key = await deriveWrapKey(passphrase, salt, entry.iterations ?? PBKDF2_ITERATIONS, subtle)
  try {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, fromB64(entry.ct))
    return new TextDecoder().decode(pt)
  } catch {
    throw new Error('That passphrase did not unlock this key. Check it and try again.')
  }
}

/**
 * Device-local vault of encrypted legacy keys, keyed by lowercased address so a
 * given legacy account is stored once. Mirrors lib/passkey/prfKeys.js#blobStore.
 */
export function legacyKeyVault(storage = globalThis.localStorage) {
  const read = () => {
    try {
      return JSON.parse(storage.getItem(VAULT_KEY) || '{}')
    } catch {
      return {}
    }
  }
  const write = (all) => storage.setItem(VAULT_KEY, JSON.stringify(all))
  return {
    list() {
      return Object.values(read()).sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0))
    },
    get(address) {
      return read()[String(address).toLowerCase()] ?? null
    },
    has(address) {
      return Boolean(this.get(address))
    },
    set(entry) {
      const all = read()
      all[String(entry.address).toLowerCase()] = entry
      write(all)
    },
    delete(address) {
      const all = read()
      delete all[String(address).toLowerCase()]
      write(all)
    },
  }
}

// Pad the estimated fee by 20% so a small gas-price bump between quote and send
// doesn't strand the sweep — the leftover dust stays on the legacy key.
const GAS_BUFFER_NUM = 12n
const GAS_BUFFER_DEN = 10n
const TRANSFER_GAS_LIMIT = 21000n

/**
 * Quote a native-currency sweep from a legacy key to a destination: how much is
 * on it, the reserved gas, and the sendable remainder. Read-only.
 *
 * @returns {Promise<{ from: string, balance: bigint, gasReserve: bigint,
 *   sendable: bigint, gasLimit: bigint, gasPrice: bigint }>}
 */
export async function quoteNativeSweep({ kind, secret, provider }) {
  if (!provider) throw new Error('No network connection to check the balance.')
  const from = walletFromSecret({ kind, secret }).address
  const [balance, feeData] = await Promise.all([provider.getBalance(from), provider.getFeeData()])
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n
  const gasReserve = (TRANSFER_GAS_LIMIT * gasPrice * GAS_BUFFER_NUM) / GAS_BUFFER_DEN
  const sendable = balance > gasReserve ? balance - gasReserve : 0n
  return { from, balance, gasReserve, sendable, gasLimit: TRANSFER_GAS_LIMIT, gasPrice }
}

/**
 * Sweep the sendable native balance of a legacy key to `to`. Leaves the gas
 * reserve behind so the transaction can pay for itself. Native currency only —
 * ERC-20 balances are not moved (disclosed in the UI).
 *
 * @returns {Promise<object>} the sent transaction (already broadcast)
 */
export async function sweepNativeToSmartAccount({ kind, secret, to, provider }) {
  if (!ethers.isAddress(to)) throw new Error('Enter a valid destination address.')
  const quote = await quoteNativeSweep({ kind, secret, provider })
  if (quote.sendable <= 0n) {
    throw new Error('This key does not hold enough to cover the network fee — there is nothing to transfer.')
  }
  const wallet = walletFromSecret({ kind, secret }, provider)
  return wallet.sendTransaction({ to, value: quote.sendable, gasLimit: quote.gasLimit })
}
