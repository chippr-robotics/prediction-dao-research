import { describe, it, expect } from 'vitest'
import { Wallet, verifyMessage } from 'ethers'
import {
  ELIGIBILITY_DISCLOSURE,
  KEYGEN_TERMS_URL,
  getSigningMessage,
} from '../utils/crypto/constants.js'

// Spec 007 — US6 (FR-040/FR-041/FR-044, SC-009).

describe('key-gen eligibility disclosure (T048)', () => {
  it('states the standing eligibility facts', () => {
    const text = ELIGIBILITY_DISCLOSURE.facts.join(' ')
    expect(text).toMatch(/21 years/i)
    expect(text).toMatch(/not located in a Restricted Jurisdiction/i)
    expect(text).toMatch(/sanctioned/i)
    expect(text).toMatch(/sole control of this wallet/i)
  })

  it('references the Terms generically (URL, no version/date)', () => {
    expect(ELIGIBILITY_DISCLOSURE.termsReference).toContain(KEYGEN_TERMS_URL)
    expect(ELIGIBILITY_DISCLOSURE.termsReference).toMatch(/as published/i)
    expect(ELIGIBILITY_DISCLOSURE.termsReference).not.toMatch(/\d{4}-\d{2}-\d{2}/) // no date
  })

  it('discloses that signing derives the account encryption key (FR-044)', () => {
    expect(ELIGIBILITY_DISCLOSURE.keyDerivationNotice).toMatch(/derives the encryption key/i)
    expect(ELIGIBILITY_DISCLOSURE.keyDerivationNotice).toMatch(/no .*transaction|costs no gas/i)
  })
})

describe('key-derivation message determinism + recoverability (SC-009)', () => {
  it('the signing message is byte-identical across calls (no nonce/timestamp)', () => {
    expect(getSigningMessage(2)).toBe(getSigningMessage(2))
    expect(getSigningMessage(1)).toBe(getSigningMessage(1))
  })

  it('signing the deterministic message is reproducible and recovers the signer', async () => {
    const wallet = new Wallet('0x' + '11'.repeat(32))
    const msg = getSigningMessage(2)
    const sig1 = await wallet.signMessage(msg)
    const sig2 = await wallet.signMessage(msg)
    expect(sig1).toBe(sig2) // deterministic ECDSA (RFC 6979) → reproducible key derivation
    expect(verifyMessage(msg, sig1)).toBe(wallet.address)
  })
})
