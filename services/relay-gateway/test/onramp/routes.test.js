/**
 * /v1/onramp/* buy-crypto proxy tests (spec 060 — contracts/gateway-api.md).
 * The Coinbase upstream is mocked via the injectable onrampFetch (JWT generation stubbed through
 * the injectable onrampClient where full control is needed); everything else uses the same
 * build-the-app-with-injected-deps pattern as polymarket.test.js.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server.js'
import { createKillSwitch } from '../../src/policy/killswitch.js'
import { createOnrampClient, normalizeBuyOptions, OnrampUnavailableError } from '../../src/onramp/client.js'
import { slugForChain } from '../../src/onramp/chains.js'
import { screeningChainFor } from '../../src/onramp/routes.js'
import { testConfig, mockProviders, mockEngine, ORIGIN_SECRET } from '../helpers.js'

const DEST = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

// Coinbase Buy Options catalog shape (purchase_currencies[].networks[].name is the slug).
const OPTIONS_BODY = {
  payment_currencies: [{ id: 'USD' }],
  purchase_currencies: [
    { symbol: 'USDC', networks: [{ name: 'polygon' }, { name: 'ethereum' }, { name: 'base' }] },
    { symbol: 'ETH', networks: [{ name: 'ethereum' }] },
    { symbol: 'MATIC', networks: [{ name: 'polygon' }] },
    { junk: true }, // unusable -> dropped, never 500s
  ],
}
const TOKEN_BODY = { token: 'sess-token-123', channel_id: '' }

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

/** Mocked Coinbase fetch: GET buy/options + POST token, recording calls. */
function mockCoinbaseFetch({ optionsBody = OPTIONS_BODY, optionsStatus = 200, tokenBody = TOKEN_BODY, tokenStatus = 200 } = {}) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null, headers: init.headers })
    if (String(url).includes('/onramp/v1/buy/options')) return jsonRes(optionsBody, optionsStatus)
    if (String(url).includes('/onramp/v1/token')) return jsonRes(tokenBody, tokenStatus)
    return jsonRes({ error: 'unexpected path' }, 500)
  }
  impl.calls = calls
  return impl
}

/** App with CDP creds configured and the Coinbase upstream + JWT mocked. */
function onrampApp({ env = {}, fetchImpl = mockCoinbaseFetch(), providerOpts = {}, killSwitch } = {}) {
  const config = testConfig({ CDP_API_KEY_ID: 'test-key-id', CDP_API_KEY_SECRET: 'test-key-secret', ...env })
  const client = createOnrampClient({ ...config.onramp, fetchImpl, generateJwtImpl: async () => 'test-jwt' })
  const { app } = createApp(config, {
    providers: mockProviders(config, providerOpts),
    engineClient: mockEngine(),
    onrampClient: client,
    ...(killSwitch ? { killSwitch } : {}),
  })
  return { app, config, fetchImpl }
}

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)
const post = (app, path, body) => request(app).post(path).set('X-Origin-Auth', ORIGIN_SECRET).send(body)

describe('onramp unit pieces', () => {
  it('slugForChain maps only onrampable mainnets', () => {
    expect(slugForChain(137)).toBe('polygon')
    expect(slugForChain(1)).toBe('ethereum')
    for (const id of [61, 63, 80002, 11155111, 560048, 1337, 0, NaN]) expect(slugForChain(id)).toBe(null)
  })

  it('normalizeBuyOptions groups tickers by slug, dedups, and drops junk', () => {
    const bySlug = normalizeBuyOptions({
      purchase_currencies: [
        { symbol: 'usdc', networks: [{ name: 'Polygon' }, { name: 'polygon' }] },
        { symbol: 'ETH', networks: [{ name: 'ethereum' }] },
        { networks: [{ name: 'polygon' }] }, // no symbol -> dropped
        { symbol: 'X', networks: 'junk' }, // bad networks -> dropped
      ],
    })
    expect(bySlug).toEqual({ polygon: ['USDC'], ethereum: ['ETH'] })
    expect(normalizeBuyOptions(null)).toEqual({})
  })

  it('screeningChainFor prefers the requested chain, falls back to an enabled guard, else null', () => {
    const config = testConfig()
    expect(screeningChainFor(config, 137)).toBe(137)
    // Ethereum mainnet is not gateway-enabled -> screened via the first enabled guard chain.
    expect(config.chains[1]).toBeUndefined()
    expect(config.enabledChainIds).toContain(screeningChainFor(config, 1))
    expect(screeningChainFor({ chains: {}, enabledChainIds: [] }, 1)).toBe(null)
  })
})

