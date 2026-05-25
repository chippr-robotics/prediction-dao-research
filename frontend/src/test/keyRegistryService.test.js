import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: vi.fn(),
    },
  }
})

vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => null),
}))

vi.mock('../abis/KeyRegistry', () => ({
  KEY_REGISTRY_ABI: [],
}))

import {
  hexToBytes,
  bytesToHex,
  clearKeyCache,
  lookupPublicKey,
  hasRegisteredKey,
  ensureKeyRegistered,
  registerEncryptionKey,
} from '../utils/keyRegistryService'

describe('keyRegistryService: hexToBytes', () => {
  it('converts hex string without 0x prefix', () => {
    const result = hexToBytes('aabb')
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBe(2)
    expect(result[0]).toBe(0xaa)
    expect(result[1]).toBe(0xbb)
  })

  it('converts hex string with 0x prefix', () => {
    const result = hexToBytes('0xaabbcc')
    expect(result.length).toBe(3)
    expect(result[0]).toBe(0xaa)
    expect(result[1]).toBe(0xbb)
    expect(result[2]).toBe(0xcc)
  })

  it('handles empty hex string', () => {
    const result = hexToBytes('')
    expect(result.length).toBe(0)
  })

  it('handles 0x only', () => {
    const result = hexToBytes('0x')
    expect(result.length).toBe(0)
  })

  it('converts 32-byte key hex', () => {
    const hex = 'ff'.repeat(32)
    const result = hexToBytes(hex)
    expect(result.length).toBe(32)
    expect(result.every(b => b === 0xff)).toBe(true)
  })
})

describe('keyRegistryService: bytesToHex', () => {
  it('converts Uint8Array to hex string', () => {
    const bytes = new Uint8Array([0xaa, 0xbb, 0xcc])
    expect(bytesToHex(bytes)).toBe('aabbcc')
  })

  it('pads single-digit bytes correctly', () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x0a])
    expect(bytesToHex(bytes)).toBe('01020a')
  })

  it('handles empty array', () => {
    expect(bytesToHex(new Uint8Array([]))).toBe('')
  })

  it('roundtrips with hexToBytes', () => {
    const original = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0])
    const hex = bytesToHex(original)
    const result = hexToBytes(hex)
    expect(Array.from(result)).toEqual(Array.from(original))
  })
})

describe('keyRegistryService: clearKeyCache', () => {
  it('clears specific address from cache', () => {
    // Doesn't throw
    expect(() => clearKeyCache('0x1234')).not.toThrow()
  })

  it('clears all cache', () => {
    expect(() => clearKeyCache()).not.toThrow()
  })

  it('handles null address', () => {
    expect(() => clearKeyCache(null)).not.toThrow()
  })
})

describe('keyRegistryService: lookupPublicKey', () => {
  it('returns null for null address', async () => {
    expect(await lookupPublicKey(null, {})).toBeNull()
  })

  it('returns null for null provider', async () => {
    expect(await lookupPublicKey('0x1234', null)).toBeNull()
  })
})

describe('keyRegistryService: hasRegisteredKey', () => {
  it('returns false for null address', async () => {
    expect(await hasRegisteredKey(null, {})).toBe(false)
  })

  it('returns false for null provider', async () => {
    expect(await hasRegisteredKey('0x1234', null)).toBe(false)
  })
})

describe('keyRegistryService: ensureKeyRegistered', () => {
  it('returns false when signer is null', async () => {
    expect(await ensureKeyRegistered(null, '0xabc', new Uint8Array(32))).toBe(false)
  })

  it('returns false when account is null', async () => {
    expect(await ensureKeyRegistered({}, null, new Uint8Array(32))).toBe(false)
  })

  it('returns false when publicKeyBytes is null', async () => {
    expect(await ensureKeyRegistered({}, '0xabc', null)).toBe(false)
  })
})

describe('keyRegistryService: registerEncryptionKey', () => {
  it('throws when signer is null', async () => {
    await expect(registerEncryptionKey(null, new Uint8Array(32)))
      .rejects.toThrow('Wallet not connected')
  })

  it('throws for invalid public key length', async () => {
    await expect(registerEncryptionKey({}, new Uint8Array(16)))
      .rejects.toThrow('Invalid public key: must be 32 bytes')
  })

  it('throws for null public key', async () => {
    await expect(registerEncryptionKey({}, null))
      .rejects.toThrow('Invalid public key')
  })
})
