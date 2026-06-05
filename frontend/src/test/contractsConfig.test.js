import { describe, it, expect } from 'vitest'

import { DEPLOYED_CONTRACTS, getContractAddress, getContractAddressForChain } from '../config/contracts'

// Each contract slot is either an empty placeholder (pre-deploy state) or a
// 0x-prefixed 40-character hex address (post-sync:frontend-contracts state).
// The frontend treats both as valid; tests assert the shape rather than that
// the addresses are non-empty so the migration baseline passes before the
// first Polygon Amoy deployment lands.
const ADDR_OR_PLACEHOLDER = /^(0x[0-9a-fA-F]{40})?$/

describe('contracts config', () => {
  describe('DEPLOYED_CONTRACTS', () => {
    it('exposes core contract address slots', () => {
      expect(DEPLOYED_CONTRACTS).toHaveProperty('deployer')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('treasury')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('roleManagerCore')
      expect(DEPLOYED_CONTRACTS.deployer).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.treasury).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.roleManagerCore).toMatch(ADDR_OR_PLACEHOLDER)
    })

    it('exposes RBAC contract address slots', () => {
      expect(DEPLOYED_CONTRACTS).toHaveProperty('tieredRoleManager')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('tierRegistry')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('membershipManager')
      expect(DEPLOYED_CONTRACTS.tieredRoleManager).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.tierRegistry).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.membershipManager).toMatch(ADDR_OR_PLACEHOLDER)
    })

    it('exposes role manager contract slots', () => {
      // tieredRoleManager - TieredRoleManager with tier-based membership limits
      // roleManager - alias for TieredRoleManager (tier checks, market limits)
      // roleManagerCore - modular RoleManagerCore (used by PaymentProcessor for role grants)
      // sync:frontend-contracts may set roleManager === tieredRoleManager and
      // roleManagerCore to a distinct address, but the slots must always exist.
      expect(DEPLOYED_CONTRACTS).toHaveProperty('tieredRoleManager')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('roleManager')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('roleManagerCore')
    })

    it('exposes friend market contract slots', () => {
      expect(DEPLOYED_CONTRACTS).toHaveProperty('friendGroupMarketFactory')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('friendGroupCreationLib')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('friendGroupResolutionLib')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('friendGroupClaimsLib')
      expect(DEPLOYED_CONTRACTS.friendGroupMarketFactory).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.friendGroupCreationLib).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.friendGroupResolutionLib).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.friendGroupClaimsLib).toMatch(ADDR_OR_PLACEHOLDER)
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

  describe('getContractAddressForChain', () => {
    it('resolves the membership manager for the Amoy testnet', () => {
      // Amoy (80002) has a v2 deployment with a real MembershipManager.
      expect(getContractAddressForChain('membershipManager', 80002)).toMatch(
        /^0x[0-9a-fA-F]{40}$/
      )
    })

    it('returns undefined on a chain with no deployment (e.g. Polygon mainnet)', () => {
      // Polygon mainnet (137) has no contracts deployed yet — membership and
      // wager reads must resolve to undefined so a testnet membership is never
      // surfaced as active on mainnet.
      expect(getContractAddressForChain('membershipManager', 137)).toBeUndefined()
      expect(getContractAddressForChain('wagerRegistry', 137)).toBeUndefined()
    })

    it('falls back to the active-chain lookup when no chainId is given', () => {
      expect(getContractAddressForChain('roleManager')).toEqual(
        getContractAddress('roleManager')
      )
    })
  })
})
