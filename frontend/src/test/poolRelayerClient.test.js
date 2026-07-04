import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makePoolRelayer } from '../lib/pools/relayerClient'

// US3 gasless relayer client (spec 034, no app backend by default): makePoolRelayer is a no-op when
// VITE_POOL_RELAYER_URL is unset (footprint stays at zero servers), and POSTs the right payload to the
// relayer when configured. global.fetch is mocked in src/test/setup.js; we override it per test.

const RELAYER_URL = 'https://relayer.example'
const POOL = '0x00000000000000000000000000000000000000aa'

function sampleAuthorization() {
  return {
    from: '0x00000000000000000000000000000000000000bb',
    to: POOL,
    value: 10_000_000n, // 10 USDC (6 decimals), as a bigint like gasless.js produces
    validAfter: 0,
    validBefore: 1_750_000_000,
    nonce: '0x' + '11'.repeat(32),
    v: 27,
    r: '0x' + '22'.repeat(32),
    s: '0x' + '33'.repeat(32),
  }
}

describe('pool relayer client (gas infra, optional)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns null (no-op) when VITE_POOL_RELAYER_URL is unset', () => {
    vi.stubEnv('VITE_POOL_RELAYER_URL', '')
    expect(makePoolRelayer(80002)).toBeNull()
  })

  it('POSTs the right payload and returns the txHash when configured', async () => {
    vi.stubEnv('VITE_POOL_RELAYER_URL', RELAYER_URL)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ txHash: '0xdeadbeef' }),
    })
    global.fetch = fetchMock

    const relayer = makePoolRelayer(80002)
    expect(typeof relayer).toBe('function')

    const res = await relayer(sampleAuthorization(), { pool: POOL })
    expect(res).toEqual({ txHash: '0xdeadbeef' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe(`${RELAYER_URL}/relay/pool-join`)
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')

    const sent = JSON.parse(opts.body)
    expect(sent.chainId).toBe(80002)
    expect(sent.pool).toBe(POOL)
    // The join is identity-free: no commitment is sent (membership is keyed by the authorization's `from`).
    expect(sent).not.toHaveProperty('identityCommitment')
    expect(sent.authorization).toEqual({
      from: '0x00000000000000000000000000000000000000bb',
      to: POOL,
      value: '10000000',
      validAfter: '0',
      validBefore: '1750000000',
      nonce: '0x' + '11'.repeat(32),
      v: 27,
      r: '0x' + '22'.repeat(32),
      s: '0x' + '33'.repeat(32),
    })
  })

  it('throws a clear error when the relayer rejects the request', async () => {
    vi.stubEnv('VITE_POOL_RELAYER_URL', RELAYER_URL)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'screened', message: 'sender failed sanctions screening' } }),
    })
    const relayer = makePoolRelayer(80002)
    await expect(relayer(sampleAuthorization(), { pool: POOL })).rejects.toThrow(
      /screened.*sanctions screening/i
    )
  })

  it('requires a chainId when relaying', async () => {
    vi.stubEnv('VITE_POOL_RELAYER_URL', RELAYER_URL)
    global.fetch = vi.fn()
    const relayer = makePoolRelayer(undefined)
    await expect(relayer(sampleAuthorization(), { pool: POOL })).rejects.toThrow(/chainId is required/i)
  })
})
