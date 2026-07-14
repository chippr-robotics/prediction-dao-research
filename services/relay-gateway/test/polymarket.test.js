/**
 * /v1/polymarket/* Predict proxy tests (spec 057 — contracts/gateway-predict-api.md).
 * The Polymarket upstream is mocked via the injectable polymarketFetch; everything else uses the
 * same build-the-app-with-injected-deps pattern as opensea.test.js.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import { createKillSwitch } from '../src/policy/killswitch.js'
import { l2Headers } from '../src/polymarket/client.js'
import { attachBuilderCode, ZERO_BYTES32 } from '../src/polymarket/builderCode.js'
import {
  isSupportedChain,
  isTokenId,
  normalizeMarket,
  normalizeGammaMarket,
  normalizeFeeRate,
  normalizePosition,
  validateOrderBody,
} from '../src/polymarket/normalize.js'
import { testConfig, mockProviders, mockEngine, ORIGIN_SECRET, TEST_NOW } from './helpers.js'

const TRADER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const BUILDER_CODE = '0x6e0316783960e149b53466f0f2c5fdbaf5ce11ba15669491de980f6dedc493a3'
const TOKEN = '71321045679252212594626385532706912750332728571942532289631379312455583992563'
const CONDITION = '0x' + 'ab'.repeat(32)

// ---- upstream fixtures (Polymarket CLOB shapes) -------------------------------------------------

// CLOB /markets shape (used by the normalizeMarket unit test).
const MARKETS_BODY = {
  data: [
    {
      condition_id: CONDITION,
      question: 'Will it rain tomorrow?',
      category: 'Weather',
      market_slug: 'will-it-rain-tomorrow',
      closed: false,
      volume: '12345.67',
      neg_risk: false,
      tokens: [
        { token_id: TOKEN, outcome: 'Yes', price: '0.55' },
        { token_id: '1', outcome: 'No', price: '0.45' },
      ],
    },
    { foo: 'junk' }, // unusable (no condition id) -> dropped, never 500s
  ],
  next_cursor: 'cursor-2',
}
// Gamma /markets shape (the browse/detail source): outcomes/prices/token-ids are stringified arrays.
const GAMMA_MARKETS = [
  {
    conditionId: CONDITION,
    question: 'Will it rain tomorrow?',
    slug: 'will-it-rain-tomorrow',
    category: 'Weather',
    active: true,
    closed: false,
    negRisk: false,
    volumeNum: 12345.67,
    outcomes: JSON.stringify(['Yes', 'No']),
    clobTokenIds: JSON.stringify([TOKEN, '1']),
    outcomePrices: JSON.stringify(['0.55', '0.45']),
  },
  { foo: 'junk' }, // unusable -> dropped
]
const FEE_BODY = { base_fee: 1000 } // real CLOB /fee-rate shape
// Data-API positions shape (public; camelCase currentValue/curPrice/negativeRisk).
const POSITIONS_BODY = [
  { asset: TOKEN, size: 10, outcome: 'Yes', currentValue: 5.5, curPrice: 0.55, conditionId: CONDITION, negativeRisk: false },
]
const OPEN_ORDERS_BODY = {
  data: [{ id: '0xorder1', asset_id: TOKEN, side: 'BUY', price: '0.5', original_size: '10', size_remaining: '4' }],
}
const ORDER_POST_RESPONSE = { orderID: '0xneworder', status: 'matched', success: true }
const CANCEL_RESPONSE = { canceled: true }

/** A structurally-valid signed CLOB order body the client would POST (attributed). */
const signedOrder = (overrides = {}) => ({
  order: {
    maker: TRADER,
    signer: TRADER,
    tokenId: TOKEN,
    side: 'BUY',
    makerAmount: '55000000',
    takerAmount: '100000000',
    builder: BUILDER_CODE,
    isMaker: false,
    ...overrides,
  },
  signature: '0x' + '11'.repeat(65),
})

// ---- test scaffolding ---------------------------------------------------------------------------

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

