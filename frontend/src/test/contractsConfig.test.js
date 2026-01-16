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

    expect(getContractAddress('roleManager')).toEqual(DEPLOYED_CONTRACTS.roleManager)
    expect(getContractAddress('roleManagerCore')).toEqual(DEPLOYED_CONTRACTS.roleManagerCore)
  })
})
