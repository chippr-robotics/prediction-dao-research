/**
 * Spec 071 T005 — the membership reference-chain resolver and the environment cohort.
 *
 * The test build runs with VITE_NETWORK_ID=63 (Mordor), so this process IS a testnet build.
 * That makes it the useful side of the boundary to assert from: a testnet build must never
 * resolve membership to a mainnet, which is exactly SC-008.
 */
import { describe, it, expect } from 'vitest'
import {
  membershipChainId, cohortChainIds, isInCohort, assertReferenceChainInCohort,
  NETWORKS, MAINNET_CHAIN_ID, TESTNET_CHAIN_ID, getCurrentChainId, listSupportedChainIds,
} from '../../../config/networks'

describe('membership reference chain (FR-001, FR-002)', () => {
  it('resolves to exactly one chain, and the same one every call', () => {
    expect(membershipChainId()).toBe(membershipChainId())
    expect(typeof membershipChainId()).toBe('number')
  })

  it('is the testnet reference chain in this (testnet) build, never a mainnet — SC-008', () => {
    expect(NETWORKS[getCurrentChainId()].isTestnet).toBe(true)
    expect(membershipChainId()).toBe(TESTNET_CHAIN_ID)
    expect(membershipChainId()).not.toBe(MAINNET_CHAIN_ID)
    expect(NETWORKS[membershipChainId()].isTestnet).toBe(true)
  })

  it('is one of the two declared reference chains, not an invented third', () => {
    expect([MAINNET_CHAIN_ID, TESTNET_CHAIN_ID]).toContain(membershipChainId())
  })

  it('always sits inside its own cohort, and says so loudly if it ever does not', () => {
    expect(isInCohort(membershipChainId())).toBe(true)
    expect(() => assertReferenceChainInCohort()).not.toThrow()
    expect(assertReferenceChainInCohort()).toBe(membershipChainId())
  })

  it('names Polygon on mainnet and Amoy on testnet — the pair, not a fresh literal', () => {
    expect(MAINNET_CHAIN_ID).toBe(137)
    expect(TESTNET_CHAIN_ID).toBe(80002)
  })
})

describe('environment cohort (FR-002, constitution III)', () => {
  it('contains only chains on this build\'s side of the testnet/mainnet boundary', () => {
    const ids = cohortChainIds()
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(NETWORKS[id].isTestnet).toBe(true)
  })

  it('never contains a mainnet in a testnet build — the leak constitution III forbids', () => {
    expect(cohortChainIds()).not.toContain(MAINNET_CHAIN_ID)
    expect(cohortChainIds()).not.toContain(1)
  })

  it('is a strict subset of the supported chains, never the whole list', () => {
    const all = listSupportedChainIds()
    const cohort = cohortChainIds()
    expect(cohort.length).toBeLessThan(all.length)
    for (const id of cohort) expect(all).toContain(id)
  })

  it('classifies every supported chain — no chain is in neither cohort', () => {
    for (const id of listSupportedChainIds()) {
      expect(typeof NETWORKS[id].isTestnet).toBe('boolean')
    }
  })

  it('isInCohort agrees with the roster in both directions', () => {
    const cohort = cohortChainIds()
    for (const id of listSupportedChainIds()) {
      expect(isInCohort(id)).toBe(cohort.includes(id))
    }
  })
})
