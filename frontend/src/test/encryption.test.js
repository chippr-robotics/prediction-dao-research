import { describe, it, expect, vi } from 'vitest'

// Mock tweetnacl
vi.mock('tweetnacl', () => ({
  default: {
    box: {
      keyPair: {
        fromSecretKey: vi.fn((seed) => ({
          publicKey: new Uint8Array(32).fill(0xAA),
          secretKey: seed,
        })),
      },
      nonceLength: 24,
      open: vi.fn((ciphertext, nonce, theirPk, mySk) => {
        // Return mock decrypted data
        return new Uint8Array([123, 34, 116, 101, 120, 116, 34, 58, 34, 104, 105, 34, 125]) // {"text":"hi"}
      }),
    },
    randomBytes: vi.fn((n) => new Uint8Array(n).fill(0x42)),
  },
}))

// Mock tweetnacl-util
vi.mock('tweetnacl-util', () => ({
  encodeBase64: vi.fn((bytes) => 'bW9jaw=='),
  decodeBase64: vi.fn((str) => new Uint8Array([1, 2, 3])),
  encodeUTF8: vi.fn((bytes) => '{"text":"hi"}'),
  decodeUTF8: vi.fn((str) => new Uint8Array([1, 2, 3])),
}))

vi.mock('../utils/crypto/constants', () => ({
  KEY_DERIVATION_MESSAGE: 'Sign to derive encryption key',
  ENCRYPTION_ALGORITHM: 'x25519-xsalsa20-poly1305',
  CURRENT_ENCRYPTION_VERSION: '1.0',
}))

import {
  isEncryptedMetadata,
  canDecryptMetadata,
  publicKeyToHex,
  hexToPublicKey,
} from '../utils/encryption'

describe('encryption.js utility functions', () => {
  describe('isEncryptedMetadata', () => {
    it('should return true for encrypted metadata', () => {
      const meta = {
        encrypted: true,
        algorithm: 'x25519-xsalsa20-poly1305',
        ciphertext: 'encrypted-data',
      }
      expect(isEncryptedMetadata(meta)).toBe(true)
    })

    it('should return false for unencrypted metadata', () => {
      const meta = { title: 'Market', description: 'test' }
      expect(isEncryptedMetadata(meta)).toBe(false)
    })

    it('should return false for null', () => {
      expect(isEncryptedMetadata(null)).toBe(false)
    })

    it('should return false for wrong algorithm', () => {
      const meta = {
        encrypted: true,
        algorithm: 'aes-256-gcm',
        ciphertext: 'data',
      }
      expect(isEncryptedMetadata(meta)).toBe(false)
    })

    it('should return false when ciphertext is null', () => {
      const meta = {
        encrypted: true,
        algorithm: 'x25519-xsalsa20-poly1305',
        ciphertext: null,
      }
      expect(isEncryptedMetadata(meta)).toBe(false)
    })
  })

  describe('canDecryptMetadata', () => {
    it('should return true for non-encrypted metadata', () => {
      const meta = { title: 'Market' }
      expect(canDecryptMetadata(meta, '0x1234')).toBe(true)
    })

    it('should return true when user is a participant', () => {
      const meta = {
        encrypted: true,
        algorithm: 'x25519-xsalsa20-poly1305',
        ciphertext: 'data',
        participants: ['0xaaaa', '0xbbbb'],
      }
      expect(canDecryptMetadata(meta, '0xAAAA')).toBe(true)
    })

    it('should return false when user is not a participant', () => {
      const meta = {
        encrypted: true,
        algorithm: 'x25519-xsalsa20-poly1305',
        ciphertext: 'data',
        participants: ['0xaaaa', '0xbbbb'],
      }
      expect(canDecryptMetadata(meta, '0xcccc')).toBe(false)
    })

    it('should handle null address', () => {
      const meta = {
        encrypted: true,
        algorithm: 'x25519-xsalsa20-poly1305',
        ciphertext: 'data',
        participants: ['0xaaaa'],
      }
      expect(canDecryptMetadata(meta, null)).toBe(false)
    })
  })

  describe('publicKeyToHex', () => {
    it('should convert public key to hex string', () => {
      const pk = new Uint8Array([0xAA, 0xBB, 0xCC])
      const hex = publicKeyToHex(pk)
      expect(typeof hex).toBe('string')
      expect(hex.startsWith('0x')).toBe(true)
    })
  })

  describe('hexToPublicKey', () => {
    it('should convert hex string back to Uint8Array', () => {
      const pk = hexToPublicKey('0xaabbcc')
      expect(pk).toBeInstanceOf(Uint8Array)
      expect(pk.length).toBe(3)
    })
  })
})