function mockPolymarketFetch(overrides = {}) {
  const calls = []
  const impl = async (url, opts) => {
    let body
    try {
      body = opts?.body ? JSON.parse(opts.body) : null
    } catch {
      body = opts?.body ?? null
    }
    calls.push({ url, method: opts?.method ?? 'GET', headers: opts?.headers ?? {}, body })
    if (impl.failWith) return jsonRes({ error: 'down' }, impl.failWith)
    for (const [needle, resp] of Object.entries(overrides)) {
      if (url.includes(needle)) return typeof resp === 'function' ? resp(url) : jsonRes(resp)
    }
    // Host-routed: Gamma (discovery), Data-API (positions), CLOB (everything else).
    if (url.includes('gamma-api')) return jsonRes(GAMMA_MARKETS)
    if (url.includes('data-api')) return jsonRes(POSITIONS_BODY)
    if (url.includes('/order/cancel')) return jsonRes(CANCEL_RESPONSE)
    if (url.includes('/order')) return jsonRes(ORDER_POST_RESPONSE)
    if (url.includes('/data/orders')) return jsonRes(OPEN_ORDERS_BODY)
    if (url.includes('/fee-rate')) return jsonRes(FEE_BODY)
    return jsonRes({ error: 'not found' }, 404)
  }
  impl.calls = calls
  impl.failWith = null
  return impl
}

const PM_ENV = {
  POLYMARKET_API_KEY: 'test-pm-key',
  POLYMARKET_API_SECRET: Buffer.from('test-secret').toString('base64url'),
  POLYMARKET_API_PASSPHRASE: 'test-pass',
  POLYMARKET_API_ADDRESS: '0x1111111111111111111111111111111111111111',
  POLYMARKET_BUILDER_CODE: BUILDER_CODE,
}

function build({ env = {}, polymarketFetch = mockPolymarketFetch(), killSwitch = createKillSwitch(false) } = {}) {
  const config = testConfig({ ...PM_ENV, ...env })
  const clock = { t: TEST_NOW }
  const { app } = createApp(config, {
    providers: mockProviders(config),
    engineClient: mockEngine(),
    now: () => clock.t,
    killSwitch,
    polymarketFetch,
  })
  return { app, config, clock, polymarketFetch, killSwitch }
}

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)
const post = (app, path, body) => request(app).post(path).set('X-Origin-Auth', ORIGIN_SECRET).send(body)

const MARKETS_PATH = '/v1/polymarket/137/markets'
const MARKET_PATH = `/v1/polymarket/137/markets/${CONDITION}`
const FEE_PATH = `/v1/polymarket/137/fee-rate?token_id=${TOKEN}`
const POSITIONS_PATH = `/v1/polymarket/137/positions?address=${TRADER}`
const ORDERS_PATH = `/v1/polymarket/137/orders?address=${TRADER}`
const ORDER_PATH = '/v1/polymarket/137/order'
const CANCEL_PATH = '/v1/polymarket/137/order/cancel'

// ---- unit: normalize ----------------------------------------------------------------------------

