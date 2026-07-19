/**
 * Spec 060 — unified platform-fee surfaces on the gateway.
 *
 * The FeeRouter contract is the source of truth for the Polymarket builder bps; the gateway reads
 * it via a cached eth_call and serves `source: "chain"`, falling back to the env-configured bps
 * (`source: "env-fallback"`) when the router is unset or unreachable. `/status` gains a public
 * read-only `fees` summary for the Fees admin tab.
 */
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { ethers } from 'ethers'
import { createApp } from '../src/server.js'
import { createFeeRouterReader, FEE_SERVICE_IDS } from '../src/fees/onchain.js'
import { testConfig, mockProviders, mockEngine, ORIGIN_SECRET, TEST_NOW } from './helpers.js'

const ROUTER = '0x00000000000000000000000000000000000000F1'
const TOKEN = '71321045679252212594626385532706912750332728571942532289631379312455583992563'
const FEE_PATH = `/v1/polymarket/137/fee-rate?token_id=${TOKEN}`

const PM_ENV = {
  POLYMARKET_API_KEY: 'test-pm-key',
  POLYMARKET_API_SECRET: Buffer.from('test-secret').toString('base64url'),
  POLYMARKET_API_PASSPHRASE: 'test-pass',
  POLYMARKET_API_ADDRESS: '0x1111111111111111111111111111111111111111',
  POLYMARKET_BUILDER_CODE: '0x6e0316783960e149b53466f0f2c5fdbaf5ce11ba15669491de980f6dedc493a3',
}

const IFACE = new ethers.Interface(['function feeBps(bytes32 serviceId) view returns (uint16)'])
const encodeBps = (n) => IFACE.encodeFunctionResult('feeBps', [n])

/** A provider whose FeeRouter answers come from a per-service bps map (throws when `fail`). */
function feeRouterProvider(bpsByService, state = {}) {
  return {
    calls: 0,
    async call(tx) {
      this.calls += 1
      if (state.fail) throw new Error('rpc down')
      const [serviceId] = IFACE.decodeFunctionData('feeBps', tx.data)
      return encodeBps(bpsByService[serviceId] ?? 0)
    },
  }
}

function readerConfig(overrides = {}) {
  return {
    feeRouter: { address: ROUTER, chainId: 137, cacheTtlMs: 30_000, ...overrides },
  }
}

