import { describe, it, expect } from 'vitest'
import { deriveFromCode } from '../../utils/claimCode/deriveFromCode.js'
import { generateCode } from '../../utils/claimCode/wordlist.js'
import {
  encryptEnvelopeCode,
  decryptEnvelopeCode,
  isCodeEnvelope,
} from '../../utils/crypto/envelopeEncryption.js'

/**
 * T025a / FR-018 — Post-accept readability.
 *
 * Reading an open challenge's terms after accepting must need ONLY the four-word code:
 * no re-key step, no registered encryption key, no server. The creator seals the terms
 * under a symKey derived from the code; the bound opponent, holding the same code,
 * re-derives the identical symKey and recovers the plaintext.
 *
 * Pure-crypto unit test — no rendering, no network, no wallet.
 */
describe('Open-challenge post-accept readability (FR-018)', () => {
  const terms = {
    description: "I'm betting NO that it rains in Denver tomorrow",
    stake: '10',
    resolutionType: 'Either',
  }

  it('the bound opponent recovers the terms from ONLY the four-word code (no re-key)', () => {
    const code = generateCode()

    // Creator seals the terms under the code-derived symmetric key.
    const { symKey: creatorSymKey } = deriveFromCode(code)
    const envelope = encryptEnvelopeCode(terms, creatorSymKey)

    // It is a recognizable code-keyed envelope (mode: 'code').
    expect(isCodeEnvelope(envelope)).toBe(true)

    // Opponent has ONLY the same four-word code — no shared key, no signature, no server state.
    // Re-deriving from the code alone must produce the identical symKey...
    const { symKey: opponentSymKey } = deriveFromCode(code)
    expect(Array.from(opponentSymKey)).toEqual(Array.from(creatorSymKey))

    // ...and recover the exact plaintext terms.
    const recovered = decryptEnvelopeCode(envelope, opponentSymKey)
    expect(recovered).toEqual(terms)
  })

  it('whitespace / case variants of the same code still re-derive and read the terms', () => {
    const code = generateCode()
    const { symKey } = deriveFromCode(code)
    const envelope = encryptEnvelopeCode(terms, symKey)

    // A taker who types the code with messy spacing/case normalizes to the same key (FR-018).
    const messy = `  ${code.toUpperCase().replace(/ /g, '   ')}  `
    const { symKey: messySymKey } = deriveFromCode(messy)
    expect(Array.from(messySymKey)).toEqual(Array.from(symKey))
    expect(decryptEnvelopeCode(envelope, messySymKey)).toEqual(terms)
  })

  it('discarding the code (a DIFFERENT code) yields "terms unavailable", not the plaintext', () => {
    // Independent of funds/resolution: this is a pure client-side read. The on-chain wager
    // is unaffected by losing the code — only the ability to re-read the private terms is lost.
    const code = generateCode()
    let wrongCode = generateCode()
    while (wrongCode === code) wrongCode = generateCode()

    const { symKey } = deriveFromCode(code)
    const envelope = encryptEnvelopeCode(terms, symKey)

    const { symKey: wrongSymKey } = deriveFromCode(wrongCode)
    expect(Array.from(wrongSymKey)).not.toEqual(Array.from(symKey))

    // AEAD authentication: a wrong key throws rather than returning partial/garbage plaintext.
    let recovered
    let threw = false
    try {
      recovered = decryptEnvelopeCode(envelope, wrongSymKey)
    } catch {
      threw = true
    }
    // Either way, the original terms must NOT be recoverable without the code.
    expect(threw || (recovered !== null && JSON.stringify(recovered) !== JSON.stringify(terms))).toBe(true)
    if (!threw) {
      expect(recovered).not.toEqual(terms)
    }
  })
})
