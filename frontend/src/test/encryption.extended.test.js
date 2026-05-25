import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock tweetnacl - vi.mock factories are hoisted, so we cannot reference
// external variables. Use vi.hoisted to create the mocks before hoisting.
const { mockBox, mockBoxOpen } = vi.hoisted(() => {
  const mockBox = vi.fn((_msg, _nonce, _pk, _sk) => new Uint8Array([99, 99]))
  const mockBoxOpen = vi.fn((_ciphertext, _nonce, _pk, _sk) => {
    return new TextEncoder().encode('{"text":"hello"}')
  })
  return { mockBox, mockBoxOpen }
})

vi.mock('tweetnacl', () => ({
  default: {
    box: Object.assign(mockBox, {
      keyPair: {
        fromSecretKey: vi.fn((seed) => ({
          publicKey: new Uint8Array(32).fill(0xAA),
          secretKey: seed,
        })),
      },
      nonceLength: 24,
      open: mockBoxOpen,
    }),
    randomBytes: vi.fn((n) => new Uint8Array(n).fill(0x42)),
  },
}))

vi.mock('tweetnacl-util', () => ({
  encodeBase64: vi.fn((bytes) => 'bW9jaw=='),
  decodeBase64: vi.fn((str) => new Uint8Array([1, 2, 3])),
  encodeUTF8: vi.fn((bytes) => '{"text":"hello"}'),
  decodeUTF8: vi.fn((str) => new Uint8Array([1, 2, 3])),
}))

vi.mock('../utils/crypto/constants', () => ({
  KEY_DERIVATION_MESSAGE: 'Sign to derive encryption key',
  ENCRYPTION_ALGORITHM: 'x25519-xsalsa20-poly1305',
  CURRENT_ENCRYPTION_VERSION: '1.0',
}))

import {
  encryptMetadata,
  decryptMetadata,
  isEncryptedMetadata,
  canDecryptMetadata,
  publicKeyToHex,
  hexToPublicKey,
} from '../utils/encryption'

describe('encryption.js: encryptMetadata', () => {
  it('encrypts metadata and returns encrypted wrapper', () => {
    const metadata = { name: 'Test Market', description: 'Will it rain?' }
    const mySecretKey = new Uint8Array(32).fill(1)
    const theirPublicKey = new Uint8Array(32).fill(2)

    const result = encryptMetadata(metadata, mySecretKey, theirPublicKey)

    expect(result.encrypted).toBe(true)
    expect(result.version).toBe('1.0')
    expect(result.algorithm).toBe('x25519-xsalsa20-poly1305')
    expect(result.nonce).toBeTruthy()
    expect(result.ciphertext).toBeTruthy()
  })

  it('throws when nacl.box returns null', () => {
    mockBox.mockReturnValueOnce(null)

    const metadata = { name: 'Test' }
    const mySecretKey = new Uint8Array(32).fill(1)
    const theirPublicKey = new Uint8Array(32).fill(2)

    expect(() => encryptMetadata(metadata, mySecretKey, theirPublicKey))
      .toThrow('Encryption failed')
  })
})

describe('encryption.js: decryptMetadata', () => {
  it('decrypts valid encrypted data', () => {
    const encryptedData = {
      encrypted: true,
      algorithm: 'x25519-xsalsa20-poly1305',
      nonce: 'bW9jaw==',
      ciphertext: 'bW9jaw==',
    }
    const mySecretKey = new Uint8Array(32).fill(1)
    const theirPublicKey = new Uint8Array(32).fill(2)

    const result = decryptMetadata(encryptedData, mySecretKey, theirPublicKey)
    expect(result).toEqual({ text: 'hello' })
  })

  it('throws for non-encrypted data', () => {
    const data = { encrypted: false }
    expect(() => decryptMetadata(data, new Uint8Array(32), new Uint8Array(32)))
      .toThrow('Data is not encrypted')
  })

  it('throws for unsupported algorithm', () => {
    const data = {
      encrypted: true,
      algorithm: 'aes-256-gcm',
    }
    expect(() => decryptMetadata(data, new Uint8Array(32), new Uint8Array(32)))
      .toThrow('Unsupported algorithm: aes-256-gcm')
  })

  it('throws when decryption fails (box.open returns null)', () => {
    mockBoxOpen.mockReturnValueOnce(null)

    const data = {
      encrypted: true,
      algorithm: 'x25519-xsalsa20-poly1305',
      nonce: 'bW9jaw==',
      ciphertext: 'bW9jaw==',
    }
    expect(() => decryptMetadata(data, new Uint8Array(32), new Uint8Array(32)))
      .toThrow('Decryption failed')
  })
})

// derivePublicKeyFromSignature is not tested here because it calls
// ethers.recoverPublicKey which requires a valid ECDSA signature.
// It's covered by the crypto/envelopeEncryption integration tests.

describe('encryption.js: additional utility tests', () => {
  describe('isEncryptedMetadata edge cases', () => {
    it('returns false for undefined', () => {
      expect(isEncryptedMetadata(undefined)).toBe(false)
    })

    it('returns false when encrypted is not boolean true', () => {
      const meta = {
        encrypted: 'true', // string, not boolean
        algorithm: 'x25519-xsalsa20-poly1305',
        ciphertext: 'data',
      }
      expect(isEncryptedMetadata(meta)).toBe(false)
    })

    it('returns true with all required fields', () => {
      const meta = {
        encrypted: true,
        algorithm: 'x25519-xsalsa20-poly1305',
        ciphertext: 'some-data',
      }
      expect(isEncryptedMetadata(meta)).toBe(true)
    })
  })

  describe('canDecryptMetadata edge cases', () => {
    it('returns true for metadata without encrypted flag', () => {
      expect(canDecryptMetadata({ name: 'test' }, '0xabc')).toBe(true)
    })

    it('returns false for encrypted metadata with empty participants', () => {
      const meta = {
        encrypted: true,
        algorithm: 'x25519-xsalsa20-poly1305',
        ciphertext: 'data',
        participants: [],
      }
      expect(canDecryptMetadata(meta, '0xabc')).toBe(false)
    })

    it('returns falsy when participants is undefined', () => {
      const meta = {
        encrypted: true,
        algorithm: 'x25519-xsalsa20-poly1305',
        ciphertext: 'data',
      }
      // Returns undefined (falsy) since participants?.includes() is undefined
      expect(canDecryptMetadata(meta, '0xabc')).toBeFalsy()
    })
  })

  describe('publicKeyToHex / hexToPublicKey roundtrip', () => {
    it('roundtrips a key', () => {
      const original = new Uint8Array([0x01, 0x02, 0x03, 0xFF])
      const hex = publicKeyToHex(original)
      const restored = hexToPublicKey(hex)
      expect(restored.length).toBe(original.length)
      expect(Array.from(restored)).toEqual(Array.from(original))
    })
  })
})
