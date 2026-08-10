/**
 * /v1/bridge/* cross-chain bridge proxy tests (spec 067 US1 — T063/T064/T065).
 *
 * The Across upstream is mocked via the injectable bridgeFetch; everything else uses the same
 * build-the-app-with-injected-deps pattern as polymarket.test.js.
 *
 * The cases that matter most here are the dishonest-state ones: a disabled module, an upstream
 * outage, and a malformed upstream body must each produce a stated reason — never a fabricated
 * quote, never a `delivered` without destination-side evidence.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import { createKillSwitch } from '../src/policy/killswitch.js'
import { parseChainId, isAddress, isAmount, normalizeSuggestedFees } from '../src/bridge/quotes.js'
import { normalizeDepositStatus, isDepositId, BRIDGE_STATES } from '../src/bridge/status.js'
import { testConfig, mockProviders, mockEngine, ORIGIN_SECRET, TEST_NOW } from './helpers.js'

const MEMBER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const USDC_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const DEPOSIT_TX = `0x${'aa'.repeat(32)}`
const FILL_TX = `0x${'bb'.repeat(32)}`
const REFUND_TX = `0x${'cc'.repeat(32)}`

// ---- upstream fixtures (Across API shapes) ------------------------------------------------------

const SUGGESTED_FEES = {
  totalRelayFee: { pct: '4000000000000000', total: '400000' },
  relayerCapitalFee: { pct: '1000000000000000', total: '100000' },
  relayerGasFee: { pct: '3000000000000000', total: '300000' },
  lpFee: { pct: '500000000000000', total: '50000' },
  timestamp: '1717000000',
  isAmountTooLow: false,
  quoteBlock: '20000000',
  exclusiveRelayer: '0x0000000000000000000000000000000000000000',
  exclusivityDeadline: '0',
  spokePoolAddress: '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096',
  fillDeadline: '1717003600',
  estimatedFillTimeSec: 4,
  outputAmount: '99600000',
  limits: { minDeposit: '1000000', maxDeposit: '1000000000000' },
}

const DEPOSIT_STATUS = {
  status: 'filled',
  depositTxHash: DEPOSIT_TX,
  fillTx: FILL_TX,
  destinationChainId: 1,
}

// ---- test scaffolding ---------------------------------------------------------------------------

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

function mockBridgeFetch(overrides = {}) {
  const calls = []
  const impl = async (url, opts) => {
    calls.push({ url, method: opts?.method ?? 'GET' })
    if (impl.failWith) return jsonRes({ message: 'across down' }, impl.failWith)
    if (impl.bodyOverride !== undefined) return jsonRes(impl.bodyOverride)
    for (const [needle, resp] of Object.entries(overrides)) {
      if (url.includes(needle)) return typeof resp === 'function' ? resp(url) : jsonRes(resp)
    }
    if (url.includes('/deposit/status')) return jsonRes(DEPOSIT_STATUS)
    if (url.includes('/suggested-fees')) return jsonRes(SUGGESTED_FEES)
    return jsonRes({ message: 'not found' }, 404)
  }
  impl.calls = calls
  impl.failWith = null
  impl.bodyOverride = undefined
  return impl
}

function build({ env = {}, bridgeFetch = mockBridgeFetch(), killSwitch = createKillSwitch(false) } = {}) {
  const config = testConfig({ BRIDGE_ENABLED: 'true', ...env })
  const clock = { t: TEST_NOW }
  const { app } = createApp(config, {
    providers: mockProviders(config),
    engineClient: mockEngine(),
    now: () => clock.t,
    killSwitch,
    bridgeFetch,
  })
  return { app, config, clock, bridgeFetch, killSwitch }
}

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)

const quotePath = (overrides = {}) => {
  const q = {
    destinationChainId: '1',
    inputToken: USDC_POLYGON,
    outputToken: USDC_ETHEREUM,
    amount: '100000000',
    recipient: MEMBER,
    ...overrides,
  }
  const origin = q.origin ?? '137'
  delete q.origin
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v != null))
  return `/v1/bridge/${origin}/quote?${qs}`
}
const STATUS_PATH = '/v1/bridge/137/status?depositId=12345'

// ---- unit: quote validation + normalization -----------------------------------------------------

describe('bridge quote validation', () => {
  it('parses EVM chain ids and rejects Bitcoin string network ids', () => {
    expect(parseChainId('137')).toBe(137)
    expect(parseChainId(42161)).toBe(42161)
    // Spec 061 Bitcoin ids are STRINGS and must never reach a chain-keyed lookup (FR-006).
    expect(parseChainId('bitcoin')).toBeNull()
    expect(parseChainId('bitcoin-testnet')).toBeNull()
    expect(parseChainId('0')).toBeNull()
    expect(parseChainId('-1')).toBeNull()
    expect(parseChainId(null)).toBeNull()
  })

  it('validates addresses and base-unit amounts', () => {
    expect(isAddress(MEMBER)).toBe(true)
    expect(isAddress('0x1234')).toBe(false)
    expect(isAmount('100000000')).toBe(true)
    expect(isAmount('0')).toBe(false)
    expect(isAmount('1.5')).toBe(false)
    expect(isAmount('-1')).toBe(false)
  })

  it('maps a suggested-fees body to the itemizable legs', () => {
    const q = normalizeSuggestedFees(SUGGESTED_FEES)
    expect(q).toMatchObject({
      outputAmount: '99600000',
      totalRelayFee: { pct: '4000000000000000', total: '400000' },
      lpFee: { total: '50000' },
      relayerGasFee: { total: '300000' },
      estimatedFillSeconds: 4,
      quoteTimestamp: '1717000000',
      fillDeadline: '1717003600',
      isAmountTooLow: false,
    })
    expect(q.limits).toEqual({ minDeposit: '1000000', maxDeposit: '1000000000000' })
  })

  it('returns null rather than a half-quote when a decision-critical field is missing', () => {
    expect(normalizeSuggestedFees(null)).toBeNull()
    expect(normalizeSuggestedFees('nope')).toBeNull()
    expect(normalizeSuggestedFees({ ...SUGGESTED_FEES, outputAmount: undefined })).toBeNull()
    expect(normalizeSuggestedFees({ ...SUGGESTED_FEES, totalRelayFee: undefined })).toBeNull()
    expect(normalizeSuggestedFees({ ...SUGGESTED_FEES, timestamp: undefined })).toBeNull()
    // A non-integer amount is not silently rounded — it is unusable.
    expect(normalizeSuggestedFees({ ...SUGGESTED_FEES, outputAmount: '99.6' })).toBeNull()
  })

  it('reports optional legs as null instead of zero when the upstream omits them', () => {
    const q = normalizeSuggestedFees({
      outputAmount: '1',
      totalRelayFee: { pct: '0', total: '0' },
      timestamp: '1',
    })
    expect(q.lpFee).toBeNull()
    expect(q.relayerGasFee).toBeNull()
    expect(q.estimatedFillSeconds).toBeNull()
    expect(q.spokePoolAddress).toBeNull()
    expect(q.limits).toBeNull()
  })
})

// ---- unit: status normalization (the honest-state rules) ----------------------------------------

describe('bridge status normalization', () => {
  it('validates deposit ids', () => {
    expect(isDepositId('12345')).toBe(true)
    expect(isDepositId('0x1')).toBe(false)
    expect(isDepositId('')).toBe(false)
  })

  it('reports delivered ONLY with a destination fill transaction', () => {
    expect(normalizeDepositStatus(DEPOSIT_STATUS)).toMatchObject({
      state: BRIDGE_STATES.DELIVERED,
      fillTxHash: FILL_TX,
      depositTxHash: DEPOSIT_TX,
      destinationChainId: 1,
    })
    // FR-009: "filled" without provable destination-side evidence stays in flight (under-claim).
    expect(normalizeDepositStatus({ status: 'filled', depositTxHash: DEPOSIT_TX })).toMatchObject({
      state: BRIDGE_STATES.IN_FLIGHT,
      fillTxHash: null,
    })
  })

  it('maps the in-flight and terminal-refund vocabulary', () => {
    expect(normalizeDepositStatus({ status: 'pending' }).state).toBe(BRIDGE_STATES.IN_FLIGHT)
    expect(normalizeDepositStatus({ status: 'slowFillRequested' }).state).toBe(BRIDGE_STATES.IN_FLIGHT)
    // Past its fillDeadline but not yet refunded on the origin chain.
    expect(normalizeDepositStatus({ status: 'expired' }).state).toBe(BRIDGE_STATES.EXPIRED)
    expect(normalizeDepositStatus({ status: 'expired', depositRefundTxHash: REFUND_TX })).toMatchObject({
      state: BRIDGE_STATES.REFUNDED,
      refundTxHash: REFUND_TX,
    })
    expect(normalizeDepositStatus({ status: 'refunded', depositRefundTxHash: REFUND_TX }).state).toBe(BRIDGE_STATES.REFUNDED)
    expect(normalizeDepositStatus({ status: 'refunded' }).state).toBe(BRIDGE_STATES.EXPIRED)
  })

  it('says "unknown" for unrecognized upstream vocabulary and null for an unreadable body', () => {
    const unknown = normalizeDepositStatus({ status: 'somethingNew' })
    expect(unknown.state).toBeNull()
    expect(unknown.upstreamStatus).toBe('somethingNew')
    expect(normalizeDepositStatus({})).toBeNull()
    expect(normalizeDepositStatus(null)).toBeNull()
    expect(normalizeDepositStatus([])).toBeNull()
  })
})

// ---- config gating ------------------------------------------------------------------------------

describe('bridge config', () => {
  it('defaults to disabled with the spec-067 launch chain set', () => {
    const { bridge } = testConfig()
    expect(bridge.enabled).toBe(false)
    expect(bridge.chainIds).toEqual([1, 10, 137, 8453, 42161])
    expect(bridge.apiUrl).toBe('https://app.across.to/api')
  })

  it('boots fine while disabled even with a nonsense upstream URL (optional infrastructure)', () => {
    expect(() => testConfig({ BRIDGE_API_URL: 'not-a-url' })).not.toThrow()
  })

  it('fails loudly when ENABLED with a bad URL or a route set that cannot form a bridge', () => {
    expect(() => testConfig({ BRIDGE_ENABLED: 'true', BRIDGE_API_URL: 'not-a-url' })).toThrow(/BRIDGE_API_URL/)
    expect(() => testConfig({ BRIDGE_ENABLED: 'true', BRIDGE_CHAIN_IDS: '137' })).toThrow(/at least two distinct/)
    expect(() => testConfig({ BRIDGE_CHAIN_IDS: '137,abc' })).toThrow(/invalid chainId/)
  })
})

// ---- routes: disabled / killed (the honest-unavailable paths) -----------------------------------

describe('GET /v1/bridge/* when the module is not live', () => {
  it('503s bridge_disabled on every route when BRIDGE_ENABLED is unset', async () => {
    const { app } = build({ env: { BRIDGE_ENABLED: 'false' } })
    for (const path of [quotePath(), STATUS_PATH]) {
      const res = await get(app, path)
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('bridge_disabled')
      expect(res.body.error.reason).toMatch(/not enabled/)
    }
  })

  it('never reaches the upstream while disabled', async () => {
    const bridgeFetch = mockBridgeFetch()
    const { app } = build({ env: { BRIDGE_ENABLED: 'false' }, bridgeFetch })
    await get(app, quotePath())
    expect(bridgeFetch.calls).toHaveLength(0)
  })

  it('503s bridge_killed for the module killswitch and the global one', async () => {
    const moduleKilled = build({ env: { BRIDGE_KILLSWITCH: 'true' } })
    const r1 = await get(moduleKilled.app, quotePath())
    expect(r1.status).toBe(503)
    expect(r1.body.error.code).toBe('bridge_killed')

    const globalKilled = build({ killSwitch: createKillSwitch(true) })
    const r2 = await get(globalKilled.app, quotePath())
    expect(r2.status).toBe(503)
    expect(r2.body.error.code).toBe('bridge_killed')
  })

  it('is origin-locked like every other client-facing route', async () => {
    const { app } = build()
    const res = await request(app).get(quotePath())
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('origin_denied')
  })
})

// ---- routes: quote ------------------------------------------------------------------------------

describe('GET /v1/bridge/:chainId/quote', () => {
  it('serves the normalized Across quote with the request echoed back', async () => {
    const { app, bridgeFetch } = build()
    const res = await get(app, quotePath())
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      originChainId: 137,
      destinationChainId: 1,
      inputAmount: '100000000',
      outputAmount: '99600000',
      totalRelayFee: { total: '400000' },
      lpFee: { total: '50000' },
      relayerGasFee: { total: '300000' },
      estimatedFillSeconds: 4,
      stale: false,
    })
    expect(res.body.fetchedAt).toBe(new Date(TEST_NOW * 1000).toISOString())
    // The upstream is called with the member's actual route, not a default.
    const url = bridgeFetch.calls.at(-1).url
    expect(url).toContain('/suggested-fees?')
    expect(url).toContain('originChainId=137')
    expect(url).toContain('destinationChainId=1')
    expect(url).toContain(`amount=100000000`)
  })

  it('carries no fee-rate opinion of its own (the FeeRouter is the only source, spec 060)', async () => {
    const { app } = build()
    const res = await get(app, quotePath())
    expect(res.body.platformFeeBps).toBeUndefined()
    expect(res.body.feeBps).toBeUndefined()
  })

  it('404s a network with no Across deployment, on either side of the route', async () => {
    const { app } = build()
    // Mordor (63) is an enabled gateway chain but has no SpokePool (FR-006c).
    const origin = await get(app, quotePath({ origin: '63' }))
    expect(origin.status).toBe(404)
    expect(origin.body.error.code).toBe('unsupported_chain')
    expect(origin.body.error.reason).toMatch(/origin/)

    const dest = await get(app, quotePath({ destinationChainId: '63' }))
    expect(dest.status).toBe(404)
    expect(dest.body.error.reason).toMatch(/destination/)
  })

  it('404s a Bitcoin network id without ever treating it as a chain number', async () => {
    const { app, bridgeFetch } = build()
    const res = await get(app, quotePath({ origin: 'bitcoin' }))
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('unsupported_chain')
    expect(bridgeFetch.calls).toHaveLength(0)
  })

  it('400s a destination equal to the origin (the R11b inversion guard)', async () => {
    const { app } = build()
    const res = await get(app, quotePath({ destinationChainId: '137' }))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_route')
  })

  it('400s malformed tokens, amounts, and recipients', async () => {
    const { app } = build()
    expect((await get(app, quotePath({ inputToken: '0xnope' }))).body.error.code).toBe('invalid_token')
    expect((await get(app, quotePath({ amount: '0' }))).body.error.code).toBe('invalid_amount')
    expect((await get(app, quotePath({ amount: '1.5' }))).body.error.code).toBe('invalid_amount')
    expect((await get(app, quotePath({ recipient: 'me' }))).body.error.code).toBe('invalid_address')
  })

  it('503s upstream_unavailable when Across is down — and invents nothing', async () => {
    const bridgeFetch = mockBridgeFetch()
    bridgeFetch.failWith = 503
    const { app } = build({ bridgeFetch })
    const res = await get(app, quotePath())
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('upstream_unavailable')
    expect(res.body.outputAmount).toBeUndefined()
  })

  it('502s upstream_rejected with Across’s own reason on a definitive 4xx', async () => {
    const bridgeFetch = mockBridgeFetch()
    bridgeFetch.failWith = 400
    const { app } = build({ bridgeFetch })
    const res = await get(app, quotePath())
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('upstream_rejected')
    expect(res.body.error.reason).toContain('across down')
  })

  it('502s upstream_malformed on an unreadable upstream body', async () => {
    const bridgeFetch = mockBridgeFetch()
    bridgeFetch.bodyOverride = { totalRelayFee: { pct: '1', total: '1' }, timestamp: '1' } // no outputAmount
    const { app } = build({ bridgeFetch })
    const res = await get(app, quotePath())
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('upstream_malformed')
  })

  it('de-dups identical quotes within the TTL window', async () => {
    const { app, bridgeFetch } = build()
    await get(app, quotePath())
    await get(app, quotePath())
    expect(bridgeFetch.calls).toHaveLength(1)
    // A different amount is a different quote — never answered from the first one.
    await get(app, quotePath({ amount: '200000000' }))
    expect(bridgeFetch.calls).toHaveLength(2)
  })

  it('NEVER serves a stale price: a post-TTL upstream failure 503s instead of replaying the last quote', async () => {
    const bridgeFetch = mockBridgeFetch()
    const { app, clock } = build({ bridgeFetch })
    expect((await get(app, quotePath())).status).toBe(200)

    clock.t += 60 // past BRIDGE_QUOTE_TTL_MS
    bridgeFetch.failWith = 503
    const res = await get(app, quotePath())
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('upstream_unavailable')
    expect(res.body.outputAmount).toBeUndefined()
  })

  it('429s past the read quota with a Retry-After', async () => {
    const { app } = build({ env: { BRIDGE_QUOTA_PER_IP: '1' } })
    expect((await get(app, quotePath())).status).toBe(200)
    const res = await get(app, quotePath({ amount: '200000000' }))
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('quota_exceeded')
    expect(res.headers['retry-after']).toBeDefined()
  })
})

// ---- routes: status -----------------------------------------------------------------------------

describe('GET /v1/bridge/:chainId/status', () => {
  it('serves the normalized deposit status with both transaction hashes', async () => {
    const { app, bridgeFetch } = build()
    const res = await get(app, STATUS_PATH)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      originChainId: 137,
      depositId: '12345',
      state: BRIDGE_STATES.DELIVERED,
      fillTxHash: FILL_TX,
      depositTxHash: DEPOSIT_TX,
      stale: false,
    })
    expect(bridgeFetch.calls.at(-1).url).toContain('/deposit/status?originChainId=137&depositId=12345')
  })

  it('400s a malformed deposit id', async () => {
    const { app } = build()
    const res = await get(app, '/v1/bridge/137/status?depositId=0xdead')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_deposit')
  })

  it('502s upstream_malformed when the status body has no readable status', async () => {
    const bridgeFetch = mockBridgeFetch()
    bridgeFetch.bodyOverride = { fillTx: FILL_TX }
    const { app } = build({ bridgeFetch })
    const res = await get(app, STATUS_PATH)
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('upstream_malformed')
  })

  it('serves a LAST-KNOWN status marked stale during an outage (a status can only lag, never over-claim)', async () => {
    const bridgeFetch = mockBridgeFetch()
    const { app, clock } = build({ bridgeFetch })
    expect((await get(app, STATUS_PATH)).status).toBe(200)

    clock.t += 60
    bridgeFetch.failWith = 503
    const res = await get(app, STATUS_PATH)
    expect(res.status).toBe(200)
    expect(res.body.stale).toBe(true)
    expect(res.body.state).toBe(BRIDGE_STATES.DELIVERED)
  })

  it('503s upstream_unavailable when there is nothing cached to fall back to', async () => {
    const bridgeFetch = mockBridgeFetch()
    bridgeFetch.failWith = 500
    const { app } = build({ bridgeFetch })
    const res = await get(app, STATUS_PATH)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('upstream_unavailable')
  })
})