describe('polymarket normalize', () => {
  it('supports Polygon only', () => {
    expect(isSupportedChain(137)).toBe(true)
    expect(isSupportedChain(1)).toBe(false)
    expect(isSupportedChain(80002)).toBe(false)
  })

  it('validates token ids', () => {
    expect(isTokenId(TOKEN)).toBe(true)
    expect(isTokenId('0x123')).toBe(false)
    expect(isTokenId('')).toBe(false)
  })

  it('maps a market with outcomes and a non-tradable flag', () => {
    const m = normalizeMarket(MARKETS_BODY.data[0])
    expect(m.conditionId).toBe(CONDITION)
    expect(m.question).toBe('Will it rain tomorrow?')
    expect(m.outcomes).toHaveLength(2)
    expect(m.outcomes[0]).toMatchObject({ name: 'Yes', tokenId: TOKEN, price: '0.55' })
    expect(m.tradable).toBe(true)
    expect(normalizeMarket({ condition_id: CONDITION, closed: true, tokens: [] }).tradable).toBe(false)
    expect(normalizeMarket({ junk: true })).toBeNull()
  })

  it('reads the platform fee live (base_fee) and returns null when absent', () => {
    expect(normalizeFeeRate(FEE_BODY, TOKEN)).toMatchObject({ tokenId: TOKEN, feeRateBps: 1000 })
    expect(normalizeFeeRate({}, TOKEN)).toBeNull()
  })

  it('maps a Data-API position, dropping zero-size records', () => {
    expect(normalizePosition(POSITIONS_BODY[0])).toMatchObject({
      tokenId: TOKEN,
      size: '10',
      outcome: 'Yes',
      value: { amount: '5.5', currency: 'USDC' },
      bestBid: { amount: '0.55', currency: 'USDC' },
    })
    expect(normalizePosition({ asset: TOKEN, size: '0' })).toBeNull()
  })

  it('maps a Gamma market, zipping outcomes/token-ids/prices and dropping untradable', () => {
    const m = normalizeGammaMarket(GAMMA_MARKETS[0])
    expect(m.conditionId).toBe(CONDITION)
    expect(m.outcomes).toEqual([
      { name: 'Yes', tokenId: TOKEN, price: '0.55' },
      { name: 'No', tokenId: '1', price: '0.45' },
    ])
    expect(m.tradable).toBe(true)
    expect(m.negRisk).toBe(false)
    expect(normalizeGammaMarket({ foo: 'junk' })).toBeNull()
    expect(normalizeGammaMarket({ conditionId: CONDITION, closed: true, outcomes: '[]', clobTokenIds: '[]' }).tradable).toBe(false)
  })

  it('rejects a malformed order and a stripped/altered builder code', () => {
    expect(validateOrderBody(signedOrder(), BUILDER_CODE)).toBeNull()
    expect(validateOrderBody({ order: { maker: 'nope' }, signature: '0x11' }, BUILDER_CODE)).toBe('invalid_order')
    // Attribution altered to a different code -> rejected (client can't redirect the builder fee).
    expect(validateOrderBody(signedOrder({ builder: ZERO_BYTES32 }), BUILDER_CODE)).toBe('builder_mismatch')
  })
})

// ---- unit: builder-code seam --------------------------------------------------------------------

describe('attachBuilderCode', () => {
  it('attaches the configured code + additive taker fee, zero for makers', () => {
    const config = { polymarket: { builderCode: BUILDER_CODE, takerFeeBps: 50, makerFeeBps: 0 } }
    expect(attachBuilderCode(config, { chainId: 137, isMaker: false })).toMatchObject({
      builderCode: BUILDER_CODE,
      feeBps: 50,
      source: 'attributed',
    })
    expect(attachBuilderCode(config, { chainId: 137, isMaker: true }).feeBps).toBe(0)
  })

  it('is unattributed (zero code, zero fee) when no builder code is configured — never stranded', () => {
    const r = attachBuilderCode({ polymarket: { takerFeeBps: 50 } }, { chainId: 137 })
    expect(r).toMatchObject({ builderCode: ZERO_BYTES32, feeBps: 0, source: 'none' })
  })
})

// ---- unit: L2 auth ------------------------------------------------------------------------------

describe('l2Headers', () => {
  it('signs with SECONDS timestamps and omits headers without creds', () => {
    const h = l2Headers(
      { apiKey: 'k', apiSecret: Buffer.from('s').toString('base64url'), apiPassphrase: 'p', apiAddress: TRADER },
      { method: 'POST', path: '/order', body: '{}', nowSec: 1_700_000_000 }
    )
    expect(h.POLY_TIMESTAMP).toBe('1700000000')
    expect(h.POLY_API_KEY).toBe('k')
    expect(h.POLY_SIGNATURE).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(l2Headers({}, { method: 'GET', path: '/x', body: '', nowSec: 1 })).toEqual({})
  })
})

// ---- config: fee-cap boot validation (SC-010) ---------------------------------------------------

