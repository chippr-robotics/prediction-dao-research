/**
 * Passkey network support — the joined gate (spec 041 FR-004/FR-022).
 *
 * These tests pin the two properties that keep multi-network passkey support honest:
 *   1. A network is "supported" only when BOTH halves are real — a bundler to relay the UserOp
 *      AND a deployed account factory to create the account. Either half alone renders a login
 *      button that fails, just at a different step.
 *   2. Declaring a `passkey` block on every EVM network (so ops can enable one with an env var
 *      instead of a code change) does NOT turn anything on by itself.
 *
 * The on-chain prerequisites behind (2) — EntryPoint v0.6 and the Arachnid CREATE2 proxy on all
 * ten EVM networks — are verified against live chains by `scripts/ops/verify-passkey-support.js`,
 * not here; a unit test cannot assert chain state.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

import { NETWORKS, getNetwork } from '../networks'
import { getContractAddressForChain } from '../contracts'
import { getPasskeySupport, isPasskeySupported, getPasskeyNetworks } from '../passkeySupport'
import { getNetworkFeatures } from '../networkCapabilities'

vi.mock('../contracts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getContractAddressForChain: vi.fn(actual.getContractAddressForChain) }
})

const EVM_CHAIN_IDS = Object.values(NETWORKS).map((n) => n.chainId)
const FACTORY = '0xd519C25e9dEd0DAC586B764574100479CB318734'
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'

/** Pretend the account stack is deployed on `chainId` (and nowhere else). */
const withStackOn = (chainId) =>
  getContractAddressForChain.mockImplementation((name, id) => {
    if (id !== chainId) return undefined
    if (name === 'accountFactory') return FACTORY
    if (name === 'entryPoint') return ENTRY_POINT
    return undefined
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('per-network passkey config (spec 041)', () => {
  it('declares a passkey block on every EVM network so enabling one is config, not code', () => {
    // `passkey` resolving to null under the test env is the POINT — the block is a switch, and
    // the switch is off. What matters is that no network is hardcoded out of passkey support.
    for (const id of EVM_CHAIN_IDS) {
      const net = getNetwork(id)
      expect(net.capabilities).toHaveProperty('passkeyAccounts')
      // Never a literal: the capability must track the network's own config.
      expect(net.capabilities.passkeyAccounts).toBe(Boolean(net.passkey))
    }
  })

  it('keeps every network off by default — no bundler configured in this build', () => {
    for (const id of EVM_CHAIN_IDS) {
      expect(getNetwork(id).capabilities.passkeyAccounts).toBe(false)
      expect(isPasskeySupported(id)).toBe(false)
    }
  })
})

/** Pretend `chainId` has a bundler configured, as an env var would at build time. */
const withBundlerOn = (chainId) =>
  vi.spyOn(getNetwork(chainId), 'passkey', 'get').mockReturnValue({
    bundlerUrls: ['https://bundler.example'],
    sponsorPaymasterUrl: null,
  })

describe('getPasskeySupport — both halves required', () => {
  it('refuses a chain with a bundler but no deployed factory, and says which half is missing', () => {
    // Polygon has the factory in the real config; pretend the stack is deployed nowhere.
    getContractAddressForChain.mockReturnValue(undefined)
    withBundlerOn(137)

    const support = getPasskeySupport(137)
    expect(support.supported).toBe(false)
    expect(support.bundlerConfigured).toBe(true)
    expect(support.stackDeployed).toBe(false)
    expect(support.reason).toMatch(/not deployed on this network/i)
  })

  it('supports a chain only when both halves are present', () => {
    withStackOn(137)
    withBundlerOn(137)
    expect(isPasskeySupported(137)).toBe(true)
    // …and the same build still refuses a chain that has only one half.
    withBundlerOn(8453)
    expect(isPasskeySupported(8453)).toBe(false)
  })

  it('refuses a chain with a deployed factory but no bundler, and says so distinctly', () => {
    withStackOn(137)
    const support = getPasskeySupport(137) // no bundler env in the test build
    expect(support.supported).toBe(false)
    expect(support.stackDeployed).toBe(true)
    expect(support.bundlerConfigured).toBe(false)
    expect(support.reason).toMatch(/not enabled on this network/i)
  })

  it('never inherits the default network’s answer for an unknown chain id', () => {
    // getNetwork falls back to the default network for unknown ids; a naive gate would report
    // Polygon's support for chain 999999.
    withStackOn(137)
    const support = getPasskeySupport(999999)
    expect(support.supported).toBe(false)
    expect(support.reason).toMatch(/network/i)
  })

  it('reports no support for non-EVM (Bitcoin) network ids instead of coercing them', () => {
    const support = getPasskeySupport('bitcoin')
    expect(support.supported).toBe(false)
    expect(support.reason).toMatch(/EVM/i)
  })

  it('lists only genuinely usable networks, mainnets first', () => {
    getContractAddressForChain.mockReturnValue(undefined)
    expect(getPasskeyNetworks()).toEqual([])

    // Enable a testnet and a mainnet; the mainnet must read first.
    getContractAddressForChain.mockImplementation((name, id) => {
      if (![137, 80002].includes(id)) return undefined
      if (name === 'accountFactory') return FACTORY
      if (name === 'entryPoint') return ENTRY_POINT
      return undefined
    })
    withBundlerOn(137)
    withBundlerOn(80002)
    expect(getPasskeyNetworks().map((n) => n.chainId)).toEqual([137, 80002])
  })
})

describe('Network tab disclosure', () => {
  it('tags Passkey Accounts as undeployed while either half is missing', () => {
    withStackOn(137) // stack deployed, still no bundler
    const feature = getNetworkFeatures(137).find((f) => f.key === 'passkeyAccounts')
    expect(feature).toBeDefined()
    expect(feature.deployed).toBe(false)
  })

  it('reports every EVM feature as undeployed on a Bitcoin network id (boundary guard)', () => {
    const feature = getNetworkFeatures('bitcoin').find((f) => f.key === 'passkeyAccounts')
    expect(feature.deployed).toBe(false)
  })
})