describe('GET /v1/onramp/options', () => {
  it('returns availability + assets for a mapped chain (200)', async () => {
    const { app } = onrampApp()
    const res = await get(app, '/v1/onramp/options?chainId=137')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ chainId: 137, available: true, defaultAsset: 'USDC' })
    expect(res.body.assets).toEqual(['MATIC', 'USDC'])
    expect(res.body.stale).toBe(false)
  })

  it('falls back to the first available asset when USDC is not deliverable', async () => {
    const fetchImpl = mockCoinbaseFetch({
      optionsBody: { purchase_currencies: [{ symbol: 'ETH', networks: [{ name: 'polygon' }] }] },
    })
    const { app } = onrampApp({ fetchImpl })
    const res = await get(app, '/v1/onramp/options?chainId=137')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ available: true, assets: ['ETH'], defaultAsset: 'ETH' })
  })

  it('400 unsupported_chain for testnets, unmapped chains, and garbage', async () => {
    const { app } = onrampApp()
    for (const chainId of ['80002', '63', '61', '999', 'abc', '']) {
      const res = await get(app, `/v1/onramp/options?chainId=${chainId}`)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('unsupported_chain')
    }
  })

  it('serves the cached catalog and marks it stale when the upstream starts failing', async () => {
    let failing = false
    const inner = mockCoinbaseFetch()
    const fetchImpl = async (url, init) => {
      if (failing) throw new Error('ECONNRESET')
      return inner(url, init)
    }
    const { app } = onrampApp({ fetchImpl, env: { ONRAMP_OPTIONS_CACHE_TTL_MS: '0' } })
    expect((await get(app, '/v1/onramp/options?chainId=137')).body.stale).toBe(false)
    failing = true
    const res = await get(app, '/v1/onramp/options?chainId=137')
    expect(res.status).toBe(200)
    expect(res.body.stale).toBe(true)
    expect(res.body.available).toBe(true)
  })

  it('502 upstream_error when the upstream fails with nothing cached', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNRESET')
    }
    const { app } = onrampApp({ fetchImpl })
    const res = await get(app, '/v1/onramp/options?chainId=137')
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('upstream_error')
  })
})

