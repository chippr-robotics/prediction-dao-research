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

const MARKETS_BODY = {
  data: [
    {
      condition_id: CONDITION,
      question: 'Will it rain tomorrow?',
      category: 'Weather',
      market_slug: 'will-it-rain-tomorrow',
      closed: false,
      volume: '12345.67',
      tokens: [
        { token_id: TOKEN, outcome: 'Yes', price: '0.55' },
        { token_id: '1', outcome: 'No', price: '0.45' },
      ],
    },
    { foo: 'junk' }, // unusable (no condition id) -> dropped, never 500s
  ],
  next_cursor: 'cursor-2',
}
const MARKET_DETAIL_BODY = { market: MARKETS_BODY.data[0] }
const FEE_BODY = { fd: { r: 100, e: 2, to: true } }
const POSITIONS_BODY = {
  data: [{ asset: TOKEN, size: '10', outcome: 'Yes', current_value: '5.5', curPrice: '0.55', conditionId: CONDITION }],
}
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
    if (url.includes('/order/cancel')) return jsonRes(CANCEL_RESPONSE)
    if (url.includes('/order')) return jsonRes(ORDER_POST_RESPONSE)
    if (url.includes('/data/orders')) return jsonRes(OPEN_ORDERS_BODY)
    if (url.includes('/positions')) return jsonRes(POSITIONS_BODY)
    if (url.includes('/fee-rate')) return jsonRes(FEE_BODY)
    if (url.includes('/markets/')) return jsonRes(MARKET_DETAIL_BODY)
    if (url.includes('/markets')) return jsonRes(MARKETS_BODY)
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

  it('reads the platform fee live (never hardcoded) and returns null when absent', () => {
    expect(normalizeFeeRate(FEE_BODY, TOKEN)).toMatchObject({ tokenId: TOKEN, feeRateBps: 100, takerOnly: true })
    expect(normalizeFeeRate({}, TOKEN)).toBeNull()
  })

  it('maps a position, dropping zero-size records', () => {
    expect(normalizePosition(POSITIONS_BODY.data[0])).toMatchObject({ tokenId: TOKEN, size: '10', outcome: 'Yes' })
    expect(normalizePosition({ asset: TOKEN, size: '0' })).toBeNull()
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
  it('lists markets, dropping unusable records', async () => {
    const { app } = build()
    const res = await get(app, MARKETS_PATH).expect(200)
    expect(res.body.markets).toHaveLength(1)
    expect(res.body.markets[0].conditionId).toBe(CONDITION)
    expect(res.body.next).toBe('cursor-2')
    expect(res.body.stale).toBe(false)
  })

  it('returns a market detail', async () => {
    const { app } = build()
    const res = await get(app, MARKET_PATH).expect(200)
    expect(res.body.question).toBe('Will it rain tomorrow?')
  })

  it('returns the live fee rate plus the configured builder fee (honest additive total)', async () => {
    const { app } = build()
    const res = await get(app, FEE_PATH).expect(200)
    expect(res.body).toMatchObject({ feeRateBps: 100, builderTakerFeeBps: 50, builderMakerFeeBps: 0 })
  })

  it('blocks (503) when the fee schedule is unavailable rather than guessing', async () => {
    const { app } = build({ polymarketFetch: mockPolymarketFetch({ '/fee-rate': {} }) })
    await get(app, FEE_PATH).expect(503)
  })

  it('reads positions and open orders with L2 auth headers', async () => {
    const { app, polymarketFetch } = build()
    await get(app, POSITIONS_PATH).expect(200)
    await get(app, ORDERS_PATH).expect(200)
    const authed = polymarketFetch.calls.find((c) => c.url.includes('/positions'))
    expect(authed.headers.POLY_API_KEY).toBe('test-pm-key')
    expect(authed.headers.POLY_SIGNATURE).toBeDefined()
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
