/**
 * /v1/opensea/* read-only proxy tests (spec 055 — contracts/gateway-opensea-api.md).
 * The OpenSea upstream is mocked via the injectable openseaFetch; everything else uses the
 * same build-the-app-with-injected-deps pattern as gateway.test.js.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import { createKillSwitch } from '../src/policy/killswitch.js'
import { createTtlCache } from '../src/opensea/cache.js'
import { createOpenSeaClient, OpenSeaUnavailableError, OpenSeaRequestError } from '../src/opensea/client.js'
import {
  chainSlug,
  isAddress,
  isIdentifier,
  isSlug,
  priceQuoteFromUnits,
  normalizeItem,
  openseaAssetUrl,
} from '../src/opensea/normalize.js'
import { testConfig, mockProviders, mockEngine, ORIGIN_SECRET, TEST_NOW } from './helpers.js'

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const CONTRACT = '0x2953399124F0cBB46d2CbACD8A89cF0599974963'

// ---- upstream fixtures (OpenSea API v2 shapes) --------------------------------------------------

const NFT_LIST_BODY = {
  nfts: [
    {
      identifier: '1234',
      collection: 'cool-cats',
      contract: CONTRACT,
      token_standard: 'erc721',
      name: 'Cool Cat #1234',
      image_url: 'https://img.example/1234-small.png',
      display_image_url: 'https://img.example/1234.png',
      opensea_url: `https://opensea.io/assets/matic/${CONTRACT.toLowerCase()}/1234`,
      is_disabled: false,
      is_nsfw: false,
    },
    {
      identifier: '77',
      collection: 'spam-co',
      contract: CONTRACT,
      token_standard: 'erc1155',
      name: '', // missing metadata -> "#77" fallback
      image_url: null,
      is_disabled: true, // flagged -> isFlagged
      is_nsfw: false,
      quantity: 3,
    },
    { identifier: 'not-a-number', contract: 'garbage' }, // unusable -> dropped, never 500s
  ],
  next: 'cursor-2',
}

const NFT_DETAIL_BODY = {
  nft: {
    identifier: '1234',
    collection: 'cool-cats',
    contract: CONTRACT,
    token_standard: 'erc721',
    name: 'Cool Cat #1234',
    description: 'A very cool cat.',
    image_url: 'https://img.example/1234.png',
    opensea_url: `https://opensea.io/assets/matic/${CONTRACT.toLowerCase()}/1234`,
    is_disabled: false,
    is_nsfw: false,
    traits: [
      { trait_type: 'Fur', value: 'Golden' },
      { trait_type: 'Mood', value: 'Chill' },
      { trait_type: null, value: 'dropped' },
    ],
    owners: [{ address: OWNER, quantity: 1 }],
  },
}

const COLLECTION_BODY = {
  collection: 'cool-cats',
  name: 'Cool Cats',
  image_url: 'https://img.example/cc.png',
  opensea_url: 'https://opensea.io/collection/cool-cats',
}

const STATS_BODY = { total: { floor_price: 0.85, floor_price_symbol: 'ETH' } }

const BEST_OFFER_BODY = { order_hash: '0xabc', price: { currency: 'WETH', decimals: 18, value: '790000000000000000' } }

// ---- test scaffolding ---------------------------------------------------------------------------

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

/** URL-routed upstream mock; `calls` records every hit, `failWith` forces a status for all routes. */
function mockOpenSeaFetch(overrides = {}) {
  const calls = []
  const impl = async (url, opts) => {
    calls.push({ url, headers: opts?.headers ?? {} })
    if (impl.failWith) return jsonRes({ errors: ['down'] }, impl.failWith)
    for (const [needle, body] of Object.entries(overrides)) {
      if (url.includes(needle)) return typeof body === 'function' ? body(url) : jsonRes(body)
    }
    if (url.includes('/account/')) return jsonRes(NFT_LIST_BODY)
    if (url.includes('/contract/')) return jsonRes(NFT_DETAIL_BODY)
    if (url.includes('/stats')) return jsonRes(STATS_BODY)
    if (url.includes('/offers/')) return jsonRes(BEST_OFFER_BODY)
    if (url.includes('/collections/')) return jsonRes(COLLECTION_BODY)
    return jsonRes({ errors: ['not found'] }, 404)
  }
  impl.calls = calls
  impl.failWith = null
  return impl
}

