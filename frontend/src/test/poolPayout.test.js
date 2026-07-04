import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import {
  payoutMatrixHash, payoutMatrixSum, serializeMatrix, parseMatrix,
  serializeSharedProposal, parseSharedProposal, payoutDisplayMap,
} from '../lib/pools/payout'

// Payout-matrix helpers (spec 034, address-based): each row is { winner: address, amount }, and the hash
// must equal the contract's keccak256(abi.encode(PayoutEntry[])) over tuple(address winner,uint256 amount)[].

describe('pool payout matrix', () => {
  const W1 = '0x00000000000000000000000000000000000000aa'
  const W2 = '0x00000000000000000000000000000000000000bb'
  const entries = [
    { winner: W1, amount: ethers.parseUnits('10', 6) },
    { winner: W2, amount: ethers.parseUnits('10', 6) },
  ]

  it('hashes identically to abi.encode(tuple(address winner,uint256 amount)[])', () => {
    const coder = ethers.AbiCoder.defaultAbiCoder()
    const expected = ethers.keccak256(
      coder.encode(['tuple(address winner,uint256 amount)[]'], [entries])
    )
    expect(payoutMatrixHash(entries)).toBe(expected)
  })

  it('sums amounts', () => {
    expect(payoutMatrixSum(entries)).toBe(ethers.parseUnits('20', 6))
  })

  it('round-trips serialize/parse (checksummed winners) and rejects malformed input', () => {
    const s = serializeMatrix(entries)
    const parsed = parseMatrix(s)
    expect(parsed).toEqual([
      { winner: ethers.getAddress(W1), amount: String(ethers.parseUnits('10', 6)) },
      { winner: ethers.getAddress(W2), amount: String(ethers.parseUnits('10', 6)) },
    ])
    expect(parseMatrix('not json')).toBeNull()
    expect(parseMatrix('{"a":1}')).toBeNull()
  })

  it('shared proposal round-trips the matrix, and accepts legacy bare arrays', () => {
    const text = serializeSharedProposal({ entries })
    const parsed = parseSharedProposal(text)
    expect(payoutMatrixHash(parsed.entries)).toBe(payoutMatrixHash(entries))
    // Bare-array shares still parse.
    const legacy = parseSharedProposal(serializeMatrix(entries))
    expect(payoutMatrixHash(legacy.entries)).toBe(payoutMatrixHash(entries))
    expect(parseSharedProposal('nope')).toBeNull()
  })

  it('builds a lowercased-winner-address → amount map from a verified matrix', () => {
    const map = payoutDisplayMap(entries)
    expect(map.get(W1.toLowerCase())).toBe(ethers.parseUnits('10', 6))
    expect(map.get(W2.toLowerCase())).toBe(ethers.parseUnits('10', 6))
    expect(payoutDisplayMap(null)).toBeNull()
    expect(payoutDisplayMap([])).toBeNull()
  })
})