describe('builder-fee config caps', () => {
  it('fails boot loudly when the taker fee exceeds 100 bps', () => {
    expect(() => testConfig({ ...PM_ENV, POLYMARKET_BUILDER_TAKER_FEE_BPS: '200' })).toThrow(/100 bps cap/)
  })
  it('fails boot loudly when the maker fee exceeds 50 bps', () => {
    expect(() => testConfig({ ...PM_ENV, POLYMARKET_BUILDER_MAKER_FEE_BPS: '80' })).toThrow(/50 bps cap/)
  })
  it('rejects a non-bytes32 builder code', () => {
    expect(() => testConfig({ ...PM_ENV, POLYMARKET_BUILDER_CODE: '0x1234' })).toThrow(/bytes32/)
  })
})

// ---- cross-cutting: origin lock / killswitch / fail-closed / quota / chain ----------------------

describe('predict proxy cross-cutting', () => {
  it('requires the origin-auth header', async () => {
    const { app } = build()
    await request(app).get(MARKETS_PATH).expect(403)
  })

  it('fails closed with 503 predict_unconfigured when no key is set', async () => {
    const { app } = build({ env: { POLYMARKET_API_KEY: '' } })
    const res = await get(app, MARKETS_PATH).expect(503)
    expect(res.body.error.code).toBe('predict_unconfigured')
  })

  it('503s when the killswitch is engaged', async () => {
    const { app } = build({ killSwitch: createKillSwitch(true) })
    const res = await get(app, MARKETS_PATH).expect(503)
    expect(res.body.error.code).toBe('killswitch_active')
  })

  it('404s on any non-Polygon chain', async () => {
    const { app } = build()
    const res = await get(app, `/v1/polymarket/1/markets`).expect(404)
    expect(res.body.error.code).toBe('unsupported_chain')
  })

  it('enforces the write quota keyed by trader with Retry-After', async () => {
    const { app } = build({ env: { POLYMARKET_WRITE_QUOTA_PER_ADDRESS: '1', POLYMARKET_WRITE_QUOTA_GLOBAL: '100' } })
    await post(app, ORDER_PATH, signedOrder()).expect(200)
    const res = await post(app, ORDER_PATH, signedOrder()).expect(429)
    expect(res.body.error.code).toBe('quota_exceeded')
    expect(res.headers['retry-after']).toBeDefined()
  })
})

// ---- reads --------------------------------------------------------------------------------------

describe('predict reads', () => {
  it('lists live tradable markets from Gamma, dropping unusable records', async () => {
    const { app, polymarketFetch } = build()
    const res = await get(app, MARKETS_PATH).expect(200)
    expect(res.body.markets).toHaveLength(1)
    expect(res.body.markets[0].conditionId).toBe(CONDITION)
    expect(res.body.markets[0].outcomes[0]).toMatchObject({ name: 'Yes', tokenId: TOKEN })
    expect(res.body.stale).toBe(false)
    // Browse hits the Gamma host, not the CLOB.
    expect(polymarketFetch.calls.some((c) => c.url.includes('gamma-api') && c.url.includes('/markets'))).toBe(true)
  })

  it('returns a market detail from Gamma', async () => {
    const { app } = build()
    const res = await get(app, MARKET_PATH).expect(200)
    expect(res.body.question).toBe('Will it rain tomorrow?')
  })

  it('returns the configured builder fee + code with the live platform rate', async () => {
    const { app } = build()
    const res = await get(app, FEE_PATH).expect(200)
    expect(res.body).toMatchObject({ feeRateBps: 1000, builderTakerFeeBps: 50, builderMakerFeeBps: 0, builderCode: BUILDER_CODE })
  })

  it('still returns builder info (no block) when the CLOB fee rate is unavailable — trading not stranded', async () => {
    const { app } = build({ polymarketFetch: mockPolymarketFetch({ '/fee-rate': {} }) })
    const res = await get(app, FEE_PATH).expect(200)
    expect(res.body).toMatchObject({ feeRateBps: null, builderTakerFeeBps: 50, builderCode: BUILDER_CODE })
  })

  it('reads positions from the public Data API (no auth) and open orders from the CLOB (L2 auth)', async () => {
    const { app, polymarketFetch } = build()
    const posRes = await get(app, POSITIONS_PATH).expect(200)
    expect(posRes.body.positions[0]).toMatchObject({ tokenId: TOKEN, outcome: 'Yes' })
    await get(app, ORDERS_PATH).expect(200)
    // Positions: public Data API, no POLY auth headers.
    const posCall = polymarketFetch.calls.find((c) => c.url.includes('data-api') && c.url.includes('/positions'))
    expect(posCall.headers.POLY_API_KEY).toBeUndefined()
    // Open orders: CLOB, L2-authed.
    const ordersCall = polymarketFetch.calls.find((c) => c.url.includes('/data/orders'))
    expect(ordersCall.headers.POLY_API_KEY).toBe('test-pm-key')
    expect(ordersCall.headers.POLY_SIGNATURE).toBeDefined()
  })
})

