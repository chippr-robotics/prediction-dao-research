import { describe, it, expect } from 'vitest'
import {
  ROLES,
  ROLE_INFO,
  ADMIN_ROLES,
  isAdminRole,
  getRoleName,
} from '../contexts/RoleContext'

describe('RoleContext', () => {
  describe('ROLES', () => {
    it('should define WAGER_PARTICIPANT role', () => {
      expect(ROLES.WAGER_PARTICIPANT).toBe('WAGER_PARTICIPANT')
    })

    it('should define ADMIN role', () => {
      expect(ROLES.ADMIN).toBe('ADMIN')
    })

    it('should define GUARDIAN role', () => {
      expect(ROLES.GUARDIAN).toBe('GUARDIAN')
    })

    it('should define ACCOUNT_MODERATOR role', () => {
      expect(ROLES.ACCOUNT_MODERATOR).toBe('ACCOUNT_MODERATOR')
    })

    it('should define ROLE_MANAGER role', () => {
      expect(ROLES.ROLE_MANAGER).toBe('ROLE_MANAGER')
    })
  })

  describe('ROLE_INFO', () => {
    it('should have info for each role', () => {
      for (const role of Object.values(ROLES)) {
        expect(ROLE_INFO[role]).toBeDefined()
        expect(ROLE_INFO[role].name).toBeTruthy()
        expect(ROLE_INFO[role].description).toBeTruthy()
      }
    })

    it('should mark WAGER_PARTICIPANT as premium', () => {
      expect(ROLE_INFO[ROLES.WAGER_PARTICIPANT].premium).toBe(true)
      expect(ROLE_INFO[ROLES.WAGER_PARTICIPANT].isAdminRole).toBe(false)
    })

    it('should mark ADMIN as admin role', () => {
      expect(ROLE_INFO[ROLES.ADMIN].isAdminRole).toBe(true)
      expect(ROLE_INFO[ROLES.ADMIN].premium).toBe(false)
    })

    it('should mark GUARDIAN as admin role', () => {
      expect(ROLE_INFO[ROLES.GUARDIAN].isAdminRole).toBe(true)
    })

    it('should mark ACCOUNT_MODERATOR as admin role', () => {
      expect(ROLE_INFO[ROLES.ACCOUNT_MODERATOR].isAdminRole).toBe(true)
    })

    it('should mark ROLE_MANAGER as admin role', () => {
      expect(ROLE_INFO[ROLES.ROLE_MANAGER].isAdminRole).toBe(true)
    })
  })

  describe('ADMIN_ROLES', () => {
    it('should include all admin roles', () => {
      expect(ADMIN_ROLES).toContain(ROLES.ADMIN)
      expect(ADMIN_ROLES).toContain(ROLES.GUARDIAN)
      expect(ADMIN_ROLES).toContain(ROLES.ACCOUNT_MODERATOR)
      expect(ADMIN_ROLES).toContain(ROLES.ROLE_MANAGER)
    })

    it('should NOT include WAGER_PARTICIPANT', () => {
      expect(ADMIN_ROLES).not.toContain(ROLES.WAGER_PARTICIPANT)
    })

    it('should have exactly 4 admin roles', () => {
      expect(ADMIN_ROLES).toHaveLength(4)
    })
  })

  describe('isAdminRole', () => {
    it('should return true for ADMIN', () => {
      expect(isAdminRole(ROLES.ADMIN)).toBe(true)
    })

    it('should return true for GUARDIAN', () => {
      expect(isAdminRole(ROLES.GUARDIAN)).toBe(true)
    })

    it('should return true for ACCOUNT_MODERATOR', () => {
      expect(isAdminRole(ROLES.ACCOUNT_MODERATOR)).toBe(true)
    })

    it('should return true for ROLE_MANAGER', () => {
      expect(isAdminRole(ROLES.ROLE_MANAGER)).toBe(true)
    })

    it('should return false for WAGER_PARTICIPANT', () => {
      expect(isAdminRole(ROLES.WAGER_PARTICIPANT)).toBe(false)
    })

    it('should return false for unknown role', () => {
      expect(isAdminRole('UNKNOWN')).toBe(false)
    })

    it('should return false for null', () => {
      expect(isAdminRole(null)).toBe(false)
    })
  })

  describe('getRoleName', () => {
    it('should return human-readable name for known roles', () => {
      expect(getRoleName(ROLES.WAGER_PARTICIPANT)).toBe('Wager Participant')
      expect(getRoleName(ROLES.ADMIN)).toBe('Administrator')
      expect(getRoleName(ROLES.GUARDIAN)).toBe('Emergency Guardian')
      expect(getRoleName(ROLES.ACCOUNT_MODERATOR)).toBe('Account Moderator')
      expect(getRoleName(ROLES.ROLE_MANAGER)).toBe('Role Manager')
    })

    it('should return the role string for unknown roles', () => {
      expect(getRoleName('UNKNOWN_ROLE')).toBe('UNKNOWN_ROLE')
    })

    it('should return null/undefined for null', () => {
      // getRoleName(null) => ROLE_INFO[null]?.name || null
      expect(getRoleName(null)).toBe(null)
    })
  })
})