describe('createFeeRouterReader', () => {
  it('is disabled (null) when no router address is configured', async () => {
    const reader = createFeeRouterReader({ feeRouter: { address: null, chainId: 137, cacheTtlMs: 30_000 } }, {})
    expect(reader.enabled).toBe(false)
    expect(await reader.getPolymarketBps()).toBeNull()
  })

  it('reads live taker/maker bps from the router and caches within the TTL', async () => {
    const provider = feeRouterProvider({
      [FEE_SERVICE_IDS.polymarketTaker]: 40,
      [FEE_SERVICE_IDS.polymarketMaker]: 10,
    })
    let t = 1_000_000
    const reader = createFeeRouterReader(readerConfig(), { 137: provider }, { now: () => t })
    expect(await reader.getPolymarketBps()).toEqual({ takerBps: 40, makerBps: 10 })
    expect(provider.calls).toBe(2) // one per service
    // Inside the TTL: served from cache, no new calls.
    t += 10_000
    await reader.getPolymarketBps()
    expect(provider.calls).toBe(2)
    // Past the TTL: re-read.
    t += 30_000
    await reader.getPolymarketBps()
    expect(provider.calls).toBe(4)
  })

  it('clamps above-cap chain values to the spec-057 caps and warns', async () => {
    const log = vi.fn()
    const provider = feeRouterProvider({
      [FEE_SERVICE_IDS.polymarketTaker]: 120, // above the 100 cap — "impossible", clamp + shout
      [FEE_SERVICE_IDS.polymarketMaker]: 60, // above the 50 cap
    })
    const reader = createFeeRouterReader(readerConfig(), { 137: provider }, { log })
    expect(await reader.getPolymarketBps()).toEqual({ takerBps: 100, makerBps: 50 })
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('serves the last good value during a short outage, null once it is too stale', async () => {
    const state = { fail: false }
    const provider = feeRouterProvider({ [FEE_SERVICE_IDS.polymarketTaker]: 40 }, state)
    let t = 1_000_000
    const reader = createFeeRouterReader(readerConfig(), { 137: provider }, { now: () => t, log: () => {} })
    expect((await reader.getPolymarketBps()).takerBps).toBe(40)
    state.fail = true
    t += 60_000 // past the TTL but within the bounded-staleness window
    expect((await reader.getPolymarketBps()).takerBps).toBe(40)
    t += 600_000 // way past — env fallback takes over
    expect(await reader.getPolymarketBps()).toBeNull()
  })
})

// ---- routes -------------------------------------------------------------------------------------

const jsonRes = (body) => ({ ok: true, status: 200, async json() { return body }, async text() { return JSON.stringify(body) } })
const pmFetch = () => async (url) => (String(url).includes('/fee-rate') ? jsonRes({ base_fee: 1000 }) : jsonRes({ data: [] }))

function build({ feeRates } = {}) {
  const config = testConfig(PM_ENV)
  const { app } = createApp(config, {
    providers: mockProviders(config),
    engineClient: mockEngine(),
    now: () => TEST_NOW,
    polymarketFetch: pmFetch(),
    ...(feeRates ? { feeRates } : {}),
  })
  return { app, config }
}

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)

describe('GET fee-rate with the FeeRouter as source (spec 060)', () => {
  it('serves the on-chain bps with source "chain" when the reader has a live value', async () => {
    const feeRates = {
      enabled: true,
      address: ROUTER,
      getPolymarketBps: async () => ({ takerBps: 40, makerBps: 0 }),
    }
    const res = await get(build({ feeRates }).app, FEE_PATH)
    expect(res.status).toBe(200)
    expect(res.body.builderTakerFeeBps).toBe(40)
    expect(res.body.builderMakerFeeBps).toBe(0)
    expect(res.body.source).toBe('chain')
  })

  it('falls back to the env bps with source "env-fallback" when the reader has no value', async () => {
    const feeRates = { enabled: false, address: null, getPolymarketBps: async () => null }
    const res = await get(build({ feeRates }).app, FEE_PATH)
    expect(res.status).toBe(200)
    expect(res.body.builderTakerFeeBps).toBe(50) // POLYMARKET_BUILDER_TAKER_FEE_BPS default
    expect(res.body.source).toBe('env-fallback')
  })

  it('defaults to env-fallback with no FeeRouter recorded for the chain (pre-060 parity)', async () => {
    const res = await get(build().app, FEE_PATH)
    expect(res.status).toBe(200)
    expect(res.body.builderTakerFeeBps).toBe(50)
    expect(res.body.source).toBe('env-fallback')
  })
})

describe('GET /status fees block (spec 060)', () => {
  it('summarizes every fee system: feeRouter, polymarket bps + source, opensea referral', async () => {
    const feeRates = {
      enabled: true,
      address: ROUTER,
      getPolymarketBps: async () => ({ takerBps: 40, makerBps: 0 }),
    }
    const res = await get(build({ feeRates }).app, '/status')
    expect(res.status).toBe(200)
    expect(res.body.fees).toEqual({
      feeRouter: ROUTER,
      polymarket: { takerBps: 40, makerBps: 0, source: 'chain' },
      opensea: { referralConfigured: false, beneficiary: null },
    })
  })

  it('reports env-fallback rates when no router is configured', async () => {
    const res = await get(build().app, '/status')
    expect(res.status).toBe(200)
    expect(res.body.fees.feeRouter).toBeNull()
    expect(res.body.fees.polymarket).toEqual({ takerBps: 50, makerBps: 0, source: 'env-fallback' })
  })
})
