/**
 * Mini-app integrity chain (spec 073, T017 · research R3).
 *
 * These tests are the proof of FR-011's hard rule at the byte level: the two
 * comparisons that stand between a gateway and code execution actually reject
 * what they claim to reject, and cannot be talked out of it by encoding.
 *
 * Fixtures are built inline rather than read from disk so each case states
 * exactly which byte it changed — a tampered fixture whose provenance is one
 * function call away is far easier to trust than one committed as an artifact.
 */

import { describe, it, expect } from 'vitest'
import { keccak256 } from 'ethers'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

import {
  IntegrityError,
  ZERO_MANIFEST_HASH,
  digestsMatch,
  isZeroHash,
  keccak256Hex,
  normalizeBytes32Hex,
  normalizeDigestHex,
  sha256Hex,
  toPackageBytes,
  verifyFileBytes,
  verifyManifestBytes,
} from '../../lib/miniapps/integrity'

// `Uint8Array.from(...)` re-homes the bytes into this module's realm. jsdom's
// TextEncoder returns a view from the jsdom realm, which ethers' own
// `instanceof Uint8Array` check rejects — a test-environment artifact (in a
// browser both are native and same-realm), but it would otherwise make these
// tests fail for a reason that has nothing to do with integrity.
const utf8 = (text) => Uint8Array.from(new TextEncoder().encode(text))

/** Flip one byte — the smallest possible tamper. */
const tamper = (bytes, index = 0) => {
  const copy = new Uint8Array(bytes)
  copy[index] = copy[index] ^ 0x01
  return copy
}

const MANIFEST_BYTES = utf8('{"schema":"fairwins-miniapp-manifest/1","id":"token-mint"}\n')
const ENTRY_BYTES = utf8('export default function Entry() { return null }\n')

describe('digest normalization', () => {
  it('accepts a digest in any of the encodings it can arrive in', () => {
    const lower = 'a'.repeat(64)
    expect(normalizeDigestHex(lower)).toBe(lower)
    expect(normalizeDigestHex(lower.toUpperCase())).toBe(lower)
    expect(normalizeDigestHex(`0x${lower.toUpperCase()}`)).toBe(lower)
    expect(normalizeDigestHex(`0X${lower}`)).toBe(lower)
    expect(normalizeDigestHex(`  ${lower}  `)).toBe(lower)
  })

  it('returns null for anything that is not a 32-byte hex digest', () => {
    expect(normalizeDigestHex('a'.repeat(63))).toBeNull()
    expect(normalizeDigestHex('a'.repeat(65))).toBeNull()
    expect(normalizeDigestHex('z'.repeat(64))).toBeNull()
    expect(normalizeDigestHex('')).toBeNull()
    expect(normalizeDigestHex(null)).toBeNull()
    expect(normalizeDigestHex(undefined)).toBeNull()
    expect(normalizeDigestHex(123)).toBeNull()
    expect(normalizeDigestHex({ sha256: 'a'.repeat(64) })).toBeNull()
  })

  it('normalizes a bytes32 to 0x-prefixed lowercase and recognizes the zero hash', () => {
    expect(normalizeBytes32Hex('B'.repeat(64))).toBe(`0x${'b'.repeat(64)}`)
    expect(isZeroHash(ZERO_MANIFEST_HASH)).toBe(true)
    expect(isZeroHash(`0X${'0'.repeat(64)}`)).toBe(true)
    expect(isZeroHash(`0x${'0'.repeat(63)}1`)).toBe(false)
  })

  it('matches digests across encodings but never treats a malformed side as equal', () => {
    const digest = sha256Hex(ENTRY_BYTES)
    expect(digestsMatch(digest, `0x${digest.toUpperCase()}`)).toBe(true)
    expect(digestsMatch(digest, tamperDigest(digest))).toBe(false)
    // Two unusable values must not compare equal to each other — otherwise a
    // record with no digest would "match" a manifest with no digest.
    expect(digestsMatch('', '')).toBe(false)
    expect(digestsMatch(null, null)).toBe(false)
    expect(digestsMatch(undefined, undefined)).toBe(false)
  })
})

/** Change the last hex character of a digest. */
function tamperDigest(digest) {
  const last = digest.slice(-1)
  return digest.slice(0, -1) + (last === '0' ? '1' : '0')
}

