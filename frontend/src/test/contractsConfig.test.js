import { describe, it, expect } from 'vitest'

import { DEPLOYED_CONTRACTS, getContractAddress } from '../config/contracts'

describe('contracts config', () => {
  describe('DEPLOYED_CONTRACTS', () => {
    it('exposes core contract addresses', () => {
      expect(DEPLOYED_CONTRACTS.deployer).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.treasury).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.roleManagerCore).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    it('exposes RBAC contract addresses', () => {
      expect(DEPLOYED_CONTRACTS.tieredRoleManager).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.tierRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.membershipManager).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    it('exposes role manager contracts', () => {
      // tieredRoleManager - TieredRoleManager with tier-based membership limits
      expect(DEPLOYED_CONTRACTS.tieredRoleManager).toBeTruthy()

      // roleManager - alias for TieredRoleManager (tier checks, market limits)
      expect(DEPLOYED_CONTRACTS.roleManager).toBeTruthy()
      expect(DEPLOYED_CONTRACTS.roleManager).toEqual(DEPLOYED_CONTRACTS.tieredRoleManager)

      // roleManagerCore - modular RoleManagerCore (used by PaymentProcessor for role grants)
      // This is intentionally different from roleManager
      expect(DEPLOYED_CONTRACTS.roleManagerCore).toBeTruthy()
      expect(DEPLOYED_CONTRACTS.roleManagerCore).not.toEqual(DEPLOYED_CONTRACTS.roleManager)
    })

    it('exposes friend market contracts', () => {
      expect(DEPLOYED_CONTRACTS.friendGroupMarketFactory).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.friendGroupCreationLib).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.friendGroupResolutionLib).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.friendGroupClaimsLib).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })
  })

  describe('getContractAddress', () => {
    it('returns address from DEPLOYED_CONTRACTS', () => {
      expect(getContractAddress('roleManager')).toEqual(DEPLOYED_CONTRACTS.roleManager)
      expect(getContractAddress('roleManagerCore')).toEqual(DEPLOYED_CONTRACTS.roleManagerCore)
      expect(getContractAddress('tieredRoleManager')).toEqual(DEPLOYED_CONTRACTS.tieredRoleManager)
    })

    it('returns address for friendGroupMarketFactory', () => {
      expect(getContractAddress('friendGroupMarketFactory')).toEqual(
        DEPLOYED_CONTRACTS.friendGroupMarketFactory
      )
    })

    it('returns undefined for unknown contract names', () => {
      expect(getContractAddress('unknownContract')).toBeUndefined()
      expect(getContractAddress('nonExistent')).toBeUndefined()
    })

    it('handles case sensitivity correctly', () => {
      // Contract names are case-sensitive and should match DEPLOYED_CONTRACTS keys exactly
      expect(getContractAddress('friendGroupMarketFactory')).toBeDefined()
      expect(getContractAddress('FRIENDGROUPMARKETFACTORY')).toBeUndefined() // Wrong case
    })

    // Note: Environment variable override tests would require mocking import.meta.env
    // which is challenging in Vitest. The function supports:
    // - VITE_FRIENDGROUPMARKETFACTORY_ADDRESS (uppercase name)
    // - VITE_FRIEND_GROUP_MARKET_FACTORY_ADDRESS (snake_case conversion)
    // These are verified through manual testing and integration tests.
  })
})
