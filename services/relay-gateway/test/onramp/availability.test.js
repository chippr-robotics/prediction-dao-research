/**
 * Honest-availability tests for /v1/onramp/* (spec 060 US2): config-off fail-closed states,
 * dynamic catalog gating, and live re-validation at mint time.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server.js'
import { createOnrampClient } from '../../src/onramp/client.js'
import { testConfig, mockProviders, mockEngine, ORIGIN_SECRET } from '../helpers.js'

const DEST = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)
const post = (app, path, body) => request(app).post(path).set('X-Origin-Auth', ORIGIN_SECRET).send(body)

describe('onramp unconfigured (no CDP creds) — the feature is OFF', () => {
  const config = testConfig() // no CDP_API_KEY_ID / CDP_API_KEY_SECRET
  const { app } = createApp(config, { providers: mockProviders(config), engineClient: mockEngine() })

  it('boot is unaffected and both routes 503 onramp_unconfigured', async () => {
    for (const req of [
      get(app, '/v1/onramp/options?chainId=137'),
      post(app, '/v1/onramp/session', { address: DEST, chainId: 137, asset: 'USDC' }),
    ]) {
      const res = await req
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('onramp_unconfigured')
    }
  })

  it('missing only ONE credential half still fails closed', async () => {
    const halfConfig = testConfig({ CDP_API_KEY_ID: 'test-key-id' })
    const { app: halfApp } = createApp(halfConfig, { providers: mockProviders(halfConfig), engineClient: mockEngine() })
    const res = await get(halfApp, '/v1/onramp/options?chainId=137')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('onramp_unconfigured')
  })

  it('the rest of the gateway is untouched by the onramp being off (decoupling, FR-012)', async () => {
    const res = await request(app).get('/status')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

describe('dynamic catalog gating', () => {
  function appWithCatalog(catalogBySymbolNetworks) {
    const config = testConfig({ CDP_API_KEY_ID: 'k', CDP_API_KEY_SECRET: 's' })
    const fetchCalls = { options: 0, token: 0 }
    const fetchImpl = async (url, init = {}) => {
      if (String(url).includes('/onramp/v1/buy/options')) {
        fetchCalls.options += 1
        return jsonRes({ purchase_currencies: catalogBySymbolNetworks.current })
      }
      fetchCalls.token += 1
      return jsonRes({ token: 'sess-tok' })
    }
    const client = createOnrampClient({ ...config.onramp, fetchImpl, generateJwtImpl: async () => 'jwt' })
    const { app } = createApp(config, { providers: mockProviders(config), engineClient: mockEngine(), onrampClient: client })
    return { app, fetchCalls }
  }

  it('a mapped chain missing from the catalog reports available:false with empty assets', async () => {
    const { app } = appWithCatalog({ current: [{ symbol: 'ETH', networks: [{ name: 'base' }] }] })
    const res = await get(app, '/v1/onramp/options?chainId=137')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ chainId: 137, available: false, assets: [], defaultAsset: null })
  })

  it('mint re-checks the catalog live: a delisting between render and tap declines, no dead session', async () => {
    const catalog = { current: [{ symbol: 'USDC', networks: [{ name: 'polygon' }] }] }
    const { app, fetchCalls } = appWithCatalog(catalog)
    // Prime the cache while USDC is listed…
    expect((await get(app, '/v1/onramp/options?chainId=137')).body.available).toBe(true)
    // …then Coinbase delists it. The cached catalog would still say yes; the mint must not trust it.
    catalog.current = []
    const res = await post(app, '/v1/onramp/session', { address: DEST, chainId: 137, asset: 'USDC' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('unsupported_asset')
    expect(fetchCalls.token).toBe(0) // declined before any token was minted
    expect(fetchCalls.options).toBeGreaterThanOrEqual(2) // cache-bypassing re-check happened
  })

  it('ETC (61): available only when Coinbase lists it, matching ANY spelling, and mints echo Coinbase\'s own name', async () => {
    // Coinbase's catalog spelling ("ethereumclassic") differs from our canonical slug
    // ("ethereum-classic") — the normalized lookup must still match, and the mint must carry
    // Coinbase's OWN name so the token request can never desync from their naming.
    const { app, fetchCalls } = appWithCatalog({ current: [{ symbol: 'ETC', networks: [{ name: 'ethereumclassic' }] }] })
    const res = await get(app, '/v1/onramp/options?chainId=61')
    expect(res.status).toBe(200)
    // No USDC on ETC -> the default falls back to the first deliverable asset.
    expect(res.body).toMatchObject({ chainId: 61, available: true, assets: ['ETC'], defaultAsset: 'ETC' })

    const mint = await post(app, '/v1/onramp/session', { address: DEST, chainId: 61, asset: 'ETC' })
    expect(mint.status).toBe(200)
    expect(mint.body.url).toContain('defaultNetwork=ethereumclassic')
    expect(fetchCalls.token).toBe(1)
  })

  it('ETC (61): Coinbase not serving it => available:false and mints decline (the "if possible" gate)', async () => {
    const { app, fetchCalls } = appWithCatalog({ current: [{ symbol: 'USDC', networks: [{ name: 'polygon' }] }] })
    const res = await get(app, '/v1/onramp/options?chainId=61')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ chainId: 61, available: false, assets: [] })
    const mint = await post(app, '/v1/onramp/session', { address: DEST, chainId: 61, asset: 'ETC' })
    expect(mint.status).toBe(400)
    expect(mint.body.error.code).toBe('unsupported_asset')
    expect(fetchCalls.token).toBe(0)
  })

  it('a listing that APPEARS after the cache was primed is honored by the live re-check', async () => {
    const catalog = { current: [] }
    const { app } = appWithCatalog(catalog)
    expect((await get(app, '/v1/onramp/options?chainId=137')).body.available).toBe(false)
    catalog.current = [{ symbol: 'USDC', networks: [{ name: 'polygon' }] }]
    const res = await post(app, '/v1/onramp/session', { address: DEST, chainId: 137, asset: 'USDC' })
    expect(res.status).toBe(200)
    expect(res.body.url).toContain('sessionToken=sess-tok')
  })
})