/** App with a mutable clock (unix seconds) so cache TTLs can be exercised. */
function build({ env = {}, openseaFetch = mockOpenSeaFetch(), killSwitch = createKillSwitch(false) } = {}) {
  const config = testConfig({ OPENSEA_API_KEY: 'test-os-key', ...env })
  const clock = { t: TEST_NOW }
  const { app } = createApp(config, {
    providers: mockProviders(config),
    engineClient: mockEngine(),
    now: () => clock.t,
    killSwitch,
    openseaFetch,
  })
  return { app, config, clock, openseaFetch, killSwitch }
}

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)

const LIST_PATH = `/v1/opensea/137/account/${OWNER}/nfts`
const DETAIL_PATH = `/v1/opensea/137/contract/${CONTRACT}/nfts/1234`

// ---- unit: normalize ----------------------------------------------------------------------------

describe('opensea normalize', () => {
  it('maps only Ethereum + Polygon to OpenSea slugs', () => {
    expect(chainSlug(1)).toBe('ethereum')
    expect(chainSlug(137)).toBe('matic')
    expect(chainSlug(63)).toBeNull() // Mordor is not an OpenSea chain (FR-007)
    expect(chainSlug(80002)).toBeNull()
  })

  it('validates params', () => {
    expect(isAddress(OWNER)).toBe(true)
    expect(isAddress('0x123')).toBe(false)
    expect(isIdentifier('0')).toBe(true)
    expect(isIdentifier('1'.repeat(129))).toBe(false)
    expect(isIdentifier('12a')).toBe(false)
    expect(isSlug('cool-cats')).toBe(true)
    expect(isSlug('Bad_Slug')).toBe(false)
  })

  it('converts base-unit offer prices to decimal quotes, never floats', () => {
    expect(priceQuoteFromUnits({ currency: 'WETH', decimals: 18, value: '790000000000000000' })).toEqual({
      amount: '0.79',
      currency: 'WETH',
    })
    expect(priceQuoteFromUnits({ currency: 'WETH', decimals: 18, value: '1000000000000000000' })).toEqual({
      amount: '1',
      currency: 'WETH',
    })
    expect(priceQuoteFromUnits(null)).toBeNull()
    expect(priceQuoteFromUnits({ currency: 'WETH', decimals: 18, value: 'garbage' })).toBeNull()
  })

  it('falls back to "#<id>" for missing names and flags disabled/nsfw items', () => {
    const item = normalizeItem(NFT_LIST_BODY.nfts[1], 137)
    expect(item.name).toBe('#77')
    expect(item.isFlagged).toBe(true)
    expect(item.quantity).toBe(3)
    expect(item.openseaUrl).toBe(openseaAssetUrl(137, CONTRACT, '77'))
  })

  it('drops unusable records instead of throwing', () => {
    expect(normalizeItem(NFT_LIST_BODY.nfts[2], 137)).toBeNull()
  })
})

// ---- unit: cache --------------------------------------------------------------------------------

