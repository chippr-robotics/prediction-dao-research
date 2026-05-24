import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getUserRoles,
  saveUserRoles,
  hasRole,
  addUserRole,
  removeUserRole,
  clearUserRoles,
  getAllUsersWithRoles,
  recordRolePurchase,
  getRolePurchases,
} from '../utils/roleStorage'

const TEST_ADDRESS = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'
const NORMALIZED_ADDRESS = TEST_ADDRESS.toLowerCase()

describe('roleStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('getUserRoles', () => {
    it('should return empty array when no roles stored', () => {
      expect(getUserRoles(TEST_ADDRESS)).toEqual([])
    })

    it('should return stored roles', () => {
      localStorage.setItem(
        `fw_user_roles_${NORMALIZED_ADDRESS}`,
        JSON.stringify(['ADMIN', 'WAGER_PARTICIPANT'])
      )
      expect(getUserRoles(TEST_ADDRESS)).toEqual(['ADMIN', 'WAGER_PARTICIPANT'])
    })

    it('should normalize address to lowercase', () => {
      localStorage.setItem(
        `fw_user_roles_${NORMALIZED_ADDRESS}`,
        JSON.stringify(['ADMIN'])
      )
      expect(getUserRoles(TEST_ADDRESS.toUpperCase())).toEqual(['ADMIN'])
    })

    it('should return empty array on parse error', () => {
      localStorage.setItem(`fw_user_roles_${NORMALIZED_ADDRESS}`, 'invalid json')
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(getUserRoles(TEST_ADDRESS)).toEqual([])
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should return empty array and log error when wallet address is missing', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(getUserRoles(null)).toEqual([])
      expect(getUserRoles('')).toEqual([])
      expect(getUserRoles(undefined)).toEqual([])
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should handle a single role', () => {
      localStorage.setItem(
        `fw_user_roles_${NORMALIZED_ADDRESS}`,
        JSON.stringify(['ORACLE'])
      )
      expect(getUserRoles(TEST_ADDRESS)).toEqual(['ORACLE'])
    })

    it('should return empty array for empty JSON array', () => {
      localStorage.setItem(
        `fw_user_roles_${NORMALIZED_ADDRESS}`,
        JSON.stringify([])
      )
      expect(getUserRoles(TEST_ADDRESS)).toEqual([])
    })
  })

  describe('saveUserRoles', () => {
    it('should save roles to localStorage', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN', 'ORACLE'])
      const stored = JSON.parse(localStorage.getItem(`fw_user_roles_${NORMALIZED_ADDRESS}`))
      expect(stored).toEqual(['ADMIN', 'ORACLE'])
    })

    it('should overwrite existing roles', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN'])
      saveUserRoles(TEST_ADDRESS, ['ORACLE'])
      const stored = JSON.parse(localStorage.getItem(`fw_user_roles_${NORMALIZED_ADDRESS}`))
      expect(stored).toEqual(['ORACLE'])
    })

    it('should handle localStorage errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full')
      })
      // Should not throw
      saveUserRoles(TEST_ADDRESS, ['ADMIN'])
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should save empty array', () => {
      saveUserRoles(TEST_ADDRESS, [])
      const stored = JSON.parse(localStorage.getItem(`fw_user_roles_${NORMALIZED_ADDRESS}`))
      expect(stored).toEqual([])
    })

    it('should normalize address case', () => {
      saveUserRoles(TEST_ADDRESS.toUpperCase(), ['ADMIN'])
      const stored = JSON.parse(localStorage.getItem(`fw_user_roles_${NORMALIZED_ADDRESS}`))
      expect(stored).toEqual(['ADMIN'])
    })
  })

  describe('hasRole', () => {
    it('should return true when user has the role', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN', 'ORACLE'])
      expect(hasRole(TEST_ADDRESS, 'ADMIN')).toBe(true)
    })

    it('should return false when user does not have the role', () => {
      saveUserRoles(TEST_ADDRESS, ['ORACLE'])
      expect(hasRole(TEST_ADDRESS, 'ADMIN')).toBe(false)
    })

    it('should return false when no roles are stored', () => {
      expect(hasRole(TEST_ADDRESS, 'ADMIN')).toBe(false)
    })

    it('should return false on error', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      // Pass null to trigger error in getRoleStorageKey
      expect(hasRole(null, 'ADMIN')).toBe(false)
      errorSpy.mockRestore()
    })

    it('should be case sensitive for role names', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN'])
      expect(hasRole(TEST_ADDRESS, 'admin')).toBe(false)
      expect(hasRole(TEST_ADDRESS, 'ADMIN')).toBe(true)
    })
  })

  describe('addUserRole', () => {
    it('should add a new role', () => {
      addUserRole(TEST_ADDRESS, 'ADMIN')
      expect(getUserRoles(TEST_ADDRESS)).toEqual(['ADMIN'])
    })

    it('should not duplicate existing role', () => {
      addUserRole(TEST_ADDRESS, 'ADMIN')
      addUserRole(TEST_ADDRESS, 'ADMIN')
      expect(getUserRoles(TEST_ADDRESS)).toEqual(['ADMIN'])
    })

    it('should add multiple different roles', () => {
      addUserRole(TEST_ADDRESS, 'ADMIN')
      addUserRole(TEST_ADDRESS, 'ORACLE')
      expect(getUserRoles(TEST_ADDRESS)).toEqual(['ADMIN', 'ORACLE'])
    })

    it('should handle errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      addUserRole(null, 'ADMIN')
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should preserve existing roles when adding new one', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN', 'ORACLE'])
      addUserRole(TEST_ADDRESS, 'WAGER_PARTICIPANT')
      expect(getUserRoles(TEST_ADDRESS)).toEqual(['ADMIN', 'ORACLE', 'WAGER_PARTICIPANT'])
    })
  })

  describe('removeUserRole', () => {
    it('should remove an existing role', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN', 'ORACLE'])
      removeUserRole(TEST_ADDRESS, 'ADMIN')
      expect(getUserRoles(TEST_ADDRESS)).toEqual(['ORACLE'])
    })

    it('should not error when removing non-existent role', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN'])
      removeUserRole(TEST_ADDRESS, 'ORACLE')
      expect(getUserRoles(TEST_ADDRESS)).toEqual(['ADMIN'])
    })

    it('should result in empty array when last role removed', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN'])
      removeUserRole(TEST_ADDRESS, 'ADMIN')
      expect(getUserRoles(TEST_ADDRESS)).toEqual([])
    })

    it('should handle errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      removeUserRole(null, 'ADMIN')
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should only remove the specified role', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN', 'ORACLE', 'WAGER_PARTICIPANT'])
      removeUserRole(TEST_ADDRESS, 'ORACLE')
      expect(getUserRoles(TEST_ADDRESS)).toEqual(['ADMIN', 'WAGER_PARTICIPANT'])
    })
  })

  describe('clearUserRoles', () => {
    it('should remove all roles for a user', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN', 'ORACLE'])
      clearUserRoles(TEST_ADDRESS)
      expect(getUserRoles(TEST_ADDRESS)).toEqual([])
    })

    it('should not affect other users', () => {
      const otherAddress = '0x9999999999999999999999999999999999999999'
      saveUserRoles(TEST_ADDRESS, ['ADMIN'])
      saveUserRoles(otherAddress, ['ORACLE'])
      clearUserRoles(TEST_ADDRESS)
      expect(getUserRoles(otherAddress)).toEqual(['ORACLE'])
    })

    it('should handle errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error')
      })
      clearUserRoles(TEST_ADDRESS)
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should not throw when clearing already empty roles', () => {
      expect(() => clearUserRoles(TEST_ADDRESS)).not.toThrow()
    })
  })

  describe('getAllUsersWithRoles', () => {
    it('should return empty object when no users have roles', () => {
      expect(getAllUsersWithRoles()).toEqual({})
    })

    it('should return all users with their roles', () => {
      const addr1 = '0xaaaa000000000000000000000000000000000001'
      const addr2 = '0xbbbb000000000000000000000000000000000002'
      saveUserRoles(addr1, ['ADMIN'])
      saveUserRoles(addr2, ['ORACLE', 'WAGER_PARTICIPANT'])

      const result = getAllUsersWithRoles()
      expect(result[addr1]).toEqual(['ADMIN'])
      expect(result[addr2]).toEqual(['ORACLE', 'WAGER_PARTICIPANT'])
    })

    it('should skip users with empty role arrays', () => {
      saveUserRoles(TEST_ADDRESS, [])
      const result = getAllUsersWithRoles()
      expect(result[NORMALIZED_ADDRESS]).toBeUndefined()
    })

    it('should ignore non-role keys in localStorage', () => {
      localStorage.setItem('unrelated_key', 'some_value')
      saveUserRoles(TEST_ADDRESS, ['ADMIN'])
      const result = getAllUsersWithRoles()
      expect(Object.keys(result)).toHaveLength(1)
    })

    it('should handle errors gracefully', () => {
      saveUserRoles(TEST_ADDRESS, ['ADMIN'])
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error')
      })
      expect(getAllUsersWithRoles()).toEqual({})
      errorSpy.mockRestore()
    })

    it('should handle multiple users correctly', () => {
      const addresses = [
        '0xaaaa000000000000000000000000000000000001',
        '0xbbbb000000000000000000000000000000000002',
        '0xcccc000000000000000000000000000000000003',
      ]
      saveUserRoles(addresses[0], ['ADMIN'])
      saveUserRoles(addresses[1], ['ORACLE'])
      saveUserRoles(addresses[2], ['WAGER_PARTICIPANT', 'ADMIN'])

      const result = getAllUsersWithRoles()
      expect(Object.keys(result)).toHaveLength(3)
    })
  })

  describe('recordRolePurchase', () => {
    it('should record a purchase', () => {
      const details = { txHash: '0xabc', amount: '100' }
      recordRolePurchase(TEST_ADDRESS, 'WAGER_PARTICIPANT', details)

      const purchases = getRolePurchases(TEST_ADDRESS)
      expect(purchases).toHaveLength(1)
      expect(purchases[0].role).toBe('WAGER_PARTICIPANT')
      expect(purchases[0].txHash).toBe('0xabc')
      expect(purchases[0].amount).toBe('100')
      expect(purchases[0].timestamp).toBeGreaterThan(0)
    })

    it('should append to existing purchases', () => {
      recordRolePurchase(TEST_ADDRESS, 'ADMIN', { txHash: '0x1' })
      recordRolePurchase(TEST_ADDRESS, 'ORACLE', { txHash: '0x2' })

      const purchases = getRolePurchases(TEST_ADDRESS)
      expect(purchases).toHaveLength(2)
      expect(purchases[0].role).toBe('ADMIN')
      expect(purchases[1].role).toBe('ORACLE')
    })

    it('should handle errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      recordRolePurchase(null, 'ADMIN', {})
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should include timestamp in purchase record', () => {
      const now = Date.now()
      recordRolePurchase(TEST_ADDRESS, 'ADMIN', {})
      const purchases = getRolePurchases(TEST_ADDRESS)
      expect(purchases[0].timestamp).toBeGreaterThanOrEqual(now)
    })

    it('should merge purchase details with role and timestamp', () => {
      recordRolePurchase(TEST_ADDRESS, 'ADMIN', { txHash: '0xabc', tier: 'GOLD' })
      const purchases = getRolePurchases(TEST_ADDRESS)
      expect(purchases[0]).toMatchObject({
        role: 'ADMIN',
        txHash: '0xabc',
        tier: 'GOLD',
      })
    })
  })

  describe('getRolePurchases', () => {
    it('should return empty array when no purchases exist', () => {
      expect(getRolePurchases(TEST_ADDRESS)).toEqual([])
    })

    it('should return stored purchases', () => {
      recordRolePurchase(TEST_ADDRESS, 'ADMIN', { txHash: '0xabc' })
      const purchases = getRolePurchases(TEST_ADDRESS)
      expect(purchases).toHaveLength(1)
    })

    it('should normalize address to lowercase', () => {
      recordRolePurchase(TEST_ADDRESS, 'ADMIN', {})
      expect(getRolePurchases(TEST_ADDRESS.toUpperCase())).toHaveLength(1)
    })

    it('should return empty array on parse error', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorage.setItem(
        `fw_role_purchases_${NORMALIZED_ADDRESS}`,
        'invalid json'
      )
      expect(getRolePurchases(TEST_ADDRESS)).toEqual([])
      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('should isolate purchases between different addresses', () => {
      const addr2 = '0x9999999999999999999999999999999999999999'
      recordRolePurchase(TEST_ADDRESS, 'ADMIN', {})
      recordRolePurchase(addr2, 'ORACLE', {})
      expect(getRolePurchases(TEST_ADDRESS)).toHaveLength(1)
      expect(getRolePurchases(addr2)).toHaveLength(1)
      expect(getRolePurchases(TEST_ADDRESS)[0].role).toBe('ADMIN')
      expect(getRolePurchases(addr2)[0].role).toBe('ORACLE')
    })
  })
})
