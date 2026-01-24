import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { DEPLOYED_CONTRACTS, getContractAddress } from '../config/contracts'

describe('contracts config', () => {
  describe('DEPLOYED_CONTRACTS', () => {
    it('exposes deterministic deployment keys', () => {
      expect(DEPLOYED_CONTRACTS.welfareRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.proposalRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.marketFactory).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.futarchyGovernor).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    it('exposes factory contract addresses', () => {
      expect(DEPLOYED_CONTRACTS.tokenMintFactory).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(DEPLOYED_CONTRACTS.daoFactory).toMatch(/^0x[0-9a-fA-F]{40}$/)
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
      expect(DEPLOYED_CONTRACTS.ctf1155).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })
  })

  describe('getContractAddress', () => {
    it('returns address from DEPLOYED_CONTRACTS', () => {
      expect(getContractAddress('tokenMintFactory')).toEqual(DEPLOYED_CONTRACTS.tokenMintFactory)
      expect(getContractAddress('daoFactory')).toEqual(DEPLOYED_CONTRACTS.daoFactory)
      expect(getContractAddress('roleManager')).toEqual(DEPLOYED_CONTRACTS.roleManager)
      expect(getContractAddress('roleManagerCore')).toEqual(DEPLOYED_CONTRACTS.roleManagerCore)
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
      expect(getContractAddress('marketFactory')).toBeDefined()
      expect(getContractAddress('MARKETFACTORY')).toBeUndefined() // Wrong case
    })

    // Note: Environment variable override tests would require mocking import.meta.env
    // which is challenging in Vitest. The function supports:
    // - VITE_MARKETFACTORY_ADDRESS (uppercase name)
    // - VITE_MARKET_FACTORY_ADDRESS (snake_case conversion)
    // These are verified through manual testing and integration tests.
  })
})
