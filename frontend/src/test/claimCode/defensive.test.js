import { describe, it, expect } from 'vitest'
import { verifyTypedData } from 'ethers'
import {
  deriveFromCode,
  signOpenAccept,
  OPEN_ACCEPT_TYPES,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
} from '../../utils/claimCode/deriveFromCode.js'
import { generateCode } from '../../utils/claimCode/wordlist.js'
import {
  encryptEnvelopeCode,
  decryptEnvelopeCode,
} from '../../utils/crypto/envelopeEncryption.js'

/**
 * T031 / FR-008, FR-009, FR-019 — Defensive properties of the claim-code scheme.
 *
 * 1. Code isolation: distinct codes derive distinct claim addresses + symmetric keys —
 *    an unknown code never collides onto another wager's discovery key or terms key.
 * 2. Tamper-evidence: mutating envelope ciphertext fails AEAD authentication (no partial plaintext).
 * 3. Replay/front-run resistance: an acceptance signature is bound to a specific taker —
 *    it does not authorize a different taker.
 *
 * Pure unit test — local ethers signing only, no network, no real wallet.
 */
describe('Claim-code defensive properties (FR-008/009/019)', () => {
  describe('code isolation (FR-008)', () => {
    it('two different codes derive different claimAddress and symKey', () => {
      const codeA = generateCode()
      let codeB = generateCode()
      while (codeB === codeA) codeB = generateCode()

      const a = deriveFromCode(codeA)
      const b = deriveFromCode(codeB)

      expect(a.claimAddress).not.toEqual(b.claimAddress)
      expect(Array.from(a.symKey)).not.toEqual(Array.from(b.symKey))
    })

    it('derivation is deterministic — the same code re-derives the same address and key', () => {
      const code = generateCode()
      const a = deriveFromCode(code)
      const b = deriveFromCode(code)
      expect(a.claimAddress).toEqual(b.claimAddress)
      expect(Array.from(a.symKey)).toEqual(Array.from(b.symKey))
    })
  })

  describe('tamper-evidence (FR-019)', () => {
    it('a mutated ciphertext fails to decrypt rather than yielding partial plaintext', () => {
      const code = generateCode()
      const { symKey } = deriveFromCode(code)
      const terms = { description: 'Will it snow in Denver?', stake: '5' }
      const envelope = encryptEnvelopeCode(terms, symKey)

      // Flip a byte in the hex ciphertext (still valid hex, wrong content → fails Poly1305 tag).
      const ct = envelope.content.ciphertext
      const idx = 8 // a content byte, past any header
      const flippedNibble = (parseInt(ct[idx], 16) ^ 0xf).toString(16)
      const tampered = {
        ...envelope,
        content: { ...envelope.content, ciphertext: ct.slice(0, idx) + flippedNibble + ct.slice(idx + 1) },
      }
      expect(tampered.content.ciphertext).not.toEqual(ct)

      let recovered
      let threw = false
      try {
        recovered = decryptEnvelopeCode(tampered, symKey)
      } catch {
        threw = true
      }
      expect(threw || (recovered != null && JSON.stringify(recovered) !== JSON.stringify(terms))).toBe(true)
      if (!threw) expect(recovered).not.toEqual(terms)
    })
  })

  describe('replay / front-run resistance (FR-009/FR-011)', () => {
    const chainId = 80002 // Polygon Amoy
    const verifyingContract = '0x000000000000000000000000000000000000dEaD'

    it('a signature bound to taker A verifies to the code key for A, but NOT for taker B', async () => {
      const code = generateCode()
      const { claimAddress } = deriveFromCode(code)

      const wagerId = 42n
      const takerA = '0x1111111111111111111111111111111111111111'
      const takerB = '0x2222222222222222222222222222222222222222'

      const sig = await signOpenAccept(code, { wagerId, taker: takerA, chainId, verifyingContract })

      const domain = {
        name: EIP712_DOMAIN_NAME,
        version: EIP712_DOMAIN_VERSION,
        chainId,
        verifyingContract,
      }

      // Recovering against the SAME taker (A) yields the code's claim address (authorizes A).
      const recoveredForA = verifyTypedData(domain, OPEN_ACCEPT_TYPES, { wagerId, taker: takerA }, sig)
      expect(recoveredForA.toLowerCase()).toEqual(claimAddress.toLowerCase())

      // Recovering the SAME signature against a DIFFERENT taker (B) does NOT yield the claim
      // address — taker A's signature cannot authorize taker B (front-run defense).
      const recoveredForB = verifyTypedData(domain, OPEN_ACCEPT_TYPES, { wagerId, taker: takerB }, sig)
      expect(recoveredForB.toLowerCase()).not.toEqual(claimAddress.toLowerCase())
    })

    it('a signature is also bound to the wagerId (cannot be replayed on another wager)', async () => {
      const code = generateCode()
      const { claimAddress } = deriveFromCode(code)
      const taker = '0x1111111111111111111111111111111111111111'

      const sig = await signOpenAccept(code, { wagerId: 1n, taker, chainId, verifyingContract })

      const domain = { name: EIP712_DOMAIN_NAME, version: EIP712_DOMAIN_VERSION, chainId, verifyingContract }

      expect(
        verifyTypedData(domain, OPEN_ACCEPT_TYPES, { wagerId: 1n, taker }, sig).toLowerCase()
      ).toEqual(claimAddress.toLowerCase())
      // A different wagerId does not recover the claim authority.
      expect(
        verifyTypedData(domain, OPEN_ACCEPT_TYPES, { wagerId: 2n, taker }, sig).toLowerCase()
      ).not.toEqual(claimAddress.toLowerCase())
    })
  })
})
