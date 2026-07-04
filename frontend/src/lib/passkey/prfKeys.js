/**
 * PRF key derivation & master-seed wrapping (spec 041, T022) — implements
 * contracts/key-derivation.md exactly:
 *
 *   PRF(SALT_FAIRWINS_V1) → HKDF-SHA256(info="fairwins-kek-v1") → KEK
 *   masterSeed (random 32B, per account, memory-only)
 *   wrappedSeed[credential] = AES-GCM(KEK, masterSeed)   → spec-032 sync blobs
 *   derived keys = existing derivation stack fed from masterSeed
 *
 * Invariants (tested in prfKeys.test.js):
 *  - the seed is never persisted/logged/transmitted — wrapped blobs only;
 *  - same account ⇒ same seed on every device & every controller with a blob;
 *  - a credential without a blob gets 'unavailable', NEVER wrong keys;
 *  - device-dependent degradation (clarification Q1): non-PRF authenticators
 *    keep full transaction capability, encrypted features gate off honestly.
 */

import { getAssertion } from './credentials'

// Fixed, versioned PRF evaluation point — same governance as the existing
// "FairWins Market Encryption Terms v2" constant (utils/crypto/constants.js).
export const SALT_FAIRWINS_V1 = new TextEncoder().encode('fairwins.prf.salt.v1')
const HKDF_INFO = new TextEncoder().encode('fairwins-kek-v1')
const BLOBS_KEY = 'fairwins.passkey.wrappedSeeds.v1'

export class EncryptionUnavailable extends Error {
  constructor(reason) {
    super(`Encrypted features are unavailable: ${reason}`)
    this.name = 'EncryptionUnavailable'
    this.reason = reason
  }
}

/** Normalized 32-byte PRF salt (WebAuthn wants a BufferSource of the eval point). */
export function prfSalt() {
  const salt = new Uint8Array(32)
  salt.set(SALT_FAIRWINS_V1.slice(0, 32))
  return salt
}

async function kekFromPrfOutput(prfOutput, subtle = globalThis.crypto?.subtle) {
  const ikm = await subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: HKDF_INFO },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Blob store — rides the spec-032 encrypted-data-sync channel in production;
 * the default here is the local leg (sync replication handled by that spec's
 * machinery). Injectable for tests and for the sync adapter.
 */
export function blobStore(storage = globalThis.localStorage) {
  const read = () => {
    try {
      return JSON.parse(storage.getItem(BLOBS_KEY) || '{}')
    } catch {
      return {}
    }
  }
  return {
    get(account, credentialId) {
      return read()[`${account.toLowerCase()}:${credentialId}`] ?? null
    },
    set(account, credentialId, blob) {
      const all = read()
      all[`${account.toLowerCase()}:${credentialId}`] = blob
      storage.setItem(BLOBS_KEY, JSON.stringify(all))
    },
    delete(account, credentialId) {
      const all = read()
      delete all[`${account.toLowerCase()}:${credentialId}`]
      storage.setItem(BLOBS_KEY, JSON.stringify(all))
    },
    listCredentials(account) {
      const prefix = `${account.toLowerCase()}:`
      return Object.keys(read())
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length))
    },
  }
}

const toB64 = (u8) => btoa(String.fromCharCode(...u8))
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function wrapSeed(kek, seed, subtle = globalThis.crypto?.subtle) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, kek, seed))
  return { v: 1, iv: toB64(iv), ct: toB64(ct) }
}

async function unwrapSeed(kek, blob, subtle = globalThis.crypto?.subtle) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, kek, fromB64(blob.ct))
  return new Uint8Array(pt)
}

/** Run a PRF-evaluating assertion ceremony and derive the credential's KEK. */
async function kekForCredential({ credentialId, deps = {} }) {
  const assertion = await (deps.getAssertion ?? getAssertion)({
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    credentialId,
    prfSalt: prfSalt(),
    deps,
  })
  if (!assertion.prfOutput) {
    throw new EncryptionUnavailable('this passkey/authenticator does not support deterministic key material (PRF)')
  }
  return kekFromPrfOutput(assertion.prfOutput, deps.subtle)
}

/**
 * First-time initialization for an account: generate the master seed and wrap
 * it for the given (PRF-capable) credential. Idempotent — refuses when the
 * account already has any blob (`initMasterSeed` can never rotate keys out
 * from under existing controllers).
 * Returns the seed (memory-only — caller feeds it to the derivation stack).
 */
export async function initMasterSeed({ account, credentialId, deps = {} }) {
  const store = deps.store ?? blobStore()
  if (store.listCredentials(account).length > 0) {
    throw new Error('initMasterSeed: account already initialized — use unwrapMasterSeed / wrapForController')
  }
  const seed = crypto.getRandomValues(new Uint8Array(32))
  const kek = await kekForCredential({ credentialId, deps })
  store.set(account, credentialId, await wrapSeed(kek, seed, deps.subtle))
  return seed
}

/** Recover the master seed with one PRF ceremony (returning device or synced credential). */
export async function unwrapMasterSeed({ account, credentialId, deps = {} }) {
  const store = deps.store ?? blobStore()
  const blob = store.get(account, credentialId)
  if (!blob) {
    throw new EncryptionUnavailable('no key material is registered for this passkey on this account')
  }
  const kek = await kekForCredential({ credentialId, deps })
  try {
    return await unwrapSeed(kek, blob, deps.subtle)
  } catch {
    // AES-GCM authentication failure — wrong credential/corrupt blob. NEVER
    // fall through to different keys (no-silent-wrong-keys invariant).
    throw new EncryptionUnavailable('stored key material could not be unlocked with this passkey')
  }
}

/**
 * Grant an additional controller access to the SAME master seed (FR-012):
 * an existing session (already holding the seed) wraps it under the new
 * credential's PRF-derived KEK.
 */
export async function wrapForController({ account, seed, credentialId, deps = {} }) {
  const store = deps.store ?? blobStore()
  const kek = await kekForCredential({ credentialId, deps })
  store.set(account, credentialId, await wrapSeed(kek, seed, deps.subtle))
}

/** Revoke a controller's key access (paired with the on-chain owner removal — FR-020). */
export function revokeController({ account, credentialId, deps = {} }) {
  const store = deps.store ?? blobStore()
  store.delete(account, credentialId)
}

/**
 * Encryption capability for the FR-012 degradation UI:
 *   { state: 'available' } — this credential holds a wrapped seed
 *   { state: 'uninitialized' } — account has no key material yet (fresh account)
 *   { state: 'unavailable', reason } — non-PRF authenticator or no blob for
 *     this credential; transactions unaffected, encrypted features gated off.
 */
export function capability({ account, credentialId, prfCapable, deps = {} }) {
  if (!prfCapable) {
    return {
      state: 'unavailable',
      reason: 'This device cannot derive deterministic key material (WebAuthn PRF unsupported).',
    }
  }
  const store = deps.store ?? blobStore()
  const creds = store.listCredentials(account)
  if (creds.length === 0) return { state: 'uninitialized' }
  if (store.get(account, credentialId)) return { state: 'available' }
  return {
    state: 'unavailable',
    reason: 'This passkey has no key material yet — add it from a signed-in device (Account → Controllers).',
  }
}
