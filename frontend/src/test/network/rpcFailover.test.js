/**
 * QuickNode-primary / publicnode-failover generalization (release 1.14.0 task 8).
 *
 * Before this change only Ethereum Classic (61) declared `NETWORKS[chainId].rpcFailoverUrl`; every
 * other chain's `rpcUrl` had no build-curated failover behind it, so a deploy-time `VITE_RPC_URL_*`
 * override (a keyed QuickNode endpoint) going dark left that chain with no fallback route at all.
 *
 * This asserts two things, per spec 069's own precedence:
 *   1. every EVM mainnet the app supports declares a `rpcFailoverUrl` distinct from its committed
 *      `rpcUrl` default (real redundancy exists even before any env override is set — mirrors the
 *      relay-gateway's own public-primary/drpc-secondary pair for Polygon)
 *   2. `VITE_RPC_URL_<CHAIN>` / `VITE_RPC_URL_<CHAIN>_FAILOVER` env overrides thread through
 *      `resolveRpcEndpoints` (member-override precedence — spec 069 — is untouched by any of this)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// The EVM mainnets this feature covers (release notes: 1, 10, 137, 8453, 42161). ETC (61) already
// had its own failover before this task and is asserted separately below; testnets/Mordor are
// deliberately out of scope (no QuickNode-primary rollout planned there).
const COVERED_MAINNETS = {
  1: { rpcVar: 'VITE_RPC_URL_MAINNET', failoverVar: 'VITE_RPC_URL_MAINNET_FAILOVER' },
  10: { rpcVar: 'VITE_RPC_URL_OPTIMISM', failoverVar: 'VITE_RPC_URL_OPTIMISM_FAILOVER' },
  137: { rpcVar: 'VITE_RPC_URL_POLYGON', failoverVar: 'VITE_RPC_URL_POLYGON_FAILOVER' },
  8453: { rpcVar: 'VITE_RPC_URL_BASE', failoverVar: 'VITE_RPC_URL_BASE_FAILOVER' },
  42161: { rpcVar: 'VITE_RPC_URL_ARBITRUM', failoverVar: 'VITE_RPC_URL_ARBITRUM_FAILOVER' },
}

describe('every covered EVM mainnet declares a distinct build-level failover', () => {
  it.each(Object.keys(COVERED_MAINNETS).map(Number))('chain %i', async (chainId) => {
    const { NETWORKS } = await import('../../config/networks')
    const net = NETWORKS[chainId]
    expect(net.rpcUrl, `chain ${chainId} rpcUrl`).toBeTruthy()
    expect(net.rpcFailoverUrl, `chain ${chainId} rpcFailoverUrl`).toBeTruthy()
    expect(net.rpcFailoverUrl, `chain ${chainId} failover must differ from primary`).not.toBe(net.rpcUrl)
  })

  it('ETC (61) keeps its pre-existing failover unchanged', async () => {
    const { NETWORKS } = await import('../../config/networks')
    expect(NETWORKS[61].rpcFailoverUrl).toBe('https://etc.etcdesktop.com')
  })
})

describe('env overrides thread through the primary AND the failover, per chain', () => {
  for (const [chainIdStr, { rpcVar, failoverVar }] of Object.entries(COVERED_MAINNETS)) {
    const chainId = Number(chainIdStr)

    it(`chain ${chainId}: ${rpcVar} overrides rpcUrl only`, async () => {
      vi.resetModules()
      vi.stubEnv(rpcVar, 'https://keyed.example.invalid/quicknode-token')
      const { NETWORKS } = await import('../../config/networks')
      expect(NETWORKS[chainId].rpcUrl).toBe('https://keyed.example.invalid/quicknode-token')
      // The failover default is untouched by the primary override — that is the whole point.
      expect(NETWORKS[chainId].rpcFailoverUrl).not.toBe('https://keyed.example.invalid/quicknode-token')
    })

    it(`chain ${chainId}: ${failoverVar} overrides rpcFailoverUrl only`, async () => {
      vi.resetModules()
      vi.stubEnv(failoverVar, 'https://custom-failover.example.invalid')
      const { NETWORKS } = await import('../../config/networks')
      expect(NETWORKS[chainId].rpcFailoverUrl).toBe('https://custom-failover.example.invalid')
    })

    it(`chain ${chainId}: resolveRpcEndpoints surfaces the keyed primary with the failover behind it`, async () => {
      vi.resetModules()
      vi.stubEnv(rpcVar, 'https://keyed.example.invalid/quicknode-token')
      const { NETWORKS } = await import('../../config/networks')
      const { resolveRpcEndpoints } = await import('../../lib/network/rpcEndpoints')
      const route = resolveRpcEndpoints(chainId)
      expect(route.source).toBe('default')
      expect(route.primary.url).toBe('https://keyed.example.invalid/quicknode-token')
      expect(route.failover.url).toBe(NETWORKS[chainId].rpcFailoverUrl)
    })
  }
})

describe('member override precedence is unaffected (spec 069)', () => {
  it('a member endpoint still wins over both the build default and its failover', async () => {
    vi.resetModules()
    const { NETWORKS } = await import('../../config/networks')
    const { resolveRpcEndpoints } = await import('../../lib/network/rpcEndpoints')
    const { saveEndpointSettings, __resetEndpointStoreForTests } = await import(
      '../../lib/network/endpointStore'
    )
    localStorage.clear()
    __resetEndpointStoreForTests()
    try {
      saveEndpointSettings(137, { url: 'https://member.example.invalid/rpc' })
      const route = resolveRpcEndpoints(137)
      expect(route.source).toBe('member')
      expect(route.primary.url).toBe('https://member.example.invalid/rpc')
      // Behind the member's own endpoint sits the build default (unchanged pre-069 behavior),
      // never the build's curated rpcFailoverUrl directly — this task does not alter that layer.
      expect(route.failover.url).toBe(NETWORKS[137].rpcUrl)
    } finally {
      localStorage.clear()
      __resetEndpointStoreForTests()
    }
  })
})
