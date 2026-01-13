import { describe, it, expect } from 'vitest'

import { DEPLOYED_CONTRACTS, getContractAddress } from '../config/contracts'

describe('contracts config', () => {
  it('exposes deterministic deployment keys', () => {
    expect(DEPLOYED_CONTRACTS.welfareRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(DEPLOYED_CONTRACTS.proposalRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(DEPLOYED_CONTRACTS.marketFactory).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(DEPLOYED_CONTRACTS.futarchyGovernor).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('exposes factory contract addresses', () => {
    expect(DEPLOYED_CONTRACTS.tokenMintFactory).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(DEPLOYED_CONTRACTS.daoFactory).toMatch(/^0x[0-9a-fA-F]{40}$/)

    expect(getContractAddress('tokenMintFactory')).toEqual(DEPLOYED_CONTRACTS.tokenMintFactory)
    expect(getContractAddress('daoFactory')).toEqual(DEPLOYED_CONTRACTS.daoFactory)
  })

  it('keeps role manager aliases in sync', () => {
    // tieredRoleManager is the legacy RBAC contract (no checkMarketCreationLimitFor)
    expect(DEPLOYED_CONTRACTS.tieredRoleManager).toBeTruthy()

    // roleManager and roleManagerCore should point to the NEWER contract with full IRoleManager interface
    expect(DEPLOYED_CONTRACTS.roleManager).toBeTruthy()
    expect(DEPLOYED_CONTRACTS.roleManagerCore).toEqual(DEPLOYED_CONTRACTS.roleManager)

    expect(getContractAddress('roleManager')).toEqual(DEPLOYED_CONTRACTS.roleManager)
    expect(getContractAddress('roleManagerCore')).toEqual(DEPLOYED_CONTRACTS.roleManagerCore)
  })
})
