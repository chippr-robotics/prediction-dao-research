/**
 * Address Book encrypted export/import (Spec 021, US5).
 *
 * The backup is encrypted with a symmetric key derived from a wallet signature
 * over a domain-separated message (clarified Q1). A backup is therefore
 * restorable only with the SAME wallet — no passphrase to remember. Reuses the
 * audited @noble ChaCha20-Poly1305 primitives in utils/crypto/primitives.js.
 */

import { keccak256, toUtf8Bytes, getBytes } from 'ethers'
import { encryptJson, decryptJson, utf8ToBytes } from '../../utils/crypto/primitives'
import {
  ADDRESS_BOOK_BACKUP_MESSAGE_V1,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  EXPORT_PAYLOAD_TYPE,
  SCHEMA_VERSION,
} from './constants'

const ALG = 'chacha20poly1305'

/** Derive the 32-byte backup key from a raw signature (no wallet popup). */
export function deriveBackupKeyFromSignature(signature) {
  return getBytes(keccak256(toUtf8Bytes(signature)))
}

/** Derive the backup key by prompting the wallet to sign the backup message. */
export async function deriveBackupKey(signer) {
  if (!signer || typeof signer.signMessage !== 'function') {
    throw new Error('Wallet not connected')
  }
  const signature = await signer.signMessage(ADDRESS_BOOK_BACKUP_MESSAGE_V1)
  return deriveBackupKeyFromSignature(signature)
}

// AAD binds the envelope metadata so a tampered header fails authentication.
function aad() {
  return utf8ToBytes(`${EXPORT_FORMAT}:${EXPORT_VERSION}`)
}

/** Build the plaintext export payload from a book (strips local-only fields). */
function toPayload(book) {
  return {
    type: EXPORT_PAYLOAD_TYPE,
    schemaVersion: book.schemaVersion ?? SCHEMA_VERSION,
    exportedAt: Date.now(),
    contacts: (book.contacts || []).map((c) => ({
      nickname: c.nickname,
      addresses: (c.addresses || []).map((a) => ({
        address: a.address,
        chainId: a.chainId,
        notes: a.notes || '',
      })),
    })),
  }
}

/**
 * Encrypt a book to a JSON envelope string ready to download (FR-019).
 * Prompts one wallet signature.
 */
export async function exportAddressBook(book, signer) {
  const key = await deriveBackupKey(signer)
  const { nonce, ciphertext } = encryptJson(key, toPayload(book), aad())
  return JSON.stringify(
    { format: EXPORT_FORMAT, version: EXPORT_VERSION, alg: ALG, nonce, ciphertext },
    null,
    2,
  )
}

/**
 * Decrypt an envelope back into a book-shaped object (FR-020). Throws a typed
 * error on wrong wallet / corrupt / incompatible file (FR-021). Prompts one
 * wallet signature.
 *
 * @returns {{ schemaVersion: number, contacts: Array }}
 */
export async function importAddressBook(envelopeJson, signer) {
  let envelope
  try {
    envelope = typeof envelopeJson === 'string' ? JSON.parse(envelopeJson) : envelopeJson
  } catch {
    throw new Error('This file is not a valid address book backup')
  }
  if (!envelope || envelope.format !== EXPORT_FORMAT) {
    throw new Error('Unrecognised backup file format')
  }
  if (envelope.version !== EXPORT_VERSION) {
    throw new Error(`Unsupported backup version (${envelope.version})`)
  }
  if (!envelope.nonce || !envelope.ciphertext) {
    throw new Error('Backup file is incomplete or corrupted')
  }

  const key = await deriveBackupKey(signer)
  let payload
  try {
    payload = decryptJson(key, envelope.nonce, envelope.ciphertext, aad())
  } catch {
    // AEAD authentication failed: wrong wallet or tampered/corrupt file.
    throw new Error('Could not decrypt this backup — it may belong to a different wallet or be corrupted')
  }

  if (!payload || payload.type !== EXPORT_PAYLOAD_TYPE || !Array.isArray(payload.contacts)) {
    throw new Error('Backup contents are not a valid address book')
  }

  return {
    schemaVersion: payload.schemaVersion ?? SCHEMA_VERSION,
    contacts: payload.contacts.map((c) => ({
      nickname: c.nickname,
      addresses: (c.addresses || []).map((a) => ({
        address: a.address,
        chainId: a.chainId,
        notes: a.notes || '',
      })),
    })),
  }
}
