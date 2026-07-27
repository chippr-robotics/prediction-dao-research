// Spec 069 — the provider factory every read in the app goes through.
//
// The claim being tested is the one that matters to a member: configure an endpoint in
// Network settings and the app's lookups actually take it, with the API key on the request
// and the failover behind it. ethers is mocked locally (the global setup mock ignores
// constructor arguments, which is exactly what these assertions need to see).

import { describe, it, expect, beforeEach, vi } from 'vitest'

const constructed = []

vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers')
  class MockFetchRequest {
    constructor(url) {
      this.url = url
      this.headers = {}
    }
    setHeader(name, value) {
      this.headers[name] = value
    }
  }
  class MockJsonRpcProvider {
    constructor(target, network, options) {
      this.target = target
      this.network = network
      this.options = options
      constructed.push({ kind: 'json-rpc', target, network, options })
    }
  }
  class MockFallbackProvider {
    constructor(configs, network, options) {
      this.configs = configs
      this.network = network
      this.options = options
      constructed.push({ kind: 'fallback', configs, network, options })
    }
  }
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      FetchRequest: MockFetchRequest,
      JsonRpcProvider: MockJsonRpcProvider,
      FallbackProvider: MockFallbackProvider,
      Network: actual.ethers.Network,
    },
  }
})

const { AUTH_MODES, saveEndpointSettings, __resetEndpointStoreForTests } = await import(
  '../../lib/network/endpointStore'
)
const { makeReadProvider, getReadProvider, chainNeedsUnbatchedRpc } = await import(
  '../../utils/rpcProvider'
)
const { NETWORKS } = await import('../../config/networks')

const MEMBER_RPC = 'https://polygon-mainnet.g.alchemy.com/v2/member-key'
const MEMBER_FAILOVER = 'https://polygon.drpc.org'

describe('makeReadProvider — member endpoints', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetEndpointStoreForTests()
    constructed.length = 0
  })

  it('uses the caller-supplied default when the member has configured nothing', () => {
    makeReadProvider(NETWORKS[137].rpcUrl, 137)
    expect(constructed).toHaveLength(1)
    expect(constructed[0]).toMatchObject({ kind: 'json-rpc', target: NETWORKS[137].rpcUrl })
  })

  it('overrides the caller-supplied URL with the member endpoint', () => {
    saveEndpointSettings(137, { url: MEMBER_RPC, failoverUrl: MEMBER_FAILOVER })
    makeReadProvider(NETWORKS[137].rpcUrl, 137)

    const fallbackCall = constructed.find((c) => c.kind === 'fallback')
    expect(fallbackCall).toBeTruthy()
    // Quorum 1: the failover answers as soon as the primary stalls or errors.
    expect(fallbackCall.options).toMatchObject({ quorum: 1 })
    expect(fallbackCall.configs.map((c) => c.provider.target)).toEqual([
      MEMBER_RPC,
      MEMBER_FAILOVER,
    ])
    expect(fallbackCall.configs[0].priority).toBeLessThan(fallbackCall.configs[1].priority)
  })

  it('puts the API key in a request header, never in the URL', () => {
    saveEndpointSettings(137, {
      url: MEMBER_RPC,
      authMode: AUTH_MODES.HEADER,
      authHeaderName: 'x-api-key',
      authToken: 'member-token',
    })
    makeReadProvider(NETWORKS[137].rpcUrl, 137)

    const primary = constructed.find((c) => c.kind === 'json-rpc' && c.target?.headers)
    expect(primary.target.headers).toEqual({ 'x-api-key': 'member-token' })
    expect(primary.target.url).toBe(MEMBER_RPC)
  })

  it('keeps the unbatched-RPC workaround on ETC-family chains with a member endpoint', () => {
    saveEndpointSettings(63, { url: 'https://mordor.rpc.example.rivet.link/x' })
    makeReadProvider(NETWORKS[63].rpcUrl, 63)
    expect(chainNeedsUnbatchedRpc(63)).toBe(true)
    expect(constructed.some((c) => c.options?.batchMaxCount === 1)).toBe(true)
  })

  it('getReadProvider resolves the endpoint itself', () => {
    saveEndpointSettings(137, { url: MEMBER_RPC })
    expect(getReadProvider(137)).toBeTruthy()
    expect(constructed.some((c) => c.kind === 'fallback')).toBe(true)
    // A chain with no endpoint at all yields null rather than a broken provider.
    expect(getReadProvider(999999)).toBeNull()
  })
})
