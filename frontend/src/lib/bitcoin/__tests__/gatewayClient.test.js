/**
 * Spec 061 T010 — bitcoin gateway client: chunk/merge semantics, the typed
 * error taxonomy (never-throw for expected failures, stale-not-zero flags),
 * fail-safe stamps degradation, and the capability-off signal when the
 * gateway is unconfigured or the module is disabled/killswitched.
 * fetch is fully mocked (injected fetchImpl) — no network.
 */
import { describe, it, expect, vi } from 'vitest'
import { createBitcoinGatewayClient, bitcoinGatewayUrl } from '../gatewayClient'

const BASE = 'https://relayer.fairwins.example'

const jsonRes = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const addr = (i) => `bc1qaddr${i}`

function makeClient(fetchImpl, opts = {}) {
  return createBitcoinGatewayClient({ baseUrl: BASE, fetchImpl, ...opts })
}

describe('base URL resolution', () => {
  it('reads VITE_RELAYER_URL (same source as the other gateway clients), trimming the trailing slash', () => {
    vi.stubEnv('VITE_RELAYER_URL', `${BASE}/`)
    expect(bitcoinGatewayUrl()).toBe(BASE)
    vi.stubEnv('VITE_RELAYER_URL', '')
    expect(bitcoinGatewayUrl()).toBe('')
    vi.unstubAllEnvs()
  })

  it('unconfigured gateway ⇒ capability-off result on every method, fetch never called', async () => {
    const fetchImpl = vi.fn()
    const client = createBitcoinGatewayClient({ baseUrl: '', fetchImpl })
    const off = { ok: false, error: 'unconfigured', disabled: true }
    expect(await client.lookupAddresses('bitcoin', [addr(1)])).toEqual(off)
    expect(await client.getFees('bitcoin')).toEqual(off)
    expect(await client.broadcast('bitcoin', 'aabb')).toEqual(off)
    expect(await client.getTxStatus('bitcoin', 'tx1')).toEqual(off)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('network segment mapping', () => {
  it("maps 'bitcoin' → mainnet and 'bitcoin-testnet' → testnet in the path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(200, { rates: { fast: 9, normal: 5, slow: 2 }, tipHeight: 1 }))
    const client = makeClient(fetchImpl)
    await client.getFees('bitcoin')
    await client.getFees('bitcoin-testnet')
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/v1/bitcoin/mainnet/fees`)
    expect(fetchImpl.mock.calls[1][0]).toBe(`${BASE}/v1/bitcoin/testnet/fees`)
  })

  it('rejects unknown networks loudly (programmer error, not a member state)', async () => {
    const client = makeClient(vi.fn())
    await expect(client.getFees('dogecoin')).rejects.toThrow(/unknown network/)
  })
})

describe('lookupAddresses — chunking and merge', () => {
  it('auto-chunks >50 addresses into ≤50 batches and merges results + max tipHeight', async () => {
    const addresses = Array.from({ length: 60 }, (_, i) => addr(i))
    const fetchImpl = vi.fn(async (url, { body }) => {
      const batch = JSON.parse(body).addresses
      return jsonRes(200, {
        tipHeight: batch.length === 50 ? 903_210 : 903_211,
        results: batch.map((a) => ({ address: a, confirmedSats: 1, pendingSats: 0, utxos: [] })),
      })
    })
    const res = await makeClient(fetchImpl).lookupAddresses('bitcoin', addresses)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).addresses).toHaveLength(50)
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).addresses).toHaveLength(10)
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST')

    expect(res.ok).toBe(true)
    expect(res.tipHeight).toBe(903_211) // max across chunks
    expect(res.results).toHaveLength(60)
    expect(res.results.map((r) => r.address)).toEqual(addresses) // order preserved
  })

  it('a failed chunk fails the WHOLE lookup with its stale semantics (no silent partial balance)', async () => {
    const addresses = Array.from({ length: 51 }, (_, i) => addr(i))
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(200, { tipHeight: 1, results: [] }))
      .mockResolvedValueOnce(jsonRes(502, { error: 'upstream_unavailable', message: 'esplora down' }))
    const res = await makeClient(fetchImpl).lookupAddresses('bitcoin', addresses)
    expect(res).toEqual({ ok: false, error: 'upstream_unavailable', stale: true })
  })

  it('empty address list short-circuits without a request', async () => {
    const fetchImpl = vi.fn()
    expect(await makeClient(fetchImpl).lookupAddresses('bitcoin', [])).toEqual({ ok: true, tipHeight: null, results: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('error taxonomy (expected classes never throw)', () => {
  it('503 bitcoin_disabled ⇒ capability-off signal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(503, { error: 'bitcoin_disabled', message: 'off' }))
    expect(await makeClient(fetchImpl).getFees('bitcoin')).toEqual({ ok: false, error: 'bitcoin_disabled', disabled: true })
  })

  it('503 bitcoin_killed (ops killswitch) ⇒ capability-off signal with the honest slug', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(503, { error: 'bitcoin_killed', message: 'ops kill' }))
    expect(await makeClient(fetchImpl).getFees('bitcoin')).toEqual({ ok: false, error: 'bitcoin_killed', disabled: true })
  })

  it('429 quota ⇒ stale (portfolio renders last-known, never zero)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(429, { error: 'quota_exceeded' }))
    expect(await makeClient(fetchImpl).lookupAddresses('bitcoin', [addr(1)])).toEqual({ ok: false, error: 'quota', stale: true })
  })

  it('502 upstream ⇒ upstream_unavailable, stale', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(502, { error: 'upstream_unavailable' }))
    expect(await makeClient(fetchImpl).getFees('bitcoin')).toEqual({ ok: false, error: 'upstream_unavailable', stale: true })
  })

  it('transport failure ⇒ network_error, stale', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await makeClient(fetchImpl).getFees('bitcoin')).toEqual({ ok: false, error: 'network_error', stale: true })
  })

  it('400 invalid_address surfaces the gateway slug + message, not stale', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(400, { error: 'invalid_address', message: 'bad hrp' }))
    const res = await makeClient(fetchImpl).lookupAddresses('bitcoin', [addr(1)])
    expect(res).toEqual({ ok: false, error: 'invalid_address', status: 400, message: 'bad hrp' })
  })
})

describe('broadcast', () => {
  it('returns the txid on success and posts { rawTx } to /tx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(200, { txid: 'deadbeef' }))
    const res = await makeClient(fetchImpl).broadcast('bitcoin-testnet', 'aabbcc')
    expect(res).toEqual({ ok: true, txid: 'deadbeef' })
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/v1/bitcoin/testnet/tx`)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ rawTx: 'aabbcc' })
  })

  it('upstream rejection surfaces the reason verbatim-safe', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(400, { error: 'broadcast_rejected', message: 'min relay fee not met' }))
    const res = await makeClient(fetchImpl).broadcast('bitcoin', 'aabbcc')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('broadcast_rejected')
    expect(res.message).toBe('min relay fee not met')
  })

  it('rejects non-hex payloads before any network call (programmer error)', async () => {
    const fetchImpl = vi.fn()
    await expect(makeClient(fetchImpl).broadcast('bitcoin', 'not hex!')).rejects.toThrow(/hex/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('getTxStatus', () => {
  it('maps a confirmed tx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(200, { txid: 't1', confirmed: true, blockHeight: 10, confirmations: 3 }))
    expect(await makeClient(fetchImpl).getTxStatus('bitcoin', 't1')).toEqual({
      ok: true,
      found: true,
      txid: 't1',
      confirmed: true,
      blockHeight: 10,
      confirmations: 3,
    })
  })

  it('404 tx_not_found is NOT an error — the tx stays pending for retry/backoff', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(404, { error: 'tx_not_found' }))
    expect(await makeClient(fetchImpl).getTxStatus('bitcoin', 't2')).toEqual({
      ok: true,
      found: false,
      txid: 't2',
      confirmed: false,
      confirmations: 0,
    })
  })

  it('disabled module still propagates as capability-off', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(503, { error: 'bitcoin_disabled' }))
    expect(await makeClient(fetchImpl).getTxStatus('bitcoin', 't3')).toEqual({ ok: false, error: 'bitcoin_disabled', disabled: true })
  })
})

