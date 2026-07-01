import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import { payoutMatrixHash, payoutMatrixSum, serializeMatrix, parseMatrix } from '../lib/pools/payout'

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
})
