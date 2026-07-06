// Spec 043 (US2) — hub client integrity + payload fallback. The security property is that a proposal read
// from the hub is only trusted if its recomputed hash matches the emitted one; a tampered preimage is rejected.

import { describe, it, expect } from 'vitest'
import {
  reconstructProposal,
  verifyProposal,
  encodePayloadLink,
  parsePayloadLink,
} from '../../lib/custody/proposalHub'
import { buildSafeTx, computeSafeTxHash } from '../../lib/custody/vaultTransaction'

const SAFE = '0x1111111111111111111111111111111111111111'
const PROPOSER = '0x2222222222222222222222222222222222222222'
const TO = '0x3333333333333333333333333333333333333333'
const CHAIN = 63

function proposedArgs(overridesHash) {
  const safeTx = buildSafeTx({ to: TO, value: 1000n, nonce: 5 })
  const safeTxHash = overridesHash ?? computeSafeTxHash(SAFE, CHAIN, safeTx)
  return {
    safe: SAFE,
    proposer: PROPOSER,
    safeTxHash,
    to: safeTx.to,
    value: safeTx.value,
    data: safeTx.data,
    operation: safeTx.operation,
    nonce: safeTx.nonce,
  }
}

describe('reconstructProposal + verifyProposal', () => {
  it('verifies a proposal whose emitted hash matches its parameters', () => {
    const p = reconstructProposal(proposedArgs())
    expect(verifyProposal(p, CHAIN)).toBe(true)
  })

  it('rejects a proposal whose emitted hash does not match (tampered preimage)', () => {
    const bad = reconstructProposal(proposedArgs('0x' + 'de'.repeat(32)))
    expect(verifyProposal(bad, CHAIN)).toBe(false)
  })

  it('rejects a correct hash checked against the wrong chain', () => {
    const p = reconstructProposal(proposedArgs())
    expect(verifyProposal(p, 137)).toBe(false) // hash is chain-scoped
  })
})

describe('payload link fallback', () => {
  it('round-trips a SafeTx and preserves the verifiable hash', () => {
    const safeTx = buildSafeTx({ to: TO, value: 4200n, data: '0xabcd', nonce: 7 })
    const link = encodePayloadLink(SAFE, safeTx, CHAIN)
    expect(typeof link).toBe('string')
    const parsed = parsePayloadLink(link)
    expect(parsed.safe).toBe(SAFE)
    expect(parsed.chainId).toBe(CHAIN)
    // The reconstructed tx must produce the same hash the proposer would have signed.
    expect(computeSafeTxHash(parsed.safe, parsed.chainId, parsed.safeTx)).toBe(
      computeSafeTxHash(SAFE, CHAIN, safeTx),
    )
  })

  it('round-trips across data lengths that exercise base64 padding', () => {
    // Vary calldata length so the encoded payload lands on each of the 4 base64 padding remainders.
    for (let n = 0; n < 6; n += 1) {
      const safeTx = buildSafeTx({ to: TO, value: BigInt(n), data: '0x' + 'ab'.repeat(n), nonce: n })
      const parsed = parsePayloadLink(encodePayloadLink(SAFE, safeTx, CHAIN))
      expect(computeSafeTxHash(parsed.safe, parsed.chainId, parsed.safeTx)).toBe(
        computeSafeTxHash(SAFE, CHAIN, safeTx),
      )
    }
  })

  it('rejects an unrecognized payload', () => {
    const bad = Buffer.from(JSON.stringify({ schema: 'nope' }), 'utf8').toString('base64')
    expect(() => parsePayloadLink(bad)).toThrow(/Unrecognized/)
  })
})
