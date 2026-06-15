import { describe, it, expect } from 'vitest'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'

// Regression guard: the bundled MembershipManager ABI is hand-maintained and
// drifted once before (Spec 007's *WithTerms overloads were added to the
// contract but not the ABI), causing "M.purchaseTierWithTerms is not a function"
// in the UI. These are every MembershipManager method blockchainService.js
// invokes during the membership purchase / upgrade / extend flow.
describe('MEMBERSHIP_MANAGER_ABI coverage', () => {
  const fnNames = new Set(
    MEMBERSHIP_MANAGER_ABI.filter((e) => e.type === 'function').map((e) => e.name)
  )

  const required = [
    'purchaseTier',
    'purchaseTierWithTerms',
    'upgradeTier',
    'upgradeTierWithTerms',
    'extendMembership',
    'getMembership',
    'getTierConfig',
  ]

  it.each(required)('exposes %s', (name) => {
    expect(fnNames.has(name)).toBe(true)
  })
})
