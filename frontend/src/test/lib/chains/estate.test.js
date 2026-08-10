/**
 * Spec 071 T015 + T016 — the estate read helper.
 *
 * Two things are load-bearing here and get the most attention:
 *   • one dead or slow endpoint must not take the others down (FR-015), and
 *   • the roster must never leave the build's cohort (FR-002).
 *
 * T016's source-level check lives at the bottom: it asserts the spec-069 provider bypass this
 * helper used to carry cannot come back, which no behavioural test can catch.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAcrossEstate, estateNetworks, readProviderFor, networkName } from '../../../lib/chains/estate'
import { isRead, isNotDeployed, isUnreadable } from '../../../lib/chains/chainReadResult'
import { cohortChainIds, isInCohort, NETWORKS } from '../../../config/networks'

const COHORT = cohortChainIds()
const A = COHORT[0]
const B = COHORT[1]

const byChain = (id) => (r) => r.chainId === id

describe('estateNetworks — the roster is cohort-bounded (FR-002)', () => {
  it('lists only chains in this build\'s cohort', () => {
    for (const net of estateNetworks()) expect(isInCohort(net.chainId)).toBe(true)
  })

  it('never contains a mainnet in this testnet build', () => {
    for (const net of estateNetworks()) expect(net.isTestnet).toBe(true)
  })

  it('narrows by capability without leaving the cohort', () => {
    for (const net of estateNetworks('dex')) {
      expect(isInCohort(net.chainId)).toBe(true)
      expect(Boolean(net.capabilities?.dex)).toBe(true)
    }
  })
})

describe('readAcrossEstate — one broken chain never takes the others down (FR-015)', () => {
  it('reports a rejected read as unreadable with a reason, while its siblings resolve', async () => {
    const results = await readAcrossEstate({
      chainIds: [A, B],
      addressFor: () => '0x1111111111111111111111111111111111111111',
      read: ({ chainId }) => (chainId === A ? Promise.reject(new Error('endpoint down')) : Promise.resolve(7n)),
      walletChainId: A,
      walletProvider: {},
    })

    const failed = results.find(byChain(A))
    const ok = results.find(byChain(B))
    expect(isUnreadable(failed)).toBe(true)
    expect(failed.reason).toContain('endpoint down')
    expect(failed.value).toBeUndefined() // never a zero
    expect(isRead(ok)).toBe(true)
    expect(ok.value).toBe(7n)
  })

  it('never rejects, even when every chain fails', async () => {
    const results = await readAcrossEstate({
      chainIds: [A, B],
      addressFor: () => '0x1111111111111111111111111111111111111111',
      read: () => Promise.reject(new Error('all down')),
      walletChainId: A,
      walletProvider: {},
    })
    expect(results).toHaveLength(2)
    expect(results.every(isUnreadable)).toBe(true)
  })

  it('does not delay a fast chain behind a slow one — the fast result is available first', async () => {
    const order = []
    const p = readAcrossEstate({
      chainIds: [A, B],
      addressFor: () => '0x1111111111111111111111111111111111111111',
      read: ({ chainId }) =>
        chainId === A
          ? new Promise((res) => setTimeout(() => { order.push(A); res(1n) }, 40))
          : Promise.resolve().then(() => { order.push(B); return 2n }),
      walletChainId: A,
      walletProvider: {},
    })
    await p
    // B settled before A despite being listed second: the reads are concurrent, not sequential.
    expect(order).toEqual([B, A])
  })

  it('reports a chain with no address as not-deployed — a definite answer, not a failure', async () => {
    const results = await readAcrossEstate({
      chainIds: [A, B],
      addressFor: (id) => (id === A ? '' : '0x1111111111111111111111111111111111111111'),
      read: () => Promise.resolve(1n),
      walletChainId: B,
      walletProvider: {},
    })
    expect(isNotDeployed(results.find(byChain(A)))).toBe(true)
    expect(isRead(results.find(byChain(B)))).toBe(true)
  })

  it('drops chains outside the cohort rather than reading them (FR-002)', async () => {
    const outsider = 137 // mainnet Polygon, not in this testnet build's cohort
    expect(isInCohort(outsider)).toBe(false)
    const read = vi.fn(() => Promise.resolve(1n))
    const results = await readAcrossEstate({
      chainIds: [A, outsider],
      addressFor: () => '0x1111111111111111111111111111111111111111',
      read,
      walletChainId: A,
      walletProvider: {},
    })
    expect(results.map((r) => r.chainId)).toEqual([A])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('defaults to the whole cohort when no chainIds are given', async () => {
    const results = await readAcrossEstate({
      addressFor: () => '',
      read: () => Promise.resolve(1n),
    })
    expect(results.map((r) => r.chainId).sort()).toEqual([...COHORT].sort())
  })
})

describe('readProviderFor', () => {
  it('reuses the wallet provider when the scope IS the connected chain', () => {
    const wallet = { __wallet: true }
    expect(readProviderFor(A, A, wallet)).toBe(wallet)
  })

  it('refuses a chain outside the cohort for estate reads', () => {
    expect(readProviderFor(137, A, null)).toBeNull()
  })

  it('allows an out-of-cohort chain only when a caller opts out explicitly (spec-067 tabs)', () => {
    // Does not assert a provider is returned — only that the cohort check is what was bypassed.
    expect(() => readProviderFor(137, A, null, { requireCohort: false })).not.toThrow()
  })
})

describe('networkName', () => {
  it('names a known chain and gives an honest placeholder for an unknown one', () => {
    expect(networkName(A)).toBe(NETWORKS[A].name)
    expect(networkName(999999)).toBe('Chain 999999')
  })
})

// ── T016: the spec-069 bypass must not come back ────────────────────────────────────────────
// This helper previously built providers from `NETWORKS[chainId].rpcUrl`, which skipped
// `resolveRpcEndpoints` and so ignored the member's endpoint override and failover. Nothing
// observable in a unit test distinguishes that from the fixed version, so it is pinned at the
// source level instead.
describe('estate.js provider sourcing (spec 069)', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../lib/chains/estate.js'),
    'utf8',
  )
  // Comments stripped first: the file's own header explains the bypass it must not contain, and
  // a guard that trips on its own documentation would just get the documentation deleted.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('resolves providers through getReadProvider', () => {
    expect(code).toContain('getReadProvider')
  })

  it('never reads an rpcUrl out of the network config', () => {
    expect(code).not.toMatch(/NETWORKS\[[^\]]*\]\??\.rpcUrl/)
    expect(code).not.toContain('makeReadProvider')
  })
})
