import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  canonicalizeDocText,
  hashDocVersion,
  verifyDocVersion,
  CANONICALIZATION_VERSION,
  DOC_TYPES,
  getCurrentDocument,
  getDocumentByHash,
  listVersions,
  requiresReconsent,
} from '../utils/legalDocs.js'
import { buildTermsAAD, TERMS_AAD_PREFIX } from '../utils/crypto/constants.js'

// Independent SHA-256 (node:crypto) over the documented canonical bytes — proves a third
// party can reproduce the version hash (Spec 007 SC-005/FR-026/FR-059).
function independentHash(text) {
  const canonical = text.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  return createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex')
}

describe('legalDocs canonicalization & hashing (T009)', () => {
  it('exposes the frozen canonicalization id', () => {
    expect(CANONICALIZATION_VERSION).toBe('nfc-lf-utf8-trim-v1')
  })

  it('canonicalizes CRLF and lone CR to LF and trims', () => {
    expect(canonicalizeDocText('a\r\nb\rc\n')).toBe('a\nb\nc')
    expect(canonicalizeDocText('  hello  ')).toBe('hello')
  })

  it('produces a 64-char lowercase hex digest', () => {
    const h = hashDocVersion('FairWins Terms v1')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic and independent-party reproducible', () => {
    const text = 'FairWins — Terms & Conditions\nLine two.\n'
    expect(hashDocVersion(text)).toBe(hashDocVersion(text))
    expect(hashDocVersion(text)).toBe(independentHash(text))
  })

  it('hash is invariant to line-ending and trailing-whitespace differences', () => {
    expect(hashDocVersion('a\r\nb')).toBe(hashDocVersion('a\nb'))
    expect(hashDocVersion('a\nb\n\n')).toBe(hashDocVersion('a\nb'))
  })

  it('verifyDocVersion matches (case-insensitive) and rejects tampering', () => {
    const text = 'Risk Disclosure body'
    const h = hashDocVersion(text)
    expect(verifyDocVersion(text, h)).toBe(true)
    expect(verifyDocVersion(text, h.toUpperCase())).toBe(true)
    expect(verifyDocVersion(text + ' tampered', h)).toBe(false)
  })
})

describe('legal document manifest (T030)', () => {
  it('exposes the three document types', () => {
    expect([...DOC_TYPES]).toEqual(['terms', 'risk', 'privacy'])
  })

  it('getCurrentDocument returns content + a reproducible hash version + material flag', () => {
    for (const t of DOC_TYPES) {
      const doc = getCurrentDocument(t)
      expect(doc).toBeTruthy()
      expect(doc.content.length).toBeGreaterThan(0)
      expect(doc.hash).toMatch(/^[0-9a-f]{64}$/)
      expect(doc.hash).toBe(hashDocVersion(doc.content))
      expect(doc.material).toBe(true)
      expect(doc.route).toBe(`/${t === 'risk' ? 'risk' : t}`)
    }
  })

  it('getDocumentByHash retrieves the current version and returns null for unknown', () => {
    const cur = getCurrentDocument('terms')
    const got = getDocumentByHash('terms', cur.hash)
    expect(got.hash).toBe(cur.hash)
    expect(got.content).toBe(cur.content)
    expect(getDocumentByHash('terms', 'f'.repeat(64))).toBeNull()
    expect(getDocumentByHash('nope', cur.hash)).toBeNull()
  })

  it('listVersions includes the current hash and omits content', () => {
    const cur = getCurrentDocument('risk')
    const versions = listVersions('risk')
    expect(versions.some((v) => v.hash === cur.hash)).toBe(true)
    expect(versions[0]).not.toHaveProperty('content')
    expect(versions[0]).toHaveProperty('id')
  })

  it('requiresReconsent is false for the current hash, true otherwise (material)', () => {
    const cur = getCurrentDocument('terms')
    expect(requiresReconsent('terms', cur.hash)).toBe(false)
    expect(requiresReconsent('terms', '')).toBe(true)
    expect(requiresReconsent('terms', 'a'.repeat(64))).toBe(true)
  })
})

describe('buildTermsAAD (T010)', () => {
  it('builds deterministic AAD bytes in the documented format', () => {
    const aad = buildTermsAAD('1.1', 'deadbeef')
    expect(new TextDecoder().decode(aad)).toBe(`${TERMS_AAD_PREFIX}|1.1|deadbeef`)
  })

  it('is byte-identical across calls (seal/open must match)', () => {
    const a = buildTermsAAD('1.1', 'abc123')
    const b = buildTermsAAD('1.1', 'abc123')
    expect(a).toEqual(b)
  })

  it('throws on missing arguments', () => {
    expect(() => buildTermsAAD('', 'abc')).toThrow()
    expect(() => buildTermsAAD('1.1', '')).toThrow()
  })

  it('does not collide for different versions/hashes', () => {
    const decode = (u) => new TextDecoder().decode(u)
    expect(decode(buildTermsAAD('1.1', 'aa'))).not.toBe(decode(buildTermsAAD('1.1', 'bb')))
    expect(decode(buildTermsAAD('1.0', 'aa'))).not.toBe(decode(buildTermsAAD('1.1', 'aa')))
  })
})