describe('opensea cache', () => {
  it('serves fresh hits without reloading and coalesces concurrent misses (single-flight)', async () => {
    let t = 0
    let loads = 0
    const cache = createTtlCache({ now: () => t })
    const loader = async () => {
      loads += 1
      return { n: loads }
    }
    const [a, b] = await Promise.all([cache.fetchThrough('k', 1000, loader), cache.fetchThrough('k', 1000, loader)])
    expect(loads).toBe(1)
    expect(a.value).toEqual({ n: 1 })
    expect(b.stale).toBe(false)
    t = 500
    expect((await cache.fetchThrough('k', 1000, loader)).value).toEqual({ n: 1 }) // still fresh
    t = 1500
    expect((await cache.fetchThrough('k', 1000, loader)).value).toEqual({ n: 2 }) // expired -> reload
    expect(loads).toBe(2)
  })

  it('serves the last good value marked stale when the loader fails, and rethrows with nothing cached', async () => {
    let t = 0
    const cache = createTtlCache({ now: () => t })
    await cache.fetchThrough('k', 1000, async () => 'good')
    t = 2000
    const res = await cache.fetchThrough('k', 1000, async () => {
      throw new OpenSeaUnavailableError('down')
    })
    expect(res).toEqual({ value: 'good', fetchedAt: 0, stale: true })
    await expect(
      cache.fetchThrough('cold', 1000, async () => {
        throw new OpenSeaUnavailableError('down')
      })
    ).rejects.toBeInstanceOf(OpenSeaUnavailableError)
  })

  it('evicts oldest entries past maxEntries', async () => {
    let t = 0
    const cache = createTtlCache({ maxEntries: 2, now: () => t })
    for (const k of ['a', 'b', 'c']) {
      t += 1
      await cache.fetchThrough(k, 1000, async () => k)
    }
    expect(cache.size()).toBe(2)
  })
})

// ---- unit: client -------------------------------------------------------------------------------

describe('opensea client', () => {
  it('sends the API key as X-API-KEY and never as a bearer token', async () => {
    const fetchImpl = mockOpenSeaFetch()
    const client = createOpenSeaClient({ baseUrl: 'https://api.opensea.io/', apiKey: 'k', fetchImpl })
    await client.get('/api/v2/collections/cool-cats/stats')
    expect(fetchImpl.calls[0].url).toBe('https://api.opensea.io/api/v2/collections/cool-cats/stats')
    expect(fetchImpl.calls[0].headers['x-api-key']).toBe('k')
    expect(fetchImpl.calls[0].headers.authorization).toBeUndefined()
  })

  it('retries 5xx/429 then reports unavailable; does not retry definitive 4xx', async () => {
    const failing = mockOpenSeaFetch()
    failing.failWith = 500
    const client = createOpenSeaClient({ baseUrl: 'https://x.invalid', apiKey: 'k', retries: 2, fetchImpl: failing })
    await expect(client.get('/api/v2/anything')).rejects.toBeInstanceOf(OpenSeaUnavailableError)
    expect(failing.calls.length).toBe(3)

    const rejecting = mockOpenSeaFetch()
    rejecting.failWith = 400
    const client2 = createOpenSeaClient({ baseUrl: 'https://x.invalid', apiKey: 'k', retries: 2, fetchImpl: rejecting })
    await expect(client2.get('/api/v2/anything')).rejects.toBeInstanceOf(OpenSeaRequestError)
    expect(rejecting.calls.length).toBe(1)
  })
})

// ---- routes: cross-cutting (T008) ---------------------------------------------------------------

