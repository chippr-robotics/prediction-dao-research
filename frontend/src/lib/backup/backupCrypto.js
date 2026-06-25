// Spec 032 — encryption for the unified data backup. Reuses the audited primitives + the wallet-signature
// key-derivation pattern from addressBookCrypto (keccak256 of a domain-separated signMessage). The domain
// message is DISTINCT from the wager/address-book messages so the backup key can never coincide with another
// key the wallet derives. The envelope mirrors the address-book backup shape; header is bound via AEAD AAD.

import { getBytes, keccak256, toUtf8Bytes } from 'ethers'
import { encryptJson, decryptJson, utf8ToBytes } from '../../utils/crypto/primitives'

export const DATA_BACKUP_MESSAGE_V1 = 'FairWins Data Backup v1'
export const BACKUP_FORMAT = 'fairwins-data-backup'
export const BACKUP_VERSION = 1

const AAD = utf8ToBytes(`${BACKUP_FORMAT}:${BACKUP_VERSION}`)

/** Derive the 32-byte symmetric key from a signature string (no wallet prompt). Pure + deterministic. */
export function deriveKeyFromSignature(signature) {
  return getBytes(keccak256(toUtf8Bytes(signature)))
}

/** Derive the backup key by asking the wallet to sign the fixed domain message (one prompt; cache upstream). */
export async function deriveKey(signer) {
  const signature = await signer.signMessage(DATA_BACKUP_MESSAGE_V1)
  return deriveKeyFromSignature(signature)
}

/** Encrypt a bundle object into the storable envelope. */
export function encryptBundle(key, bundle) {
  const { nonce, ciphertext } = encryptJson(key, bundle, AAD)
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, alg: 'chacha20poly1305', nonce, ciphertext }
}

/** Decrypt an envelope back to the bundle. Throws on a wrong key / tampered envelope (AEAD auth fails) or a
 *  non-backup/foreign-version envelope — callers treat a throw as "no usable backup" (never overwrite local). */
export function decryptBundle(key, envelope) {
  if (!envelope || envelope.format !== BACKUP_FORMAT || envelope.version !== BACKUP_VERSION) {
    throw new Error('Not a recognized FairWins data backup')
  }
  return decryptJson(key, envelope.nonce, envelope.ciphertext, AAD)
}