describe('hashing takes bytes, never a re-serialized value', () => {
  it('computes the same digests as the build side', () => {
    expect(sha256Hex(ENTRY_BYTES)).toBe(bytesToHex(sha256(ENTRY_BYTES)))
    expect(keccak256Hex(MANIFEST_BYTES)).toBe(keccak256(MANIFEST_BYTES).toLowerCase())
  })

  it('accepts every raw byte container', () => {
    const digest = sha256Hex(ENTRY_BYTES)
    expect(sha256Hex(ENTRY_BYTES.slice().buffer)).toBe(digest)
    expect(sha256Hex(new DataView(ENTRY_BYTES.slice().buffer))).toBe(digest)
    expect(toPackageBytes(ENTRY_BYTES)).toBe(ENTRY_BYTES)
  })

  it('refuses a string — decoding and re-encoding is not the identity', () => {
    // A caller handing over text would have already parsed/decoded the
    // response; hashing that would compare our encoding, not the gateway's.
    expect(() => sha256Hex('export default null')).toThrow(TypeError)
    expect(() => keccak256Hex('{"schema":"x"}')).toThrow(TypeError)
    // A TypeError, deliberately NOT an IntegrityError: this is a host bug and
    // must never be audited as a tampering event.
    expect(() => keccak256Hex('{}')).not.toThrow(IntegrityError)
  })

  it('refuses a parsed object outright', () => {
    expect(() => keccak256Hex({ schema: 'fairwins-miniapp-manifest/1' })).toThrow(TypeError)
    expect(() => sha256Hex(null)).toThrow(TypeError)
  })
})

describe('verifyManifestBytes', () => {
  const manifestHash = keccak256(MANIFEST_BYTES)

  it('accepts the exact approved bytes', () => {
    expect(verifyManifestBytes(MANIFEST_BYTES, manifestHash)).toBe(manifestHash.toLowerCase())
  })

  it('accepts an uppercase / unprefixed on-chain hash (encoding is not tampering)', () => {
    const body = manifestHash.slice(2)
    expect(verifyManifestBytes(MANIFEST_BYTES, body.toUpperCase())).toBe(manifestHash.toLowerCase())
    expect(verifyManifestBytes(MANIFEST_BYTES, `0X${body}`)).toBe(manifestHash.toLowerCase())
  })

  it('REFUSES tampered manifest bytes', () => {
    expect(() => verifyManifestBytes(tamper(MANIFEST_BYTES, 5), manifestHash)).toThrowError(
      expect.objectContaining({ name: 'IntegrityError', reason: 'manifest_hash_mismatch' })
    )
  })

  it('REFUSES manifest bytes that differ only in trailing whitespace', () => {
    // The most plausible accidental tamper: a gateway or tool re-writing the
    // file. The chain committed to bytes, so this is a mismatch, not a nuance.
    const reformatted = utf8(new TextDecoder().decode(MANIFEST_BYTES).trimEnd())
    expect(() => verifyManifestBytes(reformatted, manifestHash)).toThrow(IntegrityError)
  })

  it('REFUSES when the expected hash is malformed or zero — unverifiable is never verified', () => {
    for (const bad of [undefined, null, '', '0xdeadbeef', ZERO_MANIFEST_HASH]) {
      expect(() => verifyManifestBytes(MANIFEST_BYTES, bad)).toThrowError(
        expect.objectContaining({ name: 'IntegrityError', reason: 'invalid_expected_manifest_hash' })
      )
    }
  })

  it('carries both digests for the audit entry, and never the bytes', () => {
    let caught
    try {
      verifyManifestBytes(tamper(MANIFEST_BYTES), manifestHash)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(IntegrityError)
    expect(caught.expected).toBe(manifestHash.toLowerCase())
    expect(caught.actual).toBe(keccak256Hex(tamper(MANIFEST_BYTES)))
    expect(caught.path).toBe('manifest.json')
    expect(caught.userMessage).toMatch(/not run/i)
    expect(caught.message).not.toContain('schema')
  })
})

describe('verifyFileBytes', () => {
  const digest = sha256Hex(ENTRY_BYTES)

  it('accepts the exact declared bytes', () => {
    expect(verifyFileBytes('entry.js', ENTRY_BYTES, digest)).toBe(digest)
  })

  it('REFUSES tampered entry bytes', () => {
    expect(() => verifyFileBytes('entry.js', tamper(ENTRY_BYTES, 10), digest)).toThrowError(
      expect.objectContaining({ name: 'IntegrityError', reason: 'file_hash_mismatch', path: 'entry.js' })
    )
  })

  it('REFUSES a single appended byte (a payload smuggled onto the end)', () => {
    const appended = new Uint8Array(ENTRY_BYTES.length + 1)
    appended.set(ENTRY_BYTES)
    appended[ENTRY_BYTES.length] = 0x20
    expect(() => verifyFileBytes('entry.js', appended, digest)).toThrow(IntegrityError)
  })

  it('REFUSES a malformed declared digest instead of skipping the check', () => {
    expect(() => verifyFileBytes('entry.js', ENTRY_BYTES, 'not-a-digest')).toThrowError(
      expect.objectContaining({ reason: 'invalid_expected_file_digest' })
    )
    expect(() => verifyFileBytes('entry.js', ENTRY_BYTES, undefined)).toThrowError(
      expect.objectContaining({ reason: 'invalid_expected_file_digest' })
    )
  })
})
