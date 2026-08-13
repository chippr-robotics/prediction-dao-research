/**
 * Protect ▸ Verify — the portable document.
 *
 * The document is what actually travels between two people, so the suite leans on round-tripping:
 * anything the Sign panel emits must parse back byte-identically, because the message bytes ARE
 * the thing that was signed and a document that quietly reshapes them destroys the proof.
 */

import { describe, it, expect } from 'vitest'
import {
  buildSignedMessage,
  serializeSignedMessage,
  parseSignedMessage,
  looksLikeSignedMessage,
  SIGNED_MESSAGE_FORMAT,
  SIGN_SCHEMES,
} from '../../lib/verify/signedMessage'
import { verifyMessage, VERIFY_STATUS } from '../../lib/verify/verifyMessage'
import {
  MESSAGE,
  AWKWARD_MESSAGE,
  AWKWARD_SIGNATURE,
  SIGNATURE,
  SIGNER_ADDRESS,
  CONTRACT_ACCOUNT,
  ERC1271_SIGNATURE,
  EIP191_DOCUMENT_JSON,
} from '../fixtures/signedMessages'

describe('buildSignedMessage', () => {
  it('records the claim, the message and the signature, checksumming the address', () => {
    const doc = buildSignedMessage({
      address: SIGNER_ADDRESS.toLowerCase(),
      chainId: '137',
      message: MESSAGE,
      signature: SIGNATURE,
      scheme: SIGN_SCHEMES.EIP191,
      signedAt: '2026-08-13T12:00:00.000Z',
    })
    expect(doc).toMatchObject({
      format: SIGNED_MESSAGE_FORMAT,
      address: SIGNER_ADDRESS,
      chainId: 137,
      scheme: 'eip191',
      message: MESSAGE,
      signature: SIGNATURE,
    })
  })

  it('refuses to emit an ERC-1271 document without the chain that can check it', () => {
    expect(() =>
      buildSignedMessage({
        address: CONTRACT_ACCOUNT,
        chainId: null,
        message: MESSAGE,
        signature: ERC1271_SIGNATURE,
        scheme: SIGN_SCHEMES.ERC1271,
      }),
    ).toThrow(/chain/i)
  })

  it('allows an EIP-191 document with no chain — that signature needs none', () => {
    const doc = buildSignedMessage({
      address: SIGNER_ADDRESS,
      chainId: null,
      message: MESSAGE,
      signature: SIGNATURE,
      scheme: SIGN_SCHEMES.EIP191,
    })
    expect(doc.chainId).toBeNull()
  })
})

describe('round trip', () => {
  it('survives whitespace and Unicode, and the parsed document still verifies', async () => {
    const doc = buildSignedMessage({
      address: SIGNER_ADDRESS,
      chainId: 137,
      message: AWKWARD_MESSAGE,
      signature: AWKWARD_SIGNATURE,
      scheme: SIGN_SCHEMES.EIP191,
    })
    const { ok, doc: back } = parseSignedMessage(serializeSignedMessage(doc))
    expect(ok).toBe(true)
    expect(back.message).toBe(AWKWARD_MESSAGE)
    const out = await verifyMessage({ message: back.message, signature: back.signature, address: back.address })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
  })
})

describe('parseSignedMessage', () => {
  it('reads a document from the fixture JSON', () => {
    const { ok, doc } = parseSignedMessage(EIP191_DOCUMENT_JSON)
    expect(ok).toBe(true)
    expect(doc.address).toBe(SIGNER_ADDRESS)
    expect(doc.chainId).toBe(137)
  })

  it('refuses text that is not JSON', () => {
    expect(parseSignedMessage('hello there')).toMatchObject({ ok: false })
  })

  it('refuses an unknown format rather than guessing at the fields', () => {
    const { ok, error } = parseSignedMessage(JSON.stringify({ format: 'something/9', message: 'x', signature: '0x1' }))
    expect(ok).toBe(false)
    expect(error).toMatch(/format/i)
  })

  it('refuses a document with no signature instead of defaulting one', () => {
    const { ok } = parseSignedMessage(JSON.stringify({ format: SIGNED_MESSAGE_FORMAT, message: 'x' }))
    expect(ok).toBe(false)
  })

  it('refuses a malformed address', () => {
    const { ok, error } = parseSignedMessage(
      JSON.stringify({ format: SIGNED_MESSAGE_FORMAT, message: 'x', signature: '0x1', address: '0xzz' }),
    )
    expect(ok).toBe(false)
    expect(error).toMatch(/not a valid address/i)
  })

  it('carries an unrecognized scheme through as null — the scheme is a hint, not authority', () => {
    const { ok, doc } = parseSignedMessage(
      JSON.stringify({ format: SIGNED_MESSAGE_FORMAT, message: 'x', signature: '0x1', scheme: 'wat' }),
    )
    expect(ok).toBe(true)
    expect(doc.scheme).toBeNull()
  })

  it('keeps ignoring the scheme when it LIES — the verdict comes from the bytes', async () => {
    // A document claiming eip191 over a real EIP-191 signature verifies; the same document
    // claiming erc1271 verifies identically, because nothing reads the field.
    const lying = JSON.parse(EIP191_DOCUMENT_JSON)
    lying.scheme = SIGN_SCHEMES.ERC1271
    const { doc } = parseSignedMessage(JSON.stringify(lying))
    const out = await verifyMessage({ message: doc.message, signature: doc.signature, address: doc.address })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
    expect(out.method).toBe(SIGN_SCHEMES.EIP191)
  })

  it('accepts unknown extra keys — a newer document is still readable', () => {
    const { ok } = parseSignedMessage(
      JSON.stringify({ ...JSON.parse(EIP191_DOCUMENT_JSON), somethingNew: { added: 'later' } }),
    )
    expect(ok).toBe(true)
  })
})

describe('looksLikeSignedMessage', () => {
  it('recognizes a document and leaves a bare signature alone', () => {
    expect(looksLikeSignedMessage(EIP191_DOCUMENT_JSON)).toBe(true)
    expect(looksLikeSignedMessage(SIGNATURE)).toBe(false)
  })
})
