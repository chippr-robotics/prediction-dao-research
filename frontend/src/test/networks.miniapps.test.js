/**
 * Spec 073 T002 — the mini-app registry reference chain.
 *
 * `miniAppChainId()` decides which chain the host reads app approvals from, and an approval is
 * what licenses the host to fetch, hash-verify, and EXECUTE a package (FR-010/FR-011). So the
 * failure this file guards is not cosmetic: a build resolving the wrong side of the cohort
 * boundary would run mainnet-curated code against testnet wallets (or the reverse).
 *
 * The requirement behind the assertions is "derived from the MAINNET_CHAIN_ID/TESTNET_CHAIN_ID
 * pair, never a second literal" (research R5). A literal cannot be tested for directly, so both
 * cohort branches are exercised instead: only a derivation gives the right answer in both.
 *
 * The test process runs with VITE_NETWORK_ID=63 (Mordor) per frontend/vite.config.js, so this
 * build is a TESTNET build by default; the mainnet branch is reached by stubbing that env var,
 * which is read at call time by `getCurrentChainId()` (not frozen at module load).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  miniAppChainId,
  membershipChainId,
  isInCohort,
  NETWORKS,
  MAINNET_CHAIN_ID,
  TESTNET_CHAIN_ID,
  getCurrentChainId,
} from '../config/networks'

afterEach(() => vi.unstubAllEnvs())

/** Point the build at a chain so `buildIsTestnet()` resolves to that chain's cohort. */
function buildOn(chainId) {
  vi.stubEnv('VITE_NETWORK_ID', String(chainId))
}

describe('mini-app registry chain (spec 073 FR-025)', () => {
  it('resolves to the testnet reference chain in a testnet build', () => {
    // Default test env (Mordor, 63) — a testnet chain that is NOT itself the reference chain,
    // which is the interesting case: the answer must be the cohort's reference chain, not
    // whatever chain the build happens to point at.
    expect(NETWORKS[getCurrentChainId()].isTestnet).toBe(true)
    expect(miniAppChainId()).toBe(TESTNET_CHAIN_ID)
    expect(miniAppChainId()).not.toBe(MAINNET_CHAIN_ID)
    expect(NETWORKS[miniAppChainId()].isTestnet).toBe(true)
  })

  it('resolves to the mainnet reference chain in a mainnet build', () => {
    buildOn(MAINNET_CHAIN_ID)

    expect(NETWORKS[getCurrentChainId()].isTestnet).toBe(false)
    expect(miniAppChainId()).toBe(MAINNET_CHAIN_ID)
    expect(miniAppChainId()).not.toBe(TESTNET_CHAIN_ID)
    expect(NETWORKS[miniAppChainId()].isTestnet).toBe(false)
  })

  it('follows the cohort of any build chain, mainnet or testnet — the derivation, not a literal', () => {
    // Ethereum (1) and Optimism (10) are mainnets that are not the reference chain; Amoy (80002)
    // and Mordor (63) are the testnet side. A hardcoded value would fail at least one of these.
    for (const chainId of [1, 10, 8453, 42161, 61, MAINNET_CHAIN_ID]) {
      buildOn(chainId)
      expect(miniAppChainId()).toBe(MAINNET_CHAIN_ID)
    }
    for (const chainId of [63, TESTNET_CHAIN_ID]) {
      buildOn(chainId)
      expect(miniAppChainId()).toBe(TESTNET_CHAIN_ID)
    }
  })

  it('never invents a third chain — it is always one of the declared pair', () => {
    for (const chainId of [MAINNET_CHAIN_ID, TESTNET_CHAIN_ID, 1, 63]) {
      buildOn(chainId)
      expect([MAINNET_CHAIN_ID, TESTNET_CHAIN_ID]).toContain(miniAppChainId())
    }
  })

  it('is stable and numeric — a launch check and a catalog read must agree', () => {
    expect(typeof miniAppChainId()).toBe('number')
    expect(miniAppChainId()).toBe(miniAppChainId())
  })
})

describe('the registry chain is always inside this build\'s cohort (constitution III)', () => {
  it('sits in cohort in a testnet build', () => {
    expect(isInCohort(miniAppChainId())).toBe(true)
  })

  it('sits in cohort in a mainnet build', () => {
    buildOn(MAINNET_CHAIN_ID)
    expect(isInCohort(miniAppChainId())).toBe(true)
  })

  it('sits in cohort whichever chain the build points at', () => {
    for (const chainId of [1, 10, 61, 63, 8453, 42161, MAINNET_CHAIN_ID, TESTNET_CHAIN_ID]) {
      buildOn(chainId)
      expect(isInCohort(miniAppChainId())).toBe(true)
    }
  })
})

describe('shared derivation with the membership reference chain (research R5)', () => {
  it('agrees with membershipChainId() in both cohorts', () => {
    // Not a claim that the two are the same CONCEPT — they answer different questions and are
    // separate functions so callers can say which authority they mean. They agree because both
    // derive from the one MAINNET_CHAIN_ID/TESTNET_CHAIN_ID pair, and that agreement is exactly
    // what proves no second chain-id literal was introduced for mini-apps. A future, deliberate
    // split of the two chains would change this expectation on purpose.
    expect(miniAppChainId()).toBe(membershipChainId())

    buildOn(MAINNET_CHAIN_ID)
    expect(miniAppChainId()).toBe(membershipChainId())
  })
})
