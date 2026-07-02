import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import {
  payoutMatrixHash, payoutMatrixSum, serializeMatrix, parseMatrix,
  serializeSharedProposal, parseSharedProposal, payoutDisplayMap,
} from '../lib/pools/payout'

// Payout-matrix helpers (spec 034): the hash must equal the contract's keccak256(abi.encode(PayoutEntry[])).

describe('pool payout matrix', () => {
  const entries = [
    { claimNullifier: 111n, amount: ethers.parseUnits('10', 6) },
    { claimNullifier: 222n, amount: ethers.parseUnits('10', 6) },
  ]

  it('hashes identically to abi.encode(tuple(uint256,uint256)[])', () => {
    const coder = ethers.AbiCoder.defaultAbiCoder()
    const expected = ethers.keccak256(
      coder.encode(['tuple(uint256 claimNullifier,uint256 amount)[]'], [entries])
    )
    expect(payoutMatrixHash(entries)).toBe(expected)
  })

  it('sums amounts', () => {
    expect(payoutMatrixSum(entries)).toBe(ethers.parseUnits('20', 6))
  })

  it('round-trips serialize/parse and rejects malformed input', () => {
    const s = serializeMatrix(entries)
    const parsed = parseMatrix(s)
    expect(parsed).toEqual([
      { claimNullifier: '111', amount: String(ethers.parseUnits('10', 6)) },
      { claimNullifier: '222', amount: String(ethers.parseUnits('10', 6)) },
    ])
    expect(parseMatrix('not json')).toBeNull()
    expect(parseMatrix('{"a":1}')).toBeNull()
  })

  it('shared proposal round-trips the matrix + display, and accepts legacy bare arrays', () => {
    const display = [
      { commitment: 10n, amount: ethers.parseUnits('10', 6) },
      { commitment: 11n, amount: ethers.parseUnits('10', 6) },
    ]
    const text = serializeSharedProposal({ entries, display })
    const parsed = parseSharedProposal(text)
    expect(payoutMatrixHash(parsed.entries)).toBe(payoutMatrixHash(entries))
    expect(parsed.display).toEqual([
      { commitment: '10', amount: String(ethers.parseUnits('10', 6)) },
      { commitment: '11', amount: String(ethers.parseUnits('10', 6)) },
    ])
    // Legacy bare-array shares still parse (display absent).
    const legacy = parseSharedProposal(serializeMatrix(entries))
    expect(payoutMatrixHash(legacy.entries)).toBe(payoutMatrixHash(entries))
    expect(legacy.display).toBeNull()
    expect(parseSharedProposal('nope')).toBeNull()
  })

  it('builds a commitment→amount map only when the display amounts match the matrix', () => {
    const good = [
      { commitment: '10', amount: String(ethers.parseUnits('10', 6)) },
      { commitment: '11', amount: String(ethers.parseUnits('10', 6)) },
    ]
    const map = payoutDisplayMap(entries, good)
    expect(map.get('10')).toBe(ethers.parseUnits('10', 6))
    // A tampered display total (30 ≠ 20 matrix) is rejected.
    const tampered = [
      { commitment: '10', amount: String(ethers.parseUnits('20', 6)) },
      { commitment: '11', amount: String(ethers.parseUnits('10', 6)) },
    ]
    expect(payoutDisplayMap(entries, tampered)).toBeNull()
    expect(payoutDisplayMap(entries, null)).toBeNull()
  })
})
