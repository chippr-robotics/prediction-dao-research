/**
 * Spec 073 T002 — the mini-app registry reference chain.
 *
 * `miniAppChainId()` decides which chain the host reads app approvals from, and an approval is
 * what licenses the host to fetch, hash-verify, and EXECUTE a package (FR-010/FR-011). So the
 * failure this file guards is not cosmetic: a build resolving the wrong side of the cohort
 * boundary would run mainnet-curated code against testnet wallets (or the reverse).
 *
 * THE TESTNET HOME IS MORDOR (63), NOT AMOY. The registry is deployed to **Polygon and Mordor
 * only**; Amoy is deliberately not a deployment target for spec 073. So unlike
 * `membershipChainId()`, this does NOT derive from `TESTNET_CHAIN_ID` — doing so would be the
 * more symmetrical code and the wrong answer, resolving every testnet build to a chain with no
 * registry address while a real one sat unread on Mordor.
 *
 * The load-bearing assertion is therefore no longer "derived from the pair" but the property that
 * actually protects the product, and which would have caught the Amoy mistake directly: **the
 * chain this resolves to must have a `miniAppRegistry` address**. A reference chain with no
 * contract on it is not a configuration detail — it is a catalog that can never load.
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
import { getContractAddressForChain } from '../config/contracts'

/** Mordor. Spelled out rather than imported, so a change to the source constant fails here. */
const MINIAPP_TESTNET_CHAIN_ID = 63

afterEach(() => vi.unstubAllEnvs())

/** Point the build at a chain so `buildIsTestnet()` resolves to that chain's cohort. */
function buildOn(chainId) {
  vi.stubEnv('VITE_NETWORK_ID', String(chainId))
}

describe('mini-app registry chain (spec 073 FR-025)', () => {
  it('resolves to Mordor in a testnet build — where the registry actually is', () => {
    expect(NETWORKS[getCurrentChainId()].isTestnet).toBe(true)
    expect(miniAppChainId()).toBe(MINIAPP_TESTNET_CHAIN_ID)
    expect(miniAppChainId()).not.toBe(MAINNET_CHAIN_ID)
    expect(NETWORKS[miniAppChainId()].isTestnet).toBe(true)
  })

  it('does NOT resolve to Amoy — Amoy is not a spec-073 deployment target', () => {
    // The bug this file exists to prevent: deriving from TESTNET_CHAIN_ID looks tidier and
    // sends every testnet build to a chain with no registry.
    expect(miniAppChainId()).not.toBe(TESTNET_CHAIN_ID)
  })

  it('resolves to Polygon in a mainnet build', () => {
    buildOn(MAINNET_CHAIN_ID)

    expect(NETWORKS[getCurrentChainId()].isTestnet).toBe(false)
    expect(miniAppChainId()).toBe(MAINNET_CHAIN_ID)
    expect(NETWORKS[miniAppChainId()].isTestnet).toBe(false)
  })

  it('follows the COHORT of any build chain, not the chain itself', () => {
    // ETC (61) belongs here, not below: Ethereum Classic is a MAINNET — Mordor is its testnet.
    for (const chainId of [1, 10, 61, 8453, 42161, MAINNET_CHAIN_ID]) {
      buildOn(chainId)
      expect(miniAppChainId()).toBe(MAINNET_CHAIN_ID)
    }
    // Amoy is a testnet-cohort chain that is not the reference chain; it must still resolve to
    // Mordor rather than to itself.
    for (const chainId of [63, TESTNET_CHAIN_ID]) {
      buildOn(chainId)
      expect(miniAppChainId()).toBe(MINIAPP_TESTNET_CHAIN_ID)
    }
  })

  it('never invents a third chain — always Polygon or Mordor', () => {
    for (const chainId of [MAINNET_CHAIN_ID, TESTNET_CHAIN_ID, 1, 61, 63]) {
      buildOn(chainId)
      expect([MAINNET_CHAIN_ID, MINIAPP_TESTNET_CHAIN_ID]).toContain(miniAppChainId())
    }
  })

  it('is stable and numeric — a launch check and a catalog read must agree', () => {
    expect(typeof miniAppChainId()).toBe('number')
    expect(miniAppChainId()).toBe(miniAppChainId())
  })
})

describe('the reference chain must actually carry the registry', () => {
  /*
   * The invariant that would have caught the Amoy mistake on its own. Everything else in this
   * file checks which number comes out; this checks that the number names a chain where the
   * catalog can load at all.
   */
  it('has a miniAppRegistry address in a testnet build', () => {
    const address = getContractAddressForChain('miniAppRegistry', miniAppChainId())
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('has a miniAppRegistry address in a mainnet build', () => {
    buildOn(MAINNET_CHAIN_ID)
    const address = getContractAddressForChain('miniAppRegistry', miniAppChainId())
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('holds for every build chain in either cohort', () => {
    for (const chainId of [1, 10, 61, 63, 8453, 42161, MAINNET_CHAIN_ID, TESTNET_CHAIN_ID]) {
      buildOn(chainId)
      expect(
        getContractAddressForChain('miniAppRegistry', miniAppChainId()),
        `build on ${chainId} resolves a registry chain with no deployment`,
      ).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
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

describe('relationship to the membership reference chain', () => {
  it('agrees with membershipChainId() on mainnet, and DIVERGES on testnet', () => {
    // They answer different questions — where membership is sold and read, versus where app
    // curation is governed — and are separate functions so a caller says which authority it
    // means. On a testnet build they now genuinely differ: membership lives on Amoy, the app
    // registry on Mordor. This assertion pins that divergence as DELIBERATE, so a future
    // "simplification" that aliases the two fails here instead of in the catalog.
    expect(membershipChainId()).toBe(TESTNET_CHAIN_ID)
    expect(miniAppChainId()).toBe(MINIAPP_TESTNET_CHAIN_ID)
    expect(miniAppChainId()).not.toBe(membershipChainId())

    buildOn(MAINNET_CHAIN_ID)
    expect(miniAppChainId()).toBe(membershipChainId())
  })
})
