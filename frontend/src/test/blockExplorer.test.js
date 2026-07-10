import { describe, it, expect } from 'vitest'
import {
  getBlockscoutBaseUrl,
  getBlockscoutUrl,
  getAddressUrl,
  getTransactionUrl,
} from '../config/blockExplorer'

// Spec 048 (FR-016, honest-state) — explorer links resolve strictly per-chain from the
// networks.js single source of truth. The Ethereum family maps to Etherscan variants, and an
// unknown chain yields NO link instead of silently defaulting to another network's explorer
// (previously Polygon Amoy). Contract C5.

describe('block explorer per-chain scoping (spec 048)', () => {
  it('resolves the Ethereum family to their Etherscan explorers', () => {
    expect(getBlockscoutBaseUrl(1)).toBe('https://etherscan.io')
    expect(getBlockscoutBaseUrl(11155111)).toBe('https://sepolia.etherscan.io')
    expect(getBlockscoutBaseUrl(560048)).toBe('https://hoodi.etherscan.io')
  })

  it('builds address/tx links on the correct network and never leaks to polygonscan', () => {
    expect(getBlockscoutUrl(1, '0xabc', 'address')).toBe('https://etherscan.io/address/0xabc')
    expect(getBlockscoutUrl(1, '0xabc')).not.toContain('polygonscan')
    expect(getTransactionUrl(11155111, '0xdef')).toBe('https://sepolia.etherscan.io/tx/0xdef')
    expect(getAddressUrl(560048, '0x123')).toBe('https://hoodi.etherscan.io/address/0x123')
    expect(getBlockscoutUrl(560048, '0x123')).not.toContain('polygonscan')
  })

  it('leaves the existing chains unchanged', () => {
    expect(getBlockscoutBaseUrl(137)).toBe('https://polygonscan.com')
    expect(getBlockscoutBaseUrl(80002)).toBe('https://amoy.polygonscan.com')
    expect(getBlockscoutBaseUrl(61)).toBe('https://etc.blockscout.com')
    expect(getBlockscoutBaseUrl(63)).toBe('https://etc-mordor.blockscout.com')
  })

  it('yields NO link for an unknown chain instead of defaulting to Amoy (FR-016)', () => {
    expect(getBlockscoutBaseUrl(999999)).toBe('')
    expect(getBlockscoutUrl(999999, '0xabc')).toBe('')
    expect(getAddressUrl(999999, '0xabc')).toBe('')
    // regression guard: the removed silent default was Polygon Amoy
    expect(getBlockscoutBaseUrl(999999)).not.toContain('amoy')
  })
})
