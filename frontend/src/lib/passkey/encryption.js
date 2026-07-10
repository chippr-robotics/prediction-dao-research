/**
 * Passkey encryption keys (spec 041) — the PRF → master-seed → X25519/X-Wing
 * bridge that lets a passkey account participate in FairWins envelope encryption
 * exactly like an EOA, WITHOUT an EOA signature.
 *
 * Flow:
 *   1. Recover (or, for a fresh account, create) the per-account master seed from
 *      the WebAuthn PRF extension — ONE assertion ceremony (prfKeys.js).
 *   2. Deterministically derive the X25519 + X-Wing keypairs from that seed
 *      (crypto/envelopeEncryption.js seed helpers). Same seed ⇒ same keys on every
 *      device/controller.
 *
 * The returned `publicKey` (X25519, 32 bytes) is exactly what gets published to
 * the on-chain KeyRegistry (keyRegistryService.buildRegisterKeyCalls) so senders
 * can look it up and encrypt to this account — identical interop to the EOA path.
 *
 * Honest degradation (clarification Q1 / FR-012): a non-PRF authenticator, or a
 * credential with no key material on an already-initialized account, surfaces
 * `EncryptionUnavailable` (thrown by prfKeys) — the caller keeps the membership
 * fully valid and only gates encrypted features off.
 */

import { blobStore, initMasterSeed, unwrapMasterSeed, EncryptionUnavailable } from './prfKeys'
import { deriveKeyPairFromSeed, deriveXWingKeyPairFromSeed } from '../../utils/crypto/envelopeEncryption'

/**
 * Recover or initialize the master seed for a passkey credential (one PRF ceremony).
 *
 *  - blob for this credential exists ⇒ unwrap it (returning device / synced credential);
 *  - account has NO blobs at all ⇒ first-time init (this credential becomes the first controller);
 *  - account initialized but not for THIS credential ⇒ EncryptionUnavailable (add it from a
 *    signed-in device via Account → Controllers), never derive wrong keys.
 *
 * @param {object} opts
 * @param {string} opts.account - passkey smart-account address
 * @param {string} opts.credentialId - the session credential (pins the ceremony)
 * @param {object} [opts.deps] - injectable getAssertion / store / subtle for tests
 * @returns {Promise<Uint8Array>} 32-byte master seed (memory-only)
 */
export async function resolveMasterSeed({ account, credentialId, deps = {} }) {
  if (!account) throw new Error('resolveMasterSeed: account is required')
  if (!credentialId) {
    throw new EncryptionUnavailable('no passkey credential is bound to this session — sign in again')
  }
  const store = deps.store ?? blobStore()
  if (store.get(account, credentialId)) {
    return unwrapMasterSeed({ account, credentialId, deps })
  }
  if (store.listCredentials(account).length === 0) {
    return initMasterSeed({ account, credentialId, deps })
  }
  throw new EncryptionUnavailable(
    'this passkey has no key material on this account yet — add it from a signed-in device (Account → Controllers)'
  )
}

/**
 * Ensure the passkey account's encryption keypairs, deriving them from the PRF
 * master seed. Shape matches the EOA `ensureInitialized` contract so it can drop
 * into usePurchaseFlow's `sign` step (`{ publicKey }` is required; the rest lets
 * callers encrypt/decrypt locally).
 *
 * @param {object} opts - { account, credentialId, deps }
 * @returns {Promise<{publicKey: Uint8Array, privateKey: Uint8Array,
 *   xwingPublicKey: Uint8Array, xwingSecretKey: Uint8Array}>}
 * @throws {EncryptionUnavailable} on a non-PRF authenticator or missing key material
 */
export async function ensurePasskeyEncryptionKeys({ account, credentialId, deps = {} }) {
  const seed = await resolveMasterSeed({ account, credentialId, deps })
  const x25519 = deriveKeyPairFromSeed(seed)
  const xwing = deriveXWingKeyPairFromSeed(seed)
  return {
    publicKey: x25519.publicKey,
    privateKey: x25519.privateKey,
    xwingPublicKey: xwing.publicKey,
    xwingSecretKey: xwing.secretKey,
  }
}
