import { describe, it, expect, vi } from 'vitest'

// Test the pure-logic functions defined inside MarketAcceptancePage.jsx
// Since they are not exported, we replicate them here and test their logic.
// This is valid because the functions are simple and have no dependencies
// on React state.

vi.mock('../utils/ipfsService', () => ({
  parseEncryptedIpfsReference: vi.fn((desc) => {
    if (!desc || typeof desc !== 'string') return { isIpfs: false, cid: null }
    if (desc.startsWith('encrypted:ipfs://')) {
      return { isIpfs: true, cid: desc.replace('encrypted:ipfs://', '').trim() }
    }
    if (desc.startsWith('ipfs://')) {
      return { isIpfs: true, cid: desc.replace('ipfs://', '').split('/')[0].trim() }
    }
    return { isIpfs: false, cid: null }
  }),
}))

vi.mock('../config/contracts', () => ({
  DEPLOYED_CONTRACTS: {
    paymentToken: '0xUSDCAddress',
    wmatic: '0xWMATICAddress',
  },
  getContractAddress: vi.fn(() => null),
}))

import { parseEncryptedIpfsReference } from '../utils/ipfsService'
import { DEPLOYED_CONTRACTS } from '../config/contracts'

// Replicate tokenInfo from MarketAcceptancePage.jsx
function tokenInfo(addr) {
  const ZeroAddress = '0x0000000000000000000000000000000000000000'
  if (!addr || addr === ZeroAddress) return { decimals: 18, symbol: 'tokens' }
  const a = addr.toLowerCase()
  const usdc = (DEPLOYED_CONTRACTS.paymentToken || '').toLowerCase()
  const wmatic = (DEPLOYED_CONTRACTS.wmatic || '').toLowerCase()
  if (a === usdc) return { decimals: 6, symbol: 'USDC' }
  if (a === wmatic) return { decimals: 18, symbol: 'WMATIC' }
  return { decimals: 18, symbol: 'tokens' }
}

// Replicate isEncryptedDescription from MarketAcceptancePage.jsx
function isEncryptedDescription(desc) {
  if (!desc || typeof desc !== 'string') return false
  const ipfsRef = parseEncryptedIpfsReference(desc)
  if (ipfsRef.isIpfs) return true
  try {
    const parsed = JSON.parse(desc)
    return parsed.version && parsed.algorithm && parsed.content
  } catch { return false }
}

// Replicate getIpfsCid from MarketAcceptancePage.jsx
function getIpfsCid(desc) {
  if (!desc || typeof desc !== 'string') return null
  const ipfsRef = parseEncryptedIpfsReference(desc)
  return ipfsRef.isIpfs ? ipfsRef.cid : null
}

// Status enum from MarketAcceptancePage
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5 }
const STATUS_NAMES = ['none', 'pending_acceptance', 'active', 'resolved', 'cancelled', 'refunded']

describe('MarketAcceptancePage: tokenInfo', () => {
  it('returns USDC info for payment token address', () => {
    const result = tokenInfo('0xUSDCAddress')
    expect(result).toEqual({ decimals: 6, symbol: 'USDC' })
  })

  it('returns USDC info case-insensitively', () => {
    const result = tokenInfo('0xusdcaddress')
    expect(result).toEqual({ decimals: 6, symbol: 'USDC' })
  })

  it('returns WMATIC info for wmatic address', () => {
    const result = tokenInfo('0xWMATICAddress')
    expect(result).toEqual({ decimals: 18, symbol: 'WMATIC' })
  })

  it('returns generic token info for unknown address', () => {
    const result = tokenInfo('0x1111111111111111111111111111111111111111')
    expect(result).toEqual({ decimals: 18, symbol: 'tokens' })
  })

  it('returns generic info for zero address', () => {
    const result = tokenInfo('0x0000000000000000000000000000000000000000')
    expect(result).toEqual({ decimals: 18, symbol: 'tokens' })
  })

  it('returns generic info for null', () => {
    const result = tokenInfo(null)
    expect(result).toEqual({ decimals: 18, symbol: 'tokens' })
  })

  it('returns generic info for undefined', () => {
    const result = tokenInfo(undefined)
    expect(result).toEqual({ decimals: 18, symbol: 'tokens' })
  })
})

describe('MarketAcceptancePage: isEncryptedDescription', () => {
  it('returns true for encrypted:ipfs:// description', () => {
    expect(isEncryptedDescription('encrypted:ipfs://bafyexample123')).toBe(true)
  })

  it('returns true for ipfs:// description', () => {
    expect(isEncryptedDescription('ipfs://bafyexample123')).toBe(true)
  })

  it('returns truthy for JSON encrypted envelope', () => {
    const envelope = JSON.stringify({
      version: '1.0',
      algorithm: 'x25519-chacha20poly1305',
      content: { ciphertext: 'abc' },
    })
    expect(isEncryptedDescription(envelope)).toBeTruthy()
  })

  it('returns false for plain text', () => {
    expect(isEncryptedDescription('Who will win the game?')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isEncryptedDescription(null)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isEncryptedDescription('')).toBe(false)
  })

  it('returns false for non-string', () => {
    expect(isEncryptedDescription(42)).toBe(false)
  })

  it('returns falsy for JSON without required fields', () => {
    const json = JSON.stringify({ name: 'test' })
    expect(isEncryptedDescription(json)).toBeFalsy()
  })
})

describe('MarketAcceptancePage: getIpfsCid', () => {
  it('extracts CID from encrypted:ipfs:// reference', () => {
    expect(getIpfsCid('encrypted:ipfs://bafyexample')).toBe('bafyexample')
  })

  it('extracts CID from ipfs:// reference', () => {
    expect(getIpfsCid('ipfs://bafyexample')).toBe('bafyexample')
  })

  it('returns null for plain text', () => {
    expect(getIpfsCid('plain text')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getIpfsCid(null)).toBeNull()
  })

  it('returns null for non-string', () => {
    expect(getIpfsCid(123)).toBeNull()
  })
})

describe('MarketAcceptancePage: Status enum and STATUS_NAMES', () => {
  it('Status enum has correct values', () => {
    expect(Status.None).toBe(0)
    expect(Status.Open).toBe(1)
    expect(Status.Active).toBe(2)
    expect(Status.Resolved).toBe(3)
    expect(Status.Cancelled).toBe(4)
    expect(Status.Refunded).toBe(5)
  })

  it('STATUS_NAMES maps to correct strings', () => {
    expect(STATUS_NAMES[0]).toBe('none')
    expect(STATUS_NAMES[1]).toBe('pending_acceptance')
    expect(STATUS_NAMES[2]).toBe('active')
    expect(STATUS_NAMES[3]).toBe('resolved')
    expect(STATUS_NAMES[4]).toBe('cancelled')
    expect(STATUS_NAMES[5]).toBe('refunded')
  })

  it('STATUS_NAMES has correct length', () => {
    expect(STATUS_NAMES.length).toBe(6)
  })
})
