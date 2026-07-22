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
 * A legacy EOA is a liability, not a destination: the module makes "move the
 * funds to a smart account" the recommended follow-up, but it is OPTIONAL —
 * storing the key completes recovery on its own. When chosen, the move sweeps
 * ALL supported assets (native + supported ERC-20s), not just the native coin.
 */

import { ethers } from 'ethers'
import { getPortfolioRegistry } from '../../config/assetTaxonomy'
import { TRANSFER_ABI } from '../transfer/eip3009Transfer'
import { loadLegacyRecoveredKeys, saveLegacyRecoveredKeys } from './legacyRecoveredKeysStore'

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
 * Per-account, device-local vault of encrypted legacy keys, keyed by lowercased
 * address so a given legacy account is stored once. Backed by the same
 * per-account storage the spec-032 backup reads (legacyRecoveredKeysStore), so
 * recovered accounts ride the encrypted backup — the CRUD facade and the backup
 * domain share one source of truth. `deps.load`/`deps.save` are injectable for
 * tests.
 *
 * @param {string} account - the signed-in account that owns this vault
 * @param {{ load?: Function, save?: Function }} [deps]
 */
export function legacyKeyVault(account, deps = {}) {
  const load = deps.load ?? loadLegacyRecoveredKeys
  const save = deps.save ?? saveLegacyRecoveredKeys
  const read = () => load(account)
  const write = (all) => save(account, all)
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

// Minimal ABI for reading an arbitrary account's ERC-20 balance.
const BALANCE_OF_ABI = ['function balanceOf(address) view returns (uint256)']

/** The platform-supported fungible assets on a chain (native + ERC-20; NFTs excluded). */
export function supportedAssetsForChain(chainId, registry) {
  const all = registry ?? getPortfolioRegistry(chainId)
  return (all || []).filter((a) => a && (a.kind === 'native' || a.kind === 'erc20'))
}

/**
 * Quote a full-portfolio sweep: enumerate every platform-supported asset on the
 * active chain and read the legacy account's balance for each. Only non-zero
 * balances are returned (native listed last). Read-only — no signing.
 *
 * @returns {Promise<{ from: string, holdings: Array<{ asset: object, balance: bigint }>,
 *   nativeGasReserve: bigint, hasNative: boolean }>}
 */
export async function quoteAllAssets({ kind, secret, chainId, provider, registry }) {
  if (!provider) throw new Error('No network connection to read balances.')
  const from = walletFromSecret({ kind, secret }).address
  const assets = supportedAssetsForChain(chainId, registry)

  const reads = await Promise.all(
    assets.map(async (asset) => {
      try {
        if (asset.kind === 'native') {
          return { asset, balance: await provider.getBalance(from) }
        }
        const erc20 = new ethers.Contract(asset.address, BALANCE_OF_ABI, provider)
        return { asset, balance: await erc20.balanceOf(from) }
      } catch {
        // A single unreadable token must not fail the whole quote — treat as zero.
        return { asset, balance: 0n }
      }
    })
  )

  const erc20Holdings = reads.filter((h) => h.asset.kind === 'erc20' && h.balance > 0n)
  const nativeRead = reads.find((h) => h.asset.kind === 'native')
  const hasNative = Boolean(nativeRead && nativeRead.balance > 0n)

  const feeData = await provider.getFeeData()
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n
  const nativeGasReserve = (TRANSFER_GAS_LIMIT * gasPrice * GAS_BUFFER_NUM) / GAS_BUFFER_DEN

  // ERC-20s first, native last (native pays the gas for every transfer).
  const holdings = [...erc20Holdings]
  if (hasNative) holdings.push(nativeRead)
  return { from, holdings, nativeGasReserve, hasNative }
}

/**
 * Sweep ALL supported assets held by the legacy key to `to`. Transfers each
 * ERC-20 first, then the native currency last (leaving a gas reserve so the
 * transaction pays for itself). A single asset failing NEVER aborts the rest —
 * every asset gets an honest outcome, so nothing is silently dropped and funds
 * are never stranded.
 *
 * @param {(outcome: object) => void} [onProgress] - called after each asset
 * @returns {Promise<Array<{ asset: object, status: 'sent'|'skipped'|'failed',
 *   txHash?: string, error?: string }>>}
 */
export async function sweepAllAssets({ kind, secret, to, chainId, provider, registry, onProgress }) {
  if (!ethers.isAddress(to)) throw new Error('Enter a valid destination address.')
  const quote = await quoteAllAssets({ kind, secret, chainId, provider, registry })
  if (to.toLowerCase() === quote.from.toLowerCase()) {
    throw new Error('Choose a destination other than the legacy account.')
  }
  const signer = walletFromSecret({ kind, secret }, provider)
  const outcomes = []
  const record = (o) => {
    outcomes.push(o)
    if (onProgress) onProgress(o)
  }

  for (const { asset, balance } of quote.holdings) {
    if (asset.kind === 'native') {
      const sendable = balance > quote.nativeGasReserve ? balance - quote.nativeGasReserve : 0n
      if (sendable <= 0n) {
        record({ asset, status: 'skipped', error: 'Not enough to cover the network fee.' })
        continue
      }
      try {
        const tx = await signer.sendTransaction({ to, value: sendable, gasLimit: TRANSFER_GAS_LIMIT })
        await tx.wait()
        record({ asset, status: 'sent', txHash: tx.hash })
      } catch (e) {
        record({ asset, status: 'failed', error: e.reason || e.shortMessage || e.message })
      }
      continue
    }
    try {
      const erc20 = new ethers.Contract(asset.address, TRANSFER_ABI, signer)
      const tx = await erc20.transfer(to, balance)
      await tx.wait()
      record({ asset, status: 'sent', txHash: tx.hash })
    } catch (e) {
      record({ asset, status: 'failed', error: e.reason || e.shortMessage || e.message })
    }
  }

  return outcomes
}
