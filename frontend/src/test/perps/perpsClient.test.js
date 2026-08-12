/** Perps gateway client (spec 082) — soft-fail contract + error mapping, mirroring predictClient tests. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchPerpPairs, fetchPerpPositions, fetchPerpsConfig, PerpsUnavailable } from '../../lib/perps/perpsClient'
import { FEE_SERVICES } from '../../lib/fees/feeQuote'
import { id as keccakId } from 'ethers'

const BASE = 'https://gateway.test'
const TRADER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

beforeEach(() => {
  import.meta.env.VITE_RELAYER_URL = BASE
})
afterEach(() => {
  delete import.meta.env.VITE_RELAYER_URL
  vi.unstubAllGlobals()
})

const okFetch = (body) => vi.fn(async () => ({ ok: true, json: async () => body }))

describe('perpsClient', () => {
  it('throws PerpsUnavailable with code unconfigured when no gateway is set', async () => {
    delete import.meta.env.VITE_RELAYER_URL
    await expect(fetchPerpPairs()).rejects.toMatchObject({ name: 'PerpsUnavailable', code: 'unconfigured' })
  })

  it('fetches merged pairs from the gateway', async () => {
    const fetchImpl = okFetch({ pairs: [{ id: 'hyperliquid:BTC' }], sources: {}, asOf: 'now' })
    const body = await fetchPerpPairs({ fetchImpl })
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/v1/perps/pairs`, expect.anything())
    expect(body.pairs).toHaveLength(1)
  })

  it('encodes the address into the positions path', async () => {
    const fetchImpl = okFetch({ positions: [], sources: {} })
    await fetchPerpPositions(TRADER, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/v1/perps/positions?address=${TRADER}`, expect.anything())
  })

  it('lifts the gateway error code from the body', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: 'perps_unconfigured', reason: 'not configured' } }),
    }))
    await expect(fetchPerpsConfig({ fetchImpl })).rejects.toMatchObject({
      name: 'PerpsUnavailable',
      code: 'perps_unconfigured',
      status: 503,
    })
  })

  it('maps network failure to PerpsUnavailable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(fetchPerpPairs({ fetchImpl })).rejects.toBeInstanceOf(PerpsUnavailable)
  })
})

describe('perps fee service id', () => {
  it('matches the registered label keccak (drift guard with scripts/deploy/lib/feeServices.js)', () => {
    expect(FEE_SERVICES.PERPS_HL_BUILDER).toBe(keccakId('perps.hyperliquid.builder'))
  })
})
