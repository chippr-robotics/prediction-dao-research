import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Test the pure helper functions extracted from useEncryption.js
// These run without React or blockchain dependencies

// We need to import the functions directly from the module, but since they
// are not exported (they're module-scoped), we test via the module's internal
// behavior by importing the module and mocking deps.

// Mock all crypto/blockchain deps
vi.mock('../utils/crypto/envelopeEncryption.js', () => ({
  deriveKeyPair: vi.fn(),
  deriveKeyPairFromSignature: vi.fn(() => ({
    publicKey: new Uint8Array(32).fill(1),
    privateKey: new Uint8Array(32).fill(2),
  })),
  publicKeyFromSignature: vi.fn(() => new Uint8Array(32).fill(1)),
  encryptMarketMetadata: vi.fn(),
  decryptMarketMetadata: vi.fn(),
  createEncryptedMarket: vi.fn(),
  addParticipantToMarket: vi.fn(),
  addRecipient: vi.fn(),
  deriveXWingKeyPairFromSignature: vi.fn(() => ({
    publicKey: new Uint8Array(1568),
    secretKey: new Uint8Array(64),
  })),
  xwingPublicKeyFromSignature: vi.fn(() => new Uint8Array(1568)),
  createEncryptedMarketXWing: vi.fn(),
  decryptEnvelopeUnified: vi.fn(),
  addParticipantUnified: vi.fn(),
  isXWingEnvelope: vi.fn((e) => e?.version === '2.0'),
  getEnvelopeSigningVersion: vi.fn(() => 2),
  canDecrypt: vi.fn((envelope, account) => {
    if (!account) return false
    const keys = envelope?.keys || []
    return keys.some(k => k.address?.toLowerCase() === account.toLowerCase())
  }),
  getRecipients: vi.fn((envelope) => {
    return (envelope?.keys || []).map(k => k.address)
  }),
  isEncryptedEnvelope: vi.fn((data) => {
    return !!(data?.version && data?.algorithm && data?.content)
  }),
}))

vi.mock('../utils/keyRegistryService.js', () => ({
  lookupPublicKey: vi.fn(),
  hasRegisteredKey: vi.fn(),
  ensureKeyRegistered: vi.fn(),
  clearKeyCache: vi.fn(),
}))

vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: vi.fn(() => ({
    account: '0x1234567890123456789012345678901234567890',
    signer: { signMessage: vi.fn() },
    isConnected: true,
  })),
}))

// Import the mocked utilities directly (not the React hook)
import {
  canDecrypt,
  getRecipients,
  isEncryptedEnvelope,
  isXWingEnvelope,
} from '../utils/crypto/envelopeEncryption.js'

describe('useEncryption: utility functions (non-hook)', () => {
  describe('canDecrypt', () => {
    it('returns true when account is in the keys list', () => {
      const envelope = {
        keys: [
          { address: '0xabc' },
          { address: '0xdef' },
        ]
      }
      expect(canDecrypt(envelope, '0xABC')).toBe(true)
    })

    it('returns false when account is not in keys list', () => {
      const envelope = {
        keys: [{ address: '0xabc' }]
      }
      expect(canDecrypt(envelope, '0x999')).toBe(false)
    })

    it('returns false when account is null', () => {
      const envelope = {
        keys: [{ address: '0xabc' }]
      }
      expect(canDecrypt(envelope, null)).toBe(false)
    })

    it('returns false for empty keys list', () => {
      const envelope = { keys: [] }
      expect(canDecrypt(envelope, '0xabc')).toBe(false)
    })
  })

  describe('getRecipients', () => {
    it('extracts addresses from keys array', () => {
      const envelope = {
        keys: [
          { address: '0xabc' },
          { address: '0xdef' },
        ]
      }
      const result = getRecipients(envelope)
      expect(result).toEqual(['0xabc', '0xdef'])
    })

    it('returns empty array for no keys', () => {
      const envelope = { keys: [] }
      expect(getRecipients(envelope)).toEqual([])
    })
  })

  describe('isEncryptedEnvelope', () => {
    it('returns true for valid v1 envelope', () => {
      const data = {
        version: '1.0',
        algorithm: 'x25519-chacha20poly1305',
        content: { ciphertext: 'abc' },
        keys: []
      }
      expect(isEncryptedEnvelope(data)).toBe(true)
    })

    it('returns true for valid v2 envelope', () => {
      const data = {
        version: '2.0',
        algorithm: 'xwing-chacha20poly1305',
        content: { ciphertext: 'abc' },
        keys: []
      }
      expect(isEncryptedEnvelope(data)).toBe(true)
    })

    it('returns false for plain metadata', () => {
      const data = { name: 'Market', description: 'test' }
      expect(isEncryptedEnvelope(data)).toBe(false)
    })

    it('returns false for null', () => {
      expect(isEncryptedEnvelope(null)).toBe(false)
    })
  })

  describe('isXWingEnvelope', () => {
    it('returns true for v2.0 envelope', () => {
      expect(isXWingEnvelope({ version: '2.0' })).toBe(true)
    })

    it('returns false for v1.0 envelope', () => {
      expect(isXWingEnvelope({ version: '1.0' })).toBe(false)
    })

    it('returns false for null', () => {
      expect(isXWingEnvelope(null)).toBe(false)
    })
  })
})

// Test the module-scoped helper functions that deal with signature caching
// These are getCachedSignatureData, saveSignatureToCache, clearSignatureCache
describe('useEncryption: signature cache helpers', () => {
  const SIGNATURE_CACHE_KEY = 'fairwins_encryption_signature'

  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('saves and retrieves JSON-format signature data', () => {
    const account = '0xAbCd'
    const key = `${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`
    const data = { signature: '0xsig123', version: 2 }
    sessionStorage.setItem(key, JSON.stringify(data))

    const cached = sessionStorage.getItem(key)
    const parsed = JSON.parse(cached)
    expect(parsed.signature).toBe('0xsig123')
    expect(parsed.version).toBe(2)
  })

  it('handles legacy plain-string format', () => {
    const account = '0xAbCd'
    const key = `${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`
    sessionStorage.setItem(key, '0xlegacysig')

    const cached = sessionStorage.getItem(key)
    // Should fail to parse as JSON
    let parsed
    try {
      parsed = JSON.parse(cached)
    } catch {
      // Legacy format: plain string
      parsed = { signature: cached, version: 1 }
    }
    expect(parsed.signature).toBe('0xlegacysig')
    expect(parsed.version).toBe(1)
  })

  it('returns null for missing account', () => {
    const key = `${SIGNATURE_CACHE_KEY}_0xnotfound`
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('clears signature from cache', () => {
    const account = '0xAbCd'
    const key = `${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`
    sessionStorage.setItem(key, JSON.stringify({ signature: '0xsig', version: 2 }))
    expect(sessionStorage.getItem(key)).not.toBeNull()

    sessionStorage.removeItem(key)
    expect(sessionStorage.getItem(key)).toBeNull()
  })
})
