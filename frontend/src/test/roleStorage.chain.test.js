import { describe, it, expect, beforeEach } from 'vitest'
import {
  addUserRole,
  getUserRoles,
  removeUserRole,
  recordRolePurchase,
  getRolePurchases,
} from '../utils/roleStorage'

// Spec 008 / FR-007: locally cached roles & purchases must be scoped per
// (chainId, account) so a value recorded on one network never surfaces on
// another (a contributing cause of the testnet-tier-on-mainnet defect).
const ACCT = '0x00000000000000000000000000000000000000aa'

describe('roleStorage — per-chain scoping (FR-007)', () => {
  beforeEach(() => localStorage.clear())

  it('does not leak roles across chains for the same account', () => {
    addUserRole(ACCT, 'WAGER_PARTICIPANT', 80002) // testnet
    expect(getUserRoles(ACCT, 80002)).toContain('WAGER_PARTICIPANT')
    // same account, different chain -> no role
    expect(getUserRoles(ACCT, 137)).toEqual([])
  })

  it('keys purchase history per chain', () => {
    recordRolePurchase(ACCT, 'WAGER_PARTICIPANT', { tier: 'SILVER' }, 80002)
    expect(getRolePurchases(ACCT, 80002)).toHaveLength(1)
    expect(getRolePurchases(ACCT, 137)).toEqual([])
  })

  it('removing a role on one chain does not affect another', () => {
    addUserRole(ACCT, 'ADMIN', 137)
    addUserRole(ACCT, 'ADMIN', 80002)
    removeUserRole(ACCT, 'ADMIN', 137)
    expect(getUserRoles(ACCT, 137)).toEqual([])
    expect(getUserRoles(ACCT, 80002)).toContain('ADMIN')
  })

  it('legacy account-only key is separate from chain-scoped keys (back-compat)', () => {
    addUserRole(ACCT, 'GUARDIAN') // legacy, no chainId
    expect(getUserRoles(ACCT)).toContain('GUARDIAN')
    expect(getUserRoles(ACCT, 137)).toEqual([])
  })
})
