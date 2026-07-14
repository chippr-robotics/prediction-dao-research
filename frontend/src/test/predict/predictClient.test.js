/**
 * predictClient (spec 057) — the SPA side of the /v1/polymarket/* proxy for the PUBLIC read surface.
 * Verifies gateway-unset soft-fail, success mapping, and fee-fetch failure. (Authed trading is
 * client-direct via clobSession — not this module.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  predictGatewayUrl,
  predictAvailable,
  fetchMarkets,
  fetchFeeRate,
  PredictUnavailable,
} from '../../lib/predict/predictClient'

const BASE = 'https://gw.test'
const jsonRes = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

beforeEach(() => {
  import.meta.env.VITE_RELAYER_URL = BASE
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete import.meta.env.VITE_RELAYER_URL
})

describe('predictGatewayUrl / predictAvailable', () => {
  it('reads the env and strips a trailing slash', () => {
    import.meta.env.VITE_RELAYER_URL = `${BASE}/`
    expect(predictGatewayUrl()).toBe(BASE)
  })
  it('is unavailable off Polygon (capability false) even with a gateway', () => {
    expect(predictAvailable(137)).toBe(true)
    expect(predictAvailable(1)).toBe(false)
  })
  it('is unavailable when no gateway is configured', () => {
    delete import.meta.env.VITE_RELAYER_URL
    expect(predictAvailable(137)).toBe(false)
  })
})

describe('reads/writes', () => {
  it('lists markets on success', async () => {
    fetch.mockResolvedValueOnce(jsonRes({ markets: [{ conditionId: '0xabc' }], next: null }))
    const r = await fetchMarkets(137, { q: 'rain' })
    expect(r.markets[0].conditionId).toBe('0xabc')
    expect(fetch.mock.calls[0][0]).toContain('/v1/polymarket/137/markets?q=rain')
  })

  it('throws PredictUnavailable when the fee schedule cannot be confirmed', async () => {
    fetch.mockResolvedValueOnce(jsonRes({ error: { code: 'fee_unavailable', reason: 'try again' } }, 503))
    await expect(fetchFeeRate(137, '123')).rejects.toMatchObject({ name: 'PredictUnavailable', code: 'fee_unavailable' })
  })

  it('soft-fails when the gateway is unconfigured', async () => {
    delete import.meta.env.VITE_RELAYER_URL
    await expect(fetchMarkets(137)).rejects.toBeInstanceOf(PredictUnavailable)
  })
})
