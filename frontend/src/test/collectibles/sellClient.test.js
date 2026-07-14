/**
 * Sell-side gateway client (spec 056) — URL/method shapes, the fee-fetch-failure that blocks signing,
 * the 409 offer_changed re-confirm signal, and outage mapping.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fetchRequiredFees,
  publishListing,
  cancelListing,
  fetchOfferFulfillment,
} from '../../lib/collectibles/sellClient'
import { CollectiblesUnavailable } from '../../lib/collectibles/gatewayClient'

const BASE = 'https://relay.example'
const SELLER = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const ORDER_HASH = '0x' + 'ab'.repeat(32)

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.stubEnv('VITE_RELAYER_URL', BASE)
  global.fetch = vi.fn()
})
afterEach(() => vi.unstubAllEnvs())

describe('sell client', () => {
  it('fetches required fees via GET', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ totalRequiredBasisPoints: 750 }))
    const fees = await fetchRequiredFees(137, 'cool-cats')
    expect(fees.totalRequiredBasisPoints).toBe(750)
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/v1/opensea/137/collections/cool-cats/required-fees`,
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('publishes a signed listing via POST with the order body', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ orderHash: ORDER_HASH }))
    const res = await publishListing(137, { order: { offerer: SELLER }, signature: '0x11', protocolAddress: '0xabc' })
    expect(res.orderHash).toBe(ORDER_HASH)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/v1/opensea/137/listings`)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body).signature).toBe('0x11')
  })

  it('cancels a listing via POST', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ cancelled: true, method: 'offchain' }))
    const res = await cancelListing(137, { orderHash: ORDER_HASH, offerer: SELLER, signature: '0x11' })
    expect(res.method).toBe('offchain')
  })

  it('surfaces 409 offer_changed as its own code so the accept flow re-confirms (FR-007)', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: { code: 'offer_changed', reason: 'stale' } }, 409))
    const err = await fetchOfferFulfillment(137, { orderHash: ORDER_HASH, fulfiller: SELLER }).catch((e) => e)
    expect(err).toBeInstanceOf(CollectiblesUnavailable)
    expect(err.code).toBe('offer_changed')
    expect(err.status).toBe(409)
  })

  it('maps a fee-fetch outage to CollectiblesUnavailable (client blocks signing, FR-009)', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: { code: 'upstream_unavailable' } }, 503))
    const err = await fetchRequiredFees(137, 'cool-cats').catch((e) => e)
    expect(err).toBeInstanceOf(CollectiblesUnavailable)
    expect(err.code).toBe('upstream_unavailable')
  })

  it('fails fast with no configured gateway — never a live request', async () => {
    vi.stubEnv('VITE_RELAYER_URL', '')
    const err = await publishListing(137, { order: {}, signature: '0x' }).catch((e) => e)
    expect(err.code).toBe('unconfigured')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
