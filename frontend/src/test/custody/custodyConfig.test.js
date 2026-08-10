import { describe, it, expect } from 'vitest'
import { getContractAddressForChain, getDeploymentBlockForChain } from '../../config/contracts'
import { SAFE_CONTRACTS, CUSTODY_SUPPORTED_CHAIN_IDS, isCustodySupported } from '../../config/safeContracts'

// Spec 068 (T002/T003) — custody chain + deployment-block plumbing.
//
// The deployment-block assertions guard a real shipped defect: `useVaultProposals` refuses to scan
// without a recorded block for `safeProposalHub`, so a missing entry silently disabled proposal
// discovery on EVERY chain, including the one where the hub was actually deployed.

describe('custody chain configuration', () => {
  it('offers custody on every chain where the stack is deployed (FR-001)', () => {
    // ETC + Mordor + Polygon, plus the L2s the app gained with spec 067's bridge work.
    expect(CUSTODY_SUPPORTED_CHAIN_IDS).toEqual(expect.arrayContaining([10, 61, 63, 137, 8453, 42161]))
    for (const chainId of [10, 61, 8453, 42161]) {
      expect(isCustodySupported(chainId)).toBe(true)
      // Canonical Safe v1.4.1 addresses are identical across Safe-Singleton-Factory chains.
      expect(SAFE_CONTRACTS[chainId]).toEqual(SAFE_CONTRACTS[137])
      expect(SAFE_CONTRACTS[chainId].version).toBe('1.4.1')
    }
  })

  // A custody chain without a deployed hub would offer vaults whose proposals can never be
  // discovered. Every entry in SAFE_CONTRACTS must therefore carry both the hub address and its
  // deployment block — this is the invariant that broke silently once already.
  it('has the proposal hub wired, with a scan block, on every custody chain', () => {
    for (const chainId of CUSTODY_SUPPORTED_CHAIN_IDS) {
      expect(
        getContractAddressForChain('safeProposalHub', chainId),
        `chain ${chainId} is offered for custody but has no safeProposalHub address`,
      ).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(
        getDeploymentBlockForChain('safeProposalHub', chainId),
        `chain ${chainId} has a hub address but no deployment block — proposal discovery would be dead`,
      ).toBeGreaterThan(0)
    }
  })

  it('has the ordered policy engine on every custody chain', () => {
    for (const chainId of CUSTODY_SUPPORTED_CHAIN_IDS) {
      expect(getContractAddressForChain('safePolicyGuardV2', chainId)).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(getContractAddressForChain('policyGuardSetup', chainId)).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })

  it('does not offer custody on chains without a Safe deployment', () => {
    expect(isCustodySupported(1)).toBe(false)
    expect(isCustodySupported(80002)).toBe(false)
    expect(isCustodySupported(null)).toBe(false)
  })

  it('records a proposal-hub deployment block wherever the hub is configured', () => {
    for (const chainId of [137, 1337]) {
      const hub = getContractAddressForChain('safeProposalHub', chainId)
      if (!hub) continue
      expect(
        getDeploymentBlockForChain('safeProposalHub', chainId),
        `safeProposalHub on chain ${chainId} has an address but no deployment block — proposal discovery would be dead`,
      ).toBeGreaterThan(0)
    }
  })

  it('resolves the V2 policy engine wherever it is deployed', () => {
    // 1337 is the fully-wired local chain used by the policy-engine test suites.
    expect(getContractAddressForChain('safePolicyGuardV2', 1337)).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(getContractAddressForChain('policyGuardSetup', 1337)).toMatch(/^0x[0-9a-fA-F]{40}$/)
    // Undeployed chains resolve undefined — the honest "unavailable here" signal.
    expect(getContractAddressForChain('safePolicyGuardV2', 80002)).toBeUndefined()
  })
})