describe('GET /v1/opensea/* cross-cutting policy', () => {
  it('is origin-locked like every client route', async () => {
    const { app } = build()
    const res = await request(app).get(LIST_PATH)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('origin_denied')
  })

  it('refuses when the killswitch is active', async () => {
    const { app } = build({ killSwitch: createKillSwitch(true) })
    const res = await get(app, LIST_PATH)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('killswitch_active')
  })

  it('fails closed with 503 collectibles_unconfigured when no API key is set', async () => {
    const { app, openseaFetch } = build({ env: { OPENSEA_API_KEY: '' } })
    const res = await get(app, LIST_PATH)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('collectibles_unconfigured')
    expect(openseaFetch.calls.length).toBe(0) // never touches upstream without a key
  })

  it('enforces the per-address quota with Retry-After', async () => {
    const { app } = build({ env: { OPENSEA_QUOTA_PER_ADDRESS: '2', OPENSEA_QUOTA_GLOBAL: '100' } })
    expect((await get(app, LIST_PATH)).status).toBe(200)
    expect((await get(app, LIST_PATH)).status).toBe(200) // cache hit still counts a quota hit
    const res = await get(app, LIST_PATH)
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('quota_exceeded')
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    // A different requested address has its own window.
    expect((await get(app, `/v1/opensea/137/account/${CONTRACT}/nfts`)).status).toBe(200)
  })

  it('enforces the global backstop across keys', async () => {
    const { app } = build({ env: { OPENSEA_QUOTA_PER_ADDRESS: '100', OPENSEA_QUOTA_GLOBAL: '1' } })
    expect((await get(app, LIST_PATH)).status).toBe(200)
    const res = await get(app, '/v1/opensea/collections/cool-cats/stats')
    expect(res.status).toBe(429)
  })

  it('soft-fails unsupported chains with 404 unsupported_chain (Mordor et al.)', async () => {
    const { app } = build()
    for (const chainId of [63, 61, 80002, 999]) {
      const res = await get(app, `/v1/opensea/${chainId}/account/${OWNER}/nfts`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('unsupported_chain')
    }
  })
})

// ---- routes: account list (US1 / T012) ----------------------------------------------------------

describe('GET /v1/opensea/:chainId/account/:address/nfts', () => {
  it('normalizes the upstream page into CollectibleItem DTOs with the fetchedAt/stale envelope', async () => {
    const { app } = build()
    const res = await get(app, LIST_PATH)
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(2) // unusable third record dropped
    expect(res.body.items[0]).toEqual({
      chainId: 137,
      contract: CONTRACT,
      identifier: '1234',
      name: 'Cool Cat #1234',
      collectionSlug: 'cool-cats',
      imageUrl: 'https://img.example/1234.png', // display_image_url preferred
      standard: 'erc721',
      quantity: 1,
      isFlagged: false,
      openseaUrl: `https://opensea.io/assets/matic/${CONTRACT.toLowerCase()}/1234`,
    })
    expect(res.body.items[1].isFlagged).toBe(true)
    expect(res.body.next).toBe('cursor-2')
    expect(res.body.stale).toBe(false)
    expect(res.body.fetchedAt).toBe(new Date(TEST_NOW * 1000).toISOString())
  })

  it('passes the pagination cursor upstream and caches per cursor', async () => {
    const { app, openseaFetch } = build()
    await get(app, LIST_PATH)
    await get(app, `${LIST_PATH}?next=cursor-2`)
    expect(openseaFetch.calls[0].url).toContain(`/api/v2/chain/matic/account/${OWNER}/nfts?limit=50`)
    expect(openseaFetch.calls[1].url).toContain('next=cursor-2')
  })

  it('serves repeat requests from cache (two calls -> one upstream hit)', async () => {
    const { app, openseaFetch } = build()
    await get(app, LIST_PATH)
    await get(app, LIST_PATH)
    expect(openseaFetch.calls.length).toBe(1)
  })

  it('serves the last good page marked stale when the upstream dies after expiry', async () => {
    const { app, openseaFetch, clock, config } = build()
    const first = await get(app, LIST_PATH)
    expect(first.body.stale).toBe(false)
    clock.t += Math.ceil(config.opensea.cacheTtlMs / 1000) + 1 // expire the entry
    openseaFetch.failWith = 500
    const res = await get(app, LIST_PATH)
    expect(res.status).toBe(200)
    expect(res.body.stale).toBe(true)
    expect(res.body.items).toHaveLength(2)
  })

  it('returns 503 upstream_unavailable when the upstream dies with nothing cached', async () => {
    const openseaFetch = mockOpenSeaFetch()
    openseaFetch.failWith = 503
    const { app } = build({ openseaFetch })
    const res = await get(app, LIST_PATH)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('upstream_unavailable')
  })

  it('rejects malformed addresses and oversized cursors before spending quota or upstream calls', async () => {
    const { app, openseaFetch } = build()
    expect((await get(app, '/v1/opensea/137/account/nonsense/nfts')).status).toBe(400)
    expect((await get(app, '/v1/opensea/137/account/nonsense/nfts')).body?.error?.code).toBe('invalid_address')
    expect((await get(app, `${LIST_PATH}?next=${'x'.repeat(600)}`)).body.error.code).toBe('invalid_cursor')
    expect(openseaFetch.calls.length).toBe(0)
  })
})

// ---- routes: composed item detail (US2 / T020) --------------------------------------------------

describe('GET /v1/opensea/:chainId/contract/:contract/nfts/:identifier', () => {
  it('composes item + collection + floor + best offer into one CollectibleItemDetail', async () => {
    const { app } = build()
    const res = await get(app, DETAIL_PATH)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Cool Cat #1234')
    expect(res.body.description).toBe('A very cool cat.')
    expect(res.body.traits).toEqual([
      { traitType: 'Fur', value: 'Golden' },
      { traitType: 'Mood', value: 'Chill' },
    ])
    expect(res.body.owner).toBe(OWNER)
    expect(res.body.collection).toEqual({
      slug: 'cool-cats',
      name: 'Cool Cats',
      imageUrl: 'https://img.example/cc.png',
      openseaUrl: 'https://opensea.io/collection/cool-cats',
      floorPrice: { amount: '0.85', currency: 'ETH' },
    })
    expect(res.body.bestOffer).toEqual({ amount: '0.79', currency: 'WETH' })
    expect(res.body.stale).toBe(false)
  })

  it('degrades floor/offer legs to null instead of failing the sheet', async () => {
    const openseaFetch = mockOpenSeaFetch({
      '/stats': () => jsonRes({ errors: ['down'] }, 500),
      '/offers/': () => jsonRes({ errors: ['down'] }, 500),
    })
    const { app } = build({ openseaFetch })
    const res = await get(app, DETAIL_PATH)
    expect(res.status).toBe(200)
    expect(res.body.collection.floorPrice).toBeNull()
    expect(res.body.bestOffer).toBeNull()
  })

  it('maps a definitive upstream 404 to not_found (honest, not an outage)', async () => {
    const openseaFetch = mockOpenSeaFetch({ '/contract/': () => jsonRes({ errors: ['nope'] }, 404) })
    const { app } = build({ openseaFetch })
    const res = await get(app, DETAIL_PATH)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('not_found')
  })

  it('rejects malformed identifiers', async () => {
    const { app } = build()
    const res = await get(app, `/v1/opensea/137/contract/${CONTRACT}/nfts/12ab`)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_identifier')
  })

  it('caches the composed result as one entry', async () => {
    const { app, openseaFetch } = build()
    await get(app, DETAIL_PATH)
    expect(openseaFetch.calls.length).toBe(4) // item + collection + stats + offer
    await get(app, DETAIL_PATH)
    expect(openseaFetch.calls.length).toBe(4)
  })
})

// ---- routes: collection stats (US3 / T024) ------------------------------------------------------

describe('GET /v1/opensea/collections/:slug/stats', () => {
  it('returns the floor as a labeled quote', async () => {
    const { app } = build()
    const res = await get(app, '/v1/opensea/collections/cool-cats/stats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      slug: 'cool-cats',
      floorPrice: { amount: '0.85', currency: 'ETH' },
      fetchedAt: new Date(TEST_NOW * 1000).toISOString(),
      stale: false,
    })
  })

  it('returns a null floor when the collection has none (never a misleading zero)', async () => {
    const openseaFetch = mockOpenSeaFetch({ '/stats': { total: { floor_price: null, floor_price_symbol: null } } })
    const { app } = build({ openseaFetch })
    const res = await get(app, '/v1/opensea/collections/new-collection/stats')
    expect(res.status).toBe(200)
    expect(res.body.floorPrice).toBeNull()
  })

  it('rejects malformed slugs', async () => {
    const { app } = build()
    const res = await get(app, '/v1/opensea/collections/Bad_Slug!/stats')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_slug')
  })

  it('uses the longer stats TTL (fresh well past the list TTL)', async () => {
    const { app, openseaFetch, clock, config } = build()
    await get(app, '/v1/opensea/collections/cool-cats/stats')
    clock.t += Math.ceil(config.opensea.cacheTtlMs / 1000) + 1 // past list TTL, within stats TTL
    await get(app, '/v1/opensea/collections/cool-cats/stats')
    expect(openseaFetch.calls.length).toBe(1)
    clock.t += Math.ceil(config.opensea.statsCacheTtlMs / 1000) + 1
    await get(app, '/v1/opensea/collections/cool-cats/stats')
    expect(openseaFetch.calls.length).toBe(2)
  })
})
