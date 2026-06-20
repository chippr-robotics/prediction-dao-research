import { describe, it, expect } from 'vitest'
import { verifyTypedData } from 'ethers'

// Fixed, valid checksummed addresses (well-known Hardhat accounts). We avoid Wallet.createRandom() because
// its mnemonic generation hits an ethers/@noble sha256 Buffer quirk under Vitest's jsdom — unrelated to the
// code under test; we only need distinct, valid addresses here.
const TAKER_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TAKER_B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const VERIFYING_CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
import { generateCode, normalizeCode, isValidCode } from '../../utils/claimCode/wordlist.js'
import { deriveFromCode, signOpenAccept, OPEN_ACCEPT_TYPES } from '../../utils/claimCode/deriveFromCode.js'
import {
  encryptEnvelopeCode,
  decryptEnvelopeCode,
  isCodeEnvelope
} from '../../utils/crypto/envelopeEncryption.js'

// Feature 024 — claim-code crypto: the security-critical, pure derivation reused by the create and take
// flows. (Tests written against the design in specs/024-open-challenge-wagers/contracts/claim-code-crypto.md.)

describe('claimCode/wordlist', () => {
  it('generates a four-word code from the BIP-39 list', () => {
    const code = generateCode()
    expect(code.split(' ')).to.have.length(4)
    expect(isValidCode(code)).toBe(true)
  })

  it('generates distinct codes (CSPRNG)', () => {
    const a = generateCode()
    const b = generateCode()
    expect(a).not.toEqual(b)
  })

  it('normalizes case, whitespace, and Unicode form', () => {
    expect(normalizeCode('  River   Amber\tTiger   Kite ')).toBe('river amber tiger kite')
  })

  it('rejects wrong length and unknown words', () => {
    expect(isValidCode('river amber tiger')).toBe(false) // 3 words
    expect(isValidCode('river amber tiger kite extra')).toBe(false) // 5 words
    expect(isValidCode('river amber tiger zzzznotaword')).toBe(false)
    expect(isValidCode('')).toBe(false)
  })
})

describe('claimCode/deriveFromCode', () => {
  it('is deterministic and device-independent for the same (normalized) code', () => {
    const a = deriveFromCode('river amber tiger kite')
    const b = deriveFromCode('  RIVER  amber Tiger kite ')
    expect(b.claimAddress).toBe(a.claimAddress)
    expect(Buffer.from(b.symKey).toString('hex')).toBe(Buffer.from(a.symKey).toString('hex'))
  })

  it('domain-separates the claim key from the symmetric key', () => {
    const { claimPrivateKey, symKey } = deriveFromCode('river amber tiger kite')
    // The signing key and the AEAD key are independent keccak outputs — neither equals the other.
    expect(claimPrivateKey.toLowerCase()).not.toBe('0x' + Buffer.from(symKey).toString('hex'))
  })

  it('different codes derive different claim addresses', () => {
    expect(deriveFromCode('river amber tiger kite').claimAddress)
      .not.toBe(deriveFromCode('river amber tiger zebra').claimAddress)
  })

  it('signOpenAccept produces a signature that recovers to claimAddress for the bound (wagerId, taker)', async () => {
    const code = generateCode()
    const { claimAddress } = deriveFromCode(code)
    const domain = { name: 'FairWins WagerRegistry', version: '1', chainId: 137, verifyingContract: VERIFYING_CONTRACT }
    const sig = await signOpenAccept(code, { wagerId: 42n, taker: TAKER_A, chainId: 137n, verifyingContract: VERIFYING_CONTRACT })
    const recovered = verifyTypedData(domain, OPEN_ACCEPT_TYPES, { wagerId: 42n, taker: TAKER_A }, sig)
    expect(recovered).toBe(claimAddress)
  })

  it('a signature for one taker does not verify for another (front-run resistance)', async () => {
    const code = generateCode()
    const { claimAddress } = deriveFromCode(code)
    const domain = { name: 'FairWins WagerRegistry', version: '1', chainId: 137, verifyingContract: VERIFYING_CONTRACT }
    const sig = await signOpenAccept(code, { wagerId: 1n, taker: TAKER_A, chainId: 137n, verifyingContract: VERIFYING_CONTRACT })
    // Recovering against takerB's message yields a different (wrong) address — not claimAddress.
    const recoveredForB = verifyTypedData(domain, OPEN_ACCEPT_TYPES, { wagerId: 1n, taker: TAKER_B }, sig)
    expect(recoveredForB).not.toBe(claimAddress)
  })
})

describe('crypto/envelopeEncryption — code-keyed mode', () => {
  it('round-trips terms under the code-derived symKey', () => {
    const { symKey } = deriveFromCode('river amber tiger kite')
    const terms = { description: 'Will it rain?', sideYes: 'rain', sideNo: 'dry' }
    const env = encryptEnvelopeCode(terms, symKey)
    expect(isCodeEnvelope(env)).toBe(true)
    expect(env.keys).toBeUndefined() // no recipients list
    expect(decryptEnvelopeCode(env, symKey)).toEqual(terms)
  })

  it('a wrong code fails to decrypt and never reveals terms', () => {
    const env = encryptEnvelopeCode({ secret: 'terms' }, deriveFromCode('river amber tiger kite').symKey)
    const wrong = deriveFromCode('river amber tiger zebra').symKey
    expect(() => decryptEnvelopeCode(env, wrong)).toThrow()
  })

  it('a tampered ciphertext throws (tamper-evident, FR-019)', () => {
    const { symKey } = deriveFromCode('river amber tiger kite')
    const env = encryptEnvelopeCode({ a: 1 }, symKey)
    const flipped = env.content.ciphertext.slice(0, -2) + (env.content.ciphertext.slice(-2) === 'ff' ? '00' : 'ff')
    const tampered = { ...env, content: { ...env.content, ciphertext: flipped } }
    expect(() => decryptEnvelopeCode(tampered, symKey)).toThrow()
  })

  it('binds the governing terms-version hash as AAD (parity with recipient-keyed)', () => {
    const { symKey } = deriveFromCode('river amber tiger kite')
    const tv = { id: 'v1', hash: '0x' + 'ab'.repeat(32) }
    const env = encryptEnvelopeCode({ a: 1 }, symKey, tv)
    expect(env.termsVersion.hash).toBe(tv.hash)
    // Tampering with the bound hash fails authentication.
    const tampered = { ...env, termsVersion: { id: 'v1', hash: '0x' + 'cd'.repeat(32) } }
    expect(() => decryptEnvelopeCode(tampered, symKey)).toThrow()
  })
})