// ---- writes: order + cancel ---------------------------------------------------------------------

describe('predict writes', () => {
  it('submits a signed order carrying the builder code and reports the fee', async () => {
    const { app, polymarketFetch } = build()
    const res = await post(app, ORDER_PATH, signedOrder()).expect(200)
    expect(res.body).toMatchObject({ orderId: '0xneworder', builder: { source: 'attributed', feeBps: 50 } })
    const posted = polymarketFetch.calls.find((c) => c.method === 'POST' && c.url.includes('/order'))
    expect(posted.body.order.builder).toBe(BUILDER_CODE)
    expect(posted.headers.POLY_SIGNATURE).toBeDefined()
  })

  it('still posts (unattributed) when no builder code is configured — never stranded', async () => {
    const { app } = build({ env: { POLYMARKET_BUILDER_CODE: '' } })
    const res = await post(app, ORDER_PATH, signedOrder({ builder: ZERO_BYTES32 })).expect(200)
    expect(res.body.builder).toMatchObject({ source: 'none', feeBps: 0 })
  })

  it('rejects an order whose builder code was altered', async () => {
    const { app } = build()
    const res = await post(app, ORDER_PATH, signedOrder({ builder: ZERO_BYTES32 })).expect(400)
    expect(res.body.error.code).toBe('builder_mismatch')
  })

  it('does NOT retry a write on 5xx (no double-post)', async () => {
    const fetchImpl = mockPolymarketFetch()
    fetchImpl.failWith = 502
    const { app } = build({ polymarketFetch: fetchImpl })
    await post(app, ORDER_PATH, signedOrder()).expect(503)
    const posts = fetchImpl.calls.filter((c) => c.method === 'POST')
    expect(posts).toHaveLength(1)
  })

  it('surfaces a price move as 409 price_changed', async () => {
    const fetchImpl = mockPolymarketFetch({
      '/order': () => jsonRes({ error: 'order not marketable at price' }, 400),
    })
    const { app } = build({ polymarketFetch: fetchImpl })
    const res = await post(app, ORDER_PATH, signedOrder()).expect(409)
    expect(res.body.error.code).toBe('price_changed')
  })

  it('submits a SELL order carrying the builder code (US2)', async () => {
    const { app, polymarketFetch } = build()
    const res = await post(app, ORDER_PATH, signedOrder({ side: 'SELL' })).expect(200)
    expect(res.body.builder).toMatchObject({ source: 'attributed', feeBps: 50 })
    const posted = polymarketFetch.calls.find((c) => c.method === 'POST' && c.url.includes('/order'))
    expect(posted.body.order.side).toBe('SELL')
    expect(posted.body.order.builder).toBe(BUILDER_CODE)
  })

  it('cancels an open order', async () => {
    const { app } = build()
    const res = await post(app, CANCEL_PATH, { orderId: '0xorder1', address: TRADER }).expect(200)
    expect(res.body.cancelled).toBe(true)
  })
})
