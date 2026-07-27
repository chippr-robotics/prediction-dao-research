// Spec 067/068 — the permissions card must distinguish "you do not hold this role" from
// "there is no contract here to ask".
//
// This is not hypothetical. Both failures have happened: an operator holding a role read a list of
// × and concluded their grant had not landed (see the comment on the card itself), and then the
// spec-067 routers were live on five networks while the frontend config still carried '' for them,
// so every router-backed role rendered × for an operator who provably held all of them on-chain.
//
// hasRoleOnChain returning false for both cases is CORRECT — false is the safe answer when gating a
// control. The defect is only in how the two are displayed.

import { describe, it, expect } from 'vitest'
import { roleBackingContracts } from '../../utils/blockchainService'
import { getContractAddressForChain } from '../../config/contracts'

describe('roleBackingContracts — can this role be checked here?', () => {
  it('reports the FeeRouter as backing FEE_ADMIN wherever it is deployed', () => {
    // Polygon has a live FeeRouter; the role is answerable there.
    expect(getContractAddressForChain('feeRouter', 137)).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(roleBackingContracts('FEE_ADMIN', 137)).toContain('feeRouter')
  })

  it('reports NOTHING backing FEE_ADMIN on a chain with no FeeRouter', () => {
    // Amoy has no FeeRouter — so a × there would be an assertion the app cannot support.
    expect(getContractAddressForChain('feeRouter', 80002)).toBeFalsy()
    expect(roleBackingContracts('FEE_ADMIN', 80002)).toEqual([])
  })

  it('treats LIQUIDITY_ADMIN as backed by EITHER router', () => {
    // The role is defined independently on both, so one deployed router is enough to ask.
    const backing = roleBackingContracts('LIQUIDITY_ADMIN', 137)
    expect(backing.length).toBeGreaterThan(0)
    for (const key of backing) expect(['bridgeRouter', 'liquidityRouter']).toContain(key)
  })

  it('reports nothing for LIQUIDITY_ADMIN on a chain with neither router', () => {
    expect(roleBackingContracts('LIQUIDITY_ADMIN', 80002)).toEqual([])
  })

  it('keeps the mapping honest for the roles that live on the wager stack', () => {
    // Mordor has a WagerRegistry, so GUARDIAN is answerable there.
    expect(roleBackingContracts('GUARDIAN', 63)).toContain('wagerRegistry')
    // ADMIN spans several contracts; every key returned must actually resolve on that chain.
    for (const key of roleBackingContracts('ADMIN', 137)) {
      expect(getContractAddressForChain(key, 137)).toBeTruthy()
    }
  })

  it('never returns a contract key that does not resolve on the chain', () => {
    for (const chainId of [1, 10, 63, 137, 8453, 42161, 80002]) {
      for (const role of ['ADMIN', 'GUARDIAN', 'FEE_ADMIN', 'STAKING_ADMIN', 'LIQUIDITY_ADMIN']) {
        for (const key of roleBackingContracts(role, chainId)) {
          expect(
            getContractAddressForChain(key, chainId),
            `${role} on chain ${chainId} claims ${key} backs it, but it does not resolve there`,
          ).toBeTruthy()
        }
      }
    }
  })
})

describe('router addresses are actually wired into the app', () => {
  // The screenshots that prompted this: every network read "no router deployed" while the routers
  // were live on all five control-plane mainnets. Deployed-but-unwired is indistinguishable from
  // undeployed to a member, so assert the config carries what the deployment records do.
  it('resolves both spec-067 routers on every control-plane mainnet', () => {
    for (const chainId of [1, 10, 137, 8453, 42161]) {
      expect(
        getContractAddressForChain('bridgeRouter', chainId),
        `bridgeRouter missing from frontend config on chain ${chainId}`,
      ).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(
        getContractAddressForChain('liquidityRouter', chainId),
        `liquidityRouter missing from frontend config on chain ${chainId}`,
      ).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })

  it('resolves the FeeRouter on every chain where one was deployed', () => {
    for (const chainId of [1, 10, 63, 137, 8453, 42161]) {
      expect(
        getContractAddressForChain('feeRouter', chainId),
        `feeRouter missing from frontend config on chain ${chainId}`,
      ).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })
})
