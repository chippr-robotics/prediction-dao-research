import { describe, it, expect } from 'vitest'
import {
  CURRENT_ENCRYPTION_VERSION,
  SIGNING_MESSAGES,
  MARKET_SIGNING_MESSAGES,
  getSigningMessage,
  getMarketSigningMessage,
  getCurrentSigningMessage,
  getCurrentMarketSigningMessage,
  isVersionSupported,
  getSupportedVersions,
  KEY_DERIVATION_MESSAGE,
  MARKET_ENCRYPTION_MESSAGE,
  ENVELOPE_INFO,
  ENCRYPTION_ALGORITHM
} from '../../utils/crypto/constants'

describe('crypto/constants - Versioned Signing System', () => {
  describe('Version Constants', () => {
    it('CURRENT_ENCRYPTION_VERSION should be 2', () => {
      expect(CURRENT_ENCRYPTION_VERSION).toBe(2)
    })

    it('SIGNING_MESSAGES should have versions 1 and 2', () => {
      expect(SIGNING_MESSAGES).toHaveProperty('1')
      expect(SIGNING_MESSAGES).toHaveProperty('2')
      expect(Object.keys(SIGNING_MESSAGES)).toHaveLength(2)
    })

    it('MARKET_SIGNING_MESSAGES should have versions 1 and 2', () => {
      expect(MARKET_SIGNING_MESSAGES).toHaveProperty('1')
      expect(MARKET_SIGNING_MESSAGES).toHaveProperty('2')
      expect(Object.keys(MARKET_SIGNING_MESSAGES)).toHaveLength(2)
    })

    it('ENVELOPE_INFO should be defined', () => {
      expect(ENVELOPE_INFO).toBe('FairWins_Envelope_v1')
    })

    it('ENCRYPTION_ALGORITHM should be defined', () => {
      expect(ENCRYPTION_ALGORITHM).toBe('x25519-xsalsa20-poly1305')
    })
  })

  describe('getSigningMessage', () => {
    it('should return v1 message for version 1', () => {
      const message = getSigningMessage(1)
      expect(message).toBe('FairWins Encryption Key v1')
    })

    it('should return v2 message with terms for version 2', () => {
      const message = getSigningMessage(2)
      expect(message).toContain('FairWins Terms & Key Authorization v2')
      expect(message).toContain('TERMS OF SERVICE')
      expect(message).toContain('AUTOMATED SYSTEM')
      expect(message).toContain('BINDING AGREEMENT')
      expect(message).toContain('JURISDICTIONAL COMPLIANCE')
      expect(message).toContain('NO LEGAL ADVICE')
      expect(message).toContain('NOT GAMBLING PROMOTION')
      expect(message).toContain('RISK ACKNOWLEDGMENT')
    })

    it('should throw error for unknown version', () => {
      expect(() => getSigningMessage(99)).toThrow('Unknown encryption version: 99')
      expect(() => getSigningMessage(0)).toThrow('Unknown encryption version: 0')
      expect(() => getSigningMessage(-1)).toThrow('Unknown encryption version: -1')
    })

    it('should include supported versions in error message', () => {
      try {
        getSigningMessage(99)
      } catch (e) {
        expect(e.message).toContain('Supported versions:')
        expect(e.message).toContain('1')
        expect(e.message).toContain('2')
      }
    })
  })

  describe('getMarketSigningMessage', () => {
    it('should return v1 market message for version 1', () => {
      const message = getMarketSigningMessage(1)
      expect(message).toBe('FairWins Market Encryption v1')
    })

    it('should return v2 market message with terms for version 2', () => {
      const message = getMarketSigningMessage(2)
      expect(message).toContain('FairWins Market Encryption Terms v2')
      expect(message).toContain('authorize encryption keys')
      expect(message).toContain('automated smart contract system')
    })

    it('should throw error for unknown version', () => {
      expect(() => getMarketSigningMessage(99)).toThrow('Unknown market encryption version: 99')
      expect(() => getMarketSigningMessage(0)).toThrow('Unknown market encryption version: 0')
    })
  })

  describe('getCurrentSigningMessage', () => {
    it('should return the message for CURRENT_ENCRYPTION_VERSION', () => {
      const currentMessage = getCurrentSigningMessage()
      const v2Message = getSigningMessage(CURRENT_ENCRYPTION_VERSION)
      expect(currentMessage).toBe(v2Message)
    })

    it('should return v2 message since current version is 2', () => {
      const message = getCurrentSigningMessage()
      expect(message).toContain('FairWins Terms & Key Authorization v2')
    })
  })

  describe('getCurrentMarketSigningMessage', () => {
    it('should return the market message for CURRENT_ENCRYPTION_VERSION', () => {
      const currentMessage = getCurrentMarketSigningMessage()
      const v2Message = getMarketSigningMessage(CURRENT_ENCRYPTION_VERSION)
      expect(currentMessage).toBe(v2Message)
    })

    it('should return v2 market message since current version is 2', () => {
      const message = getCurrentMarketSigningMessage()
      expect(message).toContain('FairWins Market Encryption Terms v2')
    })
  })

  describe('isVersionSupported', () => {
    it('should return true for version 1', () => {
      expect(isVersionSupported(1)).toBe(true)
    })

    it('should return true for version 2', () => {
      expect(isVersionSupported(2)).toBe(true)
    })

    it('should return false for unsupported versions', () => {
      expect(isVersionSupported(0)).toBe(false)
      expect(isVersionSupported(3)).toBe(false)
      expect(isVersionSupported(99)).toBe(false)
      expect(isVersionSupported(-1)).toBe(false)
    })
  })

  describe('getSupportedVersions', () => {
    it('should return [1, 2] sorted', () => {
      const versions = getSupportedVersions()
      expect(versions).toEqual([1, 2])
    })

    it('should return numbers, not strings', () => {
      const versions = getSupportedVersions()
      versions.forEach(v => {
        expect(typeof v).toBe('number')
      })
    })

    it('should return all versions from SIGNING_MESSAGES', () => {
      const versions = getSupportedVersions()
      const messageVersions = Object.keys(SIGNING_MESSAGES).map(Number).sort((a, b) => a - b)
      expect(versions).toEqual(messageVersions)
    })
  })

  describe('Legacy Exports (Backward Compatibility)', () => {
    it('KEY_DERIVATION_MESSAGE should equal current version signing message', () => {
      expect(KEY_DERIVATION_MESSAGE).toBe(SIGNING_MESSAGES[CURRENT_ENCRYPTION_VERSION])
    })

    it('MARKET_ENCRYPTION_MESSAGE should equal current version market signing message', () => {
      expect(MARKET_ENCRYPTION_MESSAGE).toBe(MARKET_SIGNING_MESSAGES[CURRENT_ENCRYPTION_VERSION])
    })

    it('KEY_DERIVATION_MESSAGE should be v2 message', () => {
      expect(KEY_DERIVATION_MESSAGE).toContain('FairWins Terms & Key Authorization v2')
    })

    it('MARKET_ENCRYPTION_MESSAGE should be v2 market message', () => {
      expect(MARKET_ENCRYPTION_MESSAGE).toContain('FairWins Market Encryption Terms v2')
    })
  })

  describe('Version Immutability', () => {
    it('v1 signing message should remain unchanged for backward compatibility', () => {
      // This is critical - v1 message must never change or old encrypted data becomes unreadable
      expect(SIGNING_MESSAGES[1]).toBe('FairWins Encryption Key v1')
    })

    it('v1 market signing message should remain unchanged for backward compatibility', () => {
      expect(MARKET_SIGNING_MESSAGES[1]).toBe('FairWins Market Encryption v1')
    })
  })
})
