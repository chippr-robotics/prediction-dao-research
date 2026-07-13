/**
 * Collectibles gateway client (spec 055) — URL shapes, 429 courtesy retry, and the
 * unavailable mapping that drives the panel's degraded state (FR-008).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fetchAccountCollectibles,
  fetchCollectibleDetail,
  fetchCollectionStats,
  CollectiblesUnavailable,
} from '../../lib/collectibles/gatewayClient'

const BASE = 'https://relay.example'
const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

const okPage = { items: [], next: null, fetchedAt: '2026-07-13T20:00:00Z', stale: false }

function jsonResponse(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  }
}

beforeEach(() => {
  vi.stubEnv('VITE_RELAYER_URL', BASE)
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('collectibles gateway client', () => {
  it('fetches account pages from the proxy with an encoded cursor', async () => {
    global.fetch.mockResolvedValue(jsonResponse(okPage))
    await fetchAccountCollectibles(137, ADDRESS, 'cur/sor')
    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE}/v1/opensea/137/account/${ADDRESS}/nfts?next=cur%2Fsor`,
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('fetches composed item detail and collection stats from their routes', async () => {
    global.fetch.mockResolvedValue(jsonResponse(okPage))
    await fetchCollectibleDetail(1, ADDRESS, '42')
    expect(global.fetch).toHaveBeenLastCalledWith(
      `${BASE}/v1/opensea/1/contract/${ADDRESS}/nfts/42`,
      expect.anything()
    )
    await fetchCollectionStats('cool-cats')
    expect(global.fetch).toHaveBeenLastCalledWith(`${BASE}/v1/opensea/collections/cool-cats/stats`, expect.anything())
  })

  it('retries once after a short Retry-After on 429, then succeeds', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'quota_exceeded' } }, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse(okPage))
    const page = await fetchAccountCollectibles(137, ADDRESS)
    expect(page).toEqual(okPage)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up immediately on 429 with a long Retry-After (no dead spinner)', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: { code: 'quota_exceeded' } }, 429, { 'retry-after': '60' }))
    await expect(fetchAccountCollectibles(137, ADDRESS)).rejects.toBeInstanceOf(CollectiblesUnavailable)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('maps gateway error envelopes to CollectiblesUnavailable with the gateway code', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ error: { code: 'upstream_unavailable', reason: 'try later' } }, 503)
    )
    const err = await fetchAccountCollectibles(137, ADDRESS).catch((e) => e)
    expect(err).toBeInstanceOf(CollectiblesUnavailable)
    expect(err.code).toBe('upstream_unavailable')
    expect(err.status).toBe(503)
  })

  it('maps transport failures to CollectiblesUnavailable', async () => {
    global.fetch.mockRejectedValue(new TypeError('network down'))
    const err = await fetchCollectionStats('cool-cats').catch((e) => e)
    expect(err).toBeInstanceOf(CollectiblesUnavailable)
    expect(err.code).toBe('network_error')
  })

  it('fails fast with no configured gateway — never a live request (FR-009 soft-fail)', async () => {
    vi.stubEnv('VITE_RELAYER_URL', '')
    const err = await fetchAccountCollectibles(137, ADDRESS).catch((e) => e)
    expect(err).toBeInstanceOf(CollectiblesUnavailable)
    expect(err.code).toBe('unconfigured')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
