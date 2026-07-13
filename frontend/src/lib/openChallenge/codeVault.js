/**
 * Open-challenge claim-code recovery vault (feature 024 follow-up).
 *
 * Open challenges derive everything — discovery, terms key, acceptance signature — from a random four-word
 * code shown to the creator exactly once. If the creator loses it they can't re-read, re-share, or recover
 * the challenge. This vault keeps an at-rest-encrypted copy of the code so the creator can recover it later.
 *
 * The vault is stored in localStorage, scoped per wallet address, and encrypted with a key derived from a
 * wallet signature over a domain-separated message — so it's readable only with the SAME wallet (no
 * passphrase to remember), and never leaves the device. Reuses the audited ChaCha20-Poly1305 primitives
 * (the same approach as the address-book backup, lib/addressBook/addressBookCrypto.js).
 */

import { keccak256, toUtf8Bytes, getBytes, concat } from 'ethers'
import { encryptJson, decryptJson, utf8ToBytes } from '../../utils/crypto/primitives'

const STORAGE_PREFIX = 'fairwins.ocCodeVault.'
const VAULT_FORMAT = 'fairwins-oc-code-vault'
const VAULT_VERSION = 1
const VAULT_ALG = 'chacha20poly1305'

// Domain tag keeps the vault key independent from any other wallet-derived key.
const VAULT_KEY_DOMAIN = 'FairWins/open-challenge/code-vault/v1'

/** Message the wallet signs to unlock the vault. Stable, so the same wallet always derives the same key. */
export const CODE_VAULT_SIGN_MESSAGE =
  'FairWins — unlock the encrypted backup of your open-challenge codes on this device.'

/** Derive the 32-byte vault key from a raw signature (no wallet popup). */
export function deriveVaultKey(signature) {
  if (!signature) throw new Error('deriveVaultKey: signature required')
  return getBytes(keccak256(toUtf8Bytes(VAULT_KEY_DOMAIN + signature)))
}

/**
 * Derive the 32-byte vault key from a passkey account's PRF master seed (spec 041) — the login-method-agnostic
 * twin of {@link deriveVaultKey}. Same domain tag keeps it independent from other seed-derived keys, and the
 * seed is deterministic per account so the same passkey account always unlocks the same on-device vault.
 * @param {Uint8Array} seed - 32-byte master seed
 */
export function deriveVaultKeyFromSeed(seed) {
  if (!seed) throw new Error('deriveVaultKeyFromSeed: seed required')
  return getBytes(keccak256(concat([toUtf8Bytes(VAULT_KEY_DOMAIN), seed])))
}

function storageKey(address) {
  return `${STORAGE_PREFIX}${String(address).toLowerCase()}`
}

// AAD binds the envelope header so a tampered format/version fails authentication.
function aad() {
  return utf8ToBytes(`${VAULT_FORMAT}:${VAULT_VERSION}`)
}

function readEnvelope(address) {
  try {
    const raw = localStorage.getItem(storageKey(address))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeEnvelope(address, envelope) {
  localStorage.setItem(storageKey(address), JSON.stringify(envelope))
}

/** True if this device holds any saved codes for the wallet (no key needed — doesn't decrypt). */
export function hasVault(address) {
  if (!address) return false
  return Boolean(readEnvelope(address))
}

/**
 * Read and decrypt the saved code entries for a wallet. Returns [] when nothing is stored.
 * Throws a friendly error when an envelope exists but the key can't open it (wrong wallet / corrupt).
 */
export function readEntries(address, key) {
  const env = readEnvelope(address)
  if (!env || !env.nonce || !env.ciphertext) return []
  let payload
  try {
    payload = decryptJson(key, env.nonce, env.ciphertext, aad())
  } catch {
    throw new Error('Could not unlock your saved codes — this backup may belong to a different wallet.')
  }
  return Array.isArray(payload?.entries) ? payload.entries : []
}

function writeEntries(address, key, entries) {
  const { nonce, ciphertext } = encryptJson(key, { type: VAULT_FORMAT, entries }, aad())
  writeEnvelope(address, { format: VAULT_FORMAT, version: VAULT_VERSION, alg: VAULT_ALG, nonce, ciphertext })
}

/**
 * Add (or refresh) one saved code. De-duplicates by code so re-saving the same challenge updates in place
 * rather than piling up. Newest first. Returns the updated entry list.
 */
export function addEntry(address, key, entry) {
  if (!entry?.code) throw new Error('addEntry: a code is required')
  const existing = readEntries(address, key)
  const code = String(entry.code)
  const filtered = existing.filter((e) => String(e.code) !== code)
  const next = [{ ...entry, code, savedAt: Date.now() }, ...filtered]
  writeEntries(address, key, next)
  return next
}

/** Remove a saved code by its code string. Returns the updated list. */
export function removeEntry(address, key, code) {
  const existing = readEntries(address, key)
  const next = existing.filter((e) => String(e.code) !== String(code))
  writeEntries(address, key, next)
  return next
}
