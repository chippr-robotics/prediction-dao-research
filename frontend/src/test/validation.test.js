import { describe, it, expect } from 'vitest'
import { isValidEthereumAddress, isValidRole, normalizeAddress } from '../utils/validation'

describe('validation utilities', () => {
  describe('isValidEthereumAddress', () => {
    it('should return true for valid Ethereum addresses', () => {
      expect(isValidEthereumAddress('0x1234567890123456789012345678901234567890')).toBe(true)
      expect(isValidEthereumAddress('0xAbCdEf1234567890123456789012345678901234')).toBe(true)
      expect(isValidEthereumAddress('0xABCDEF1234567890123456789012345678901234')).toBe(true)
    })

    it('should return false for invalid Ethereum addresses', () => {
      expect(isValidEthereumAddress('0x123')).toBe(false) // too short
      expect(isValidEthereumAddress('1234567890123456789012345678901234567890')).toBe(false) // missing 0x
      expect(isValidEthereumAddress('0x12345678901234567890123456789012345678901')).toBe(false) // too long
      expect(isValidEthereumAddress('0xGHIJKL1234567890123456789012345678901234')).toBe(false) // invalid characters
    })

    it('should return false for null or undefined', () => {
      expect(isValidEthereumAddress(null)).toBe(false)
      expect(isValidEthereumAddress(undefined)).toBe(false)
      expect(isValidEthereumAddress('')).toBe(false)
    })

    it('should return false for non-string values', () => {
      expect(isValidEthereumAddress(123)).toBe(false)
      expect(isValidEthereumAddress({})).toBe(false)
      expect(isValidEthereumAddress([])).toBe(false)
    })
  })

  describe('isValidRole', () => {
    const validRoles = {
      ADMIN: 'admin',
      USER: 'user',
      MODERATOR: 'moderator'
    }

    it('should return true for valid roles', () => {
      expect(isValidRole('admin', validRoles)).toBe(true)
      expect(isValidRole('user', validRoles)).toBe(true)
      expect(isValidRole('moderator', validRoles)).toBe(true)
    })

    it('should return false for invalid roles', () => {
      expect(isValidRole('invalid', validRoles)).toBe(false)
      expect(isValidRole('ADMIN', validRoles)).toBe(false) // case sensitive
      expect(isValidRole('superuser', validRoles)).toBe(false)
    })

    it('should return false for null or undefined role', () => {
      expect(isValidRole(null, validRoles)).toBe(false)
      expect(isValidRole(undefined, validRoles)).toBe(false)
      expect(isValidRole('', validRoles)).toBe(false)
    })

    it('should return false for null or undefined validRoles', () => {
      expect(isValidRole('admin', null)).toBe(false)
      expect(isValidRole('admin', undefined)).toBe(false)
    })

    it('should return false for empty validRoles object', () => {
      expect(isValidRole('admin', {})).toBe(false)
    })
  })

  describe('normalizeAddress', () => {
    it('should convert address to lowercase', () => {
      expect(normalizeAddress('0xAbCdEf1234567890123456789012345678901234')).toBe('0xabcdef1234567890123456789012345678901234')
      expect(normalizeAddress('0xABCDEF1234567890123456789012345678901234')).toBe('0xabcdef1234567890123456789012345678901234')
      expect(normalizeAddress('0x1234567890123456789012345678901234567890')).toBe('0x1234567890123456789012345678901234567890')
    })

    it('should return empty string for null or undefined', () => {
      expect(normalizeAddress(null)).toBe('')
      expect(normalizeAddress(undefined)).toBe('')
      expect(normalizeAddress('')).toBe('')
    })

    it('should return empty string for non-string values', () => {
      expect(normalizeAddress(123)).toBe('')
      expect(normalizeAddress({})).toBe('')
      expect(normalizeAddress([])).toBe('')
    })
  })
})
