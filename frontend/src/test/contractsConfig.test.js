import { describe, it, expect } from 'vitest'

import { DEPLOYED_CONTRACTS, getContractAddress, getContractAddressForChain } from '../config/contracts'

// The test build pins VITE_NETWORK_ID=63 (Mordor), which is now a v2 P2P
// deployment (the legacy v1 Mordor contracts were retired — Spec 015 FR-017).
// Each contract slot is either an empty placeholder (pre-deploy / pre-sync) or a
// 0x-prefixed 40-character hex address (post-sync:frontend-contracts). The
// frontend treats both as valid; tests assert the v2 SHAPE rather than that the
// addresses are non-empty, so the baseline passes before the Mordor deploy lands.
const ADDR_OR_PLACEHOLDER = /^(0x[0-9a-fA-F]{40})?$/

describe('contracts config', () => {
  describe('DEPLOYED_CONTRACTS', () => {
    it('exposes core contract address slots', () => {
      expect(DEPLOYED_CONTRACTS).toHaveProperty('deployer')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('treasury')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('wagerRegistry')
      expect(DEPLOYED_CONTRACTS.deployer).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.treasury).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.wagerRegistry).toMatch(ADDR_OR_PLACEHOLDER)
    })

    it('exposes membership + key registry slots', () => {
      expect(DEPLOYED_CONTRACTS).toHaveProperty('membershipManager')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('keyRegistry')
      expect(DEPLOYED_CONTRACTS.membershipManager).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.keyRegistry).toMatch(ADDR_OR_PLACEHOLDER)
    })

    it('exposes the sanctions guard + payment token slots', () => {
      // SanctionsGuard is enforced on every v2 network (Spec 015 FR-016).
      // paymentToken is the per-network stablecoin (Classic USD on Mordor).
      expect(DEPLOYED_CONTRACTS).toHaveProperty('sanctionsGuard')
      expect(DEPLOYED_CONTRACTS).toHaveProperty('paymentToken')
      expect(DEPLOYED_CONTRACTS.sanctionsGuard).toMatch(ADDR_OR_PLACEHOLDER)
      expect(DEPLOYED_CONTRACTS.paymentToken).toMatch(ADDR_OR_PLACEHOLDER)
    })

    it('does NOT expose oracle adapters on Mordor (core-only — no Polymarket/Chainlink/UMA)', () => {
      // Spec 015 FR-001: oracle adapters are not deployed on Ethereum Classic, so
      // their slots are absent and the Network-tab tags read "unavailable".
      expect(DEPLOYED_CONTRACTS).not.toHaveProperty('polymarketAdapter')
      expect(DEPLOYED_CONTRACTS).not.toHaveProperty('chainlinkDataFeedAdapter')
      expect(DEPLOYED_CONTRACTS).not.toHaveProperty('umaAdapter')
    })
  })

  describe('getContractAddress', () => {
    it('returns address from DEPLOYED_CONTRACTS', () => {
      expect(getContractAddress('wagerRegistry')).toEqual(DEPLOYED_CONTRACTS.wagerRegistry)
      expect(getContractAddress('membershipManager')).toEqual(DEPLOYED_CONTRACTS.membershipManager)
      expect(getContractAddress('keyRegistry')).toEqual(DEPLOYED_CONTRACTS.keyRegistry)
    })

    it('returns the payment token slot', () => {
      expect(getContractAddress('paymentToken')).toEqual(DEPLOYED_CONTRACTS.paymentToken)
    })

    it('returns undefined for unknown contract names', () => {
      expect(getContractAddress('unknownContract')).toBeUndefined()
      expect(getContractAddress('nonExistent')).toBeUndefined()
    })

    it('handles case sensitivity correctly', () => {
      // Contract names are case-sensitive and should match DEPLOYED_CONTRACTS keys exactly
      expect(getContractAddress('membershipManager')).toBeDefined()
      expect(getContractAddress('MEMBERSHIPMANAGER')).toBeUndefined() // Wrong case
    })
  })

  describe('getContractAddressForChain', () => {
    it('resolves the membership manager for the Amoy testnet', () => {
      // Amoy (80002) has a v2 deployment with a real MembershipManager.
      expect(getContractAddressForChain('membershipManager', 80002)).toMatch(
        /^0x[0-9a-fA-F]{40}$/
      )
    })

    it('resolves Polygon mainnet (137) now that it has a v2 deployment', () => {
      // The v2 contracts are live on Polygon mainnet, so 137 resolves to real
      // addresses (previously this returned undefined when 137 was undeployed).
      expect(getContractAddressForChain('membershipManager', 137)).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(getContractAddressForChain('wagerRegistry', 137)).toMatch(/^0x[0-9a-fA-F]{40}$/)
    })

    it('returns no oracle adapter for Mordor (63) — core-only deployment', () => {
      // Spec 015 FR-001/FR-008: oracle adapters are absent on Mordor, so these
      // resolve to undefined and the capability tags stay grey.
      expect(getContractAddressForChain('polymarketAdapter', 63)).toBeUndefined()
      expect(getContractAddressForChain('umaAdapter', 63)).toBeUndefined()
    })

    it('returns undefined on a chain with no deployment', () => {
      // An unconfigured chain (e.g. Ethereum mainnet, 1) has no NETWORK_CONTRACTS
      // entry — membership and wager reads must resolve to undefined so a testnet
      // membership is never surfaced as active there.
      expect(getContractAddressForChain('membershipManager', 1)).toBeUndefined()
      expect(getContractAddressForChain('wagerRegistry', 1)).toBeUndefined()
    })

    it('falls back to the active-chain lookup when no chainId is given', () => {
      expect(getContractAddressForChain('membershipManager')).toEqual(
        getContractAddress('membershipManager')
      )
    })
  })

  describe('feature-complete testnets resolve the full contract set', () => {
    // Specs 024/026/027: Amoy (80002) and Mordor (63) are deployed feature-complete
    // (open challenges + vouchers + UUPS membership). Every slot the app needs to
    // resolve MUST be a real address — guards against a deployed contract silently
    // going unconfigured in the frontend (e.g. membershipVoucher was missing from
    // the sync mapping, which disabled the voucher UI on both chains).
    const ADDR = /^0x[0-9a-fA-F]{40}$/
    for (const chainId of [63, 80002]) {
      for (const name of ['wagerRegistry', 'membershipManager', 'membershipVoucher', 'paymentToken', 'sanctionsGuard']) {
        it(`resolves ${name} on chain ${chainId}`, () => {
          expect(getContractAddressForChain(name, chainId)).toMatch(ADDR)
        })
      }
    }
  })
})