describe('getStamps — chunking + fail-safe degradation', () => {
  it('chunks ≤50 per GET and merges stamps', async () => {
    const addresses = Array.from({ length: 51 }, (_, i) => addr(i))
    const fetchImpl = vi.fn(async (url) => {
      const count = new URL(url).searchParams.get('addresses').split(',').length
      return jsonRes(200, { degraded: false, stamps: [{ stampId: `S${count}` }] })
    })
    const res = await makeClient(fetchImpl).getStamps('bitcoin', addresses)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[0][0]).toContain('/v1/bitcoin/mainnet/stamps?addresses=')
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('addresses').split(',')).toHaveLength(50)
    expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('addresses').split(',')).toHaveLength(1)
    expect(res).toEqual({ ok: true, degraded: false, stamps: [{ stampId: 'S50' }, { stampId: 'S1' }] })
  })

  it('ANY degraded chunk degrades the merged result (fail-safe, FR-019)', async () => {
    const addresses = Array.from({ length: 51 }, (_, i) => addr(i))
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(200, { degraded: false, stamps: [{ stampId: 'A' }] }))
      .mockResolvedValueOnce(jsonRes(200, { degraded: true, stamps: [] }))
    const res = await makeClient(fetchImpl).getStamps('bitcoin', addresses)
    expect(res).toEqual({ ok: true, degraded: true, stamps: [{ stampId: 'A' }] })
  })

  it('a hard-failed chunk also degrades (partial knowledge must protect), keeping successful chunks', async () => {
    const addresses = Array.from({ length: 51 }, (_, i) => addr(i))
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(200, { degraded: false, stamps: [{ stampId: 'A' }] }))
      .mockResolvedValueOnce(jsonRes(502, { error: 'upstream_unavailable' }))
    const res = await makeClient(fetchImpl).getStamps('bitcoin', addresses)
    expect(res).toEqual({ ok: true, degraded: true, stamps: [{ stampId: 'A' }] })
  })

  it('disabled module fails the whole call as capability-off (not merely degraded)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes(503, { error: 'bitcoin_disabled' }))
    expect(await makeClient(fetchImpl).getStamps('bitcoin', [addr(1)])).toEqual({ ok: false, error: 'bitcoin_disabled', disabled: true })
  })

  it('empty address list short-circuits, never degraded', async () => {
    const fetchImpl = vi.fn()
    expect(await makeClient(fetchImpl).getStamps('bitcoin', [])).toEqual({ ok: true, degraded: false, stamps: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