describe('POST /v1/onramp/session', () => {
  it('mints a session and returns the finished hosted URL (200)', async () => {
    const fetchImpl = mockCoinbaseFetch()
    const { app } = onrampApp({ fetchImpl })
    const res = await post(app, '/v1/onramp/session', { address: DEST, chainId: 137, asset: 'USDC' })
    expect(res.status).toBe(200)
    expect(res.body.url).toBe(
      'https://pay.coinbase.com/buy/select-asset?sessionToken=sess-token-123&defaultNetwork=polygon&defaultAsset=USDC'
    )
    // The mint carried exactly one destination scoped to the chain's slug + requested asset.
    const mint = fetchImpl.calls.find((c) => c.url.includes('/onramp/v1/token'))
    expect(mint.method).toBe('POST')
    expect(mint.body).toEqual({ addresses: [{ address: DEST, blockchains: ['polygon'] }], assets: ['USDC'] })
    expect(mint.headers.authorization).toBe('Bearer test-jwt')
  })

  it('validation order: invalid_address -> unsupported_chain -> unsupported_asset', async () => {
    const { app } = onrampApp()
    let res = await post(app, '/v1/onramp/session', { address: 'nope', chainId: 80002, asset: '??' })
    expect(res.body.error.code).toBe('invalid_address')
    res = await post(app, '/v1/onramp/session', { address: DEST, chainId: 80002, asset: '??' })
    expect(res.body.error.code).toBe('unsupported_chain')
    res = await post(app, '/v1/onramp/session', { address: DEST, chainId: 137, asset: '??' })
    expect(res.body.error.code).toBe('unsupported_asset')
  })

  it('403 screened for a sanctioned destination; no mint happens', async () => {
    const fetchImpl = mockCoinbaseFetch()
    const { app } = onrampApp({ fetchImpl, providerOpts: { allowed: false } })
    const res = await post(app, '/v1/onramp/session', { address: DEST, chainId: 137, asset: 'USDC' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('screened')
    expect(fetchImpl.calls.some((c) => c.url.includes('/onramp/v1/token'))).toBe(false)
  })

  it('503 screening_unavailable when the guard errors (fail closed), and no mint happens', async () => {
    const fetchImpl = mockCoinbaseFetch()
    const { app } = onrampApp({ fetchImpl, providerOpts: { screenError: true } })
    const res = await post(app, '/v1/onramp/session', { address: DEST, chainId: 137, asset: 'USDC' })
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('screening_unavailable')
    expect(fetchImpl.calls.some((c) => c.url.includes('/onramp/v1/token'))).toBe(false)
  })

  it('429 quota_exceeded past the per-destination mint budget, with Retry-After', async () => {
    const { app } = onrampApp({ env: { ONRAMP_QUOTA_PER_ADDRESS: '2' } })
    const body = { address: DEST, chainId: 137, asset: 'USDC' }
    expect((await post(app, '/v1/onramp/session', body)).status).toBe(200)
    expect((await post(app, '/v1/onramp/session', body)).status).toBe(200)
    const res = await post(app, '/v1/onramp/session', body)
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('quota_exceeded')
    expect(res.headers['retry-after']).toBeDefined()
  })

  it('503 killswitch_active when the kill switch is on', async () => {
    const killSwitch = createKillSwitch(true)
    const { app } = onrampApp({ killSwitch })
    const res = await post(app, '/v1/onramp/session', { address: DEST, chainId: 137, asset: 'USDC' })
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('killswitch_active')
  })

  it('502 upstream_error when the mint itself fails (never retried)', async () => {
    let tokenCalls = 0
    const inner = mockCoinbaseFetch()
    const fetchImpl = async (url, init) => {
      if (String(url).includes('/onramp/v1/token')) {
        tokenCalls += 1
        throw new Error('ECONNRESET')
      }
      return inner(url, init)
    }
    const { app } = onrampApp({ fetchImpl })
    const res = await post(app, '/v1/onramp/session', { address: DEST, chainId: 137, asset: 'USDC' })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('upstream_error')
    expect(tokenCalls).toBe(1) // single-use tokens: one attempt, no retry
  })

  it('origin lock applies to onramp routes', async () => {
    const { app } = onrampApp()
    const res = await request(app).post('/v1/onramp/session').send({ address: DEST, chainId: 137, asset: 'USDC' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('origin_denied')
  })

  it('client.createSessionToken rejects an empty upstream token', async () => {
    const client = createOnrampClient({
      apiKeyId: 'k',
      apiKeySecret: 's',
      baseUrl: 'https://api.developer.coinbase.com',
      fetchImpl: async () => jsonRes({ token: '' }),
      generateJwtImpl: async () => 'test-jwt',
    })
    await expect(client.createSessionToken({ address: DEST, slug: 'polygon', asset: 'USDC' })).rejects.toBeInstanceOf(
      OnrampUnavailableError
    )
  })
})
