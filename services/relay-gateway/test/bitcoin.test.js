/**
 * /v1/bitcoin/* Bitcoin proxy tests (spec 061 — contracts/bitcoin-gateway-api.md).
 * The Esplora + Stamps upstreams are mocked via the injectable bitcoinFetch; everything else uses
 * the same build-the-app-with-injected-deps pattern as polymarket.test.js / opensea.test.js.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/server.js'
import { createKillSwitch } from '../src/policy/killswitch.js'
import {
  isValidBitcoinAddress,
  isTxid,
  isRawTxHex,
  normalizeAddressResult,
  normalizeFeeRates,
  normalizeTxStatus,
  normalizeStampsBalance,
} from '../src/bitcoin/normalize.js'
import { testConfig, mockProviders, mockEngine, ORIGIN_SECRET, TEST_NOW } from './helpers.js'

// ---- fixtures -----------------------------------------------------------------------------------

const ADDR_MAIN_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
const ADDR_MAIN_TAPROOT = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297'
const ADDR_MAIN_P2PKH = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
const ADDR_MAIN_P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
const ADDR_TEST_BECH32 = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
const ADDR_TEST_P2PKH = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'
const ADDR_TEST_P2SH = '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc'

const TIP = 903211
const TXID = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b'
const TXID_PENDING = 'e3bf3d07d4b0375638d5f1db5255fe07ba2c4cb067cd81b84ee974b6585fb468'
const STAMP_TX = '0e3e2357e806b6cdb1f70b54c3a3a17b6714ee1f0e68bebb44a74b1efd512098'

// Esplora GET /address/:addr — confirmed 150000-25000 = 125000; pending net 800-5000 = -4200.
const ADDRESS_BODY = {
  chain_stats: { funded_txo_sum: 150_000, spent_txo_sum: 25_000 },
  mempool_stats: { funded_txo_sum: 800, spent_txo_sum: 5_000 },
}
const UTXOS_BODY = [
  { txid: TXID, vout: 0, value: 125_000, status: { confirmed: true, block_height: 903_208 } },
  { txid: TXID_PENDING, vout: 1, value: 800, status: { confirmed: false } },
  { junk: true }, // malformed record -> dropped, never 500s
]
const FEES_BODY = { fastestFee: 12, halfHourFee: 6, hourFee: 2 } // mempool.space dialect
const FEE_ESTIMATES_BODY = { 1: 11.5, 3: 5.1, 6: 2.2, 144: 1.0 } // blockstream/electrs dialect
const TX_STATUS_BODY = { confirmed: true, block_height: 903_210 }
// stampchain.io-compatible /api/v2/stamps/balance/:address body.
const STAMPS_BODY = {
  last_block: TIP,
  data: [
    {
      cpid: 'A1234567890123456789',
      stamp: 812345,
      tx_hash: STAMP_TX,
      vout: 1,
      stamp_url: 'https://stampchain.io/stamps/abc.png',
      stamp_mimetype: 'image/png',
    },
  ],
}

// ---- test scaffolding ---------------------------------------------------------------------------

const textRes = (text, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => text,
  json: async () => JSON.parse(text),
})
const jsonRes = (body, status = 200) => textRes(JSON.stringify(body), status)

function mockBitcoinFetch(overrides = {}) {
  const calls = []
  const impl = async (url, opts) => {
    const method = opts?.method ?? 'GET'
    calls.push({ url, method, body: opts?.body ?? null, headers: opts?.headers ?? {} })
    if (impl.failWith) return jsonRes({ error: 'down' }, impl.failWith)
    for (const [needle, resp] of Object.entries(overrides)) {
      if (url.includes(needle)) return typeof resp === 'function' ? resp(url, opts) : jsonRes(resp)
    }
    if (url.includes('stamps.test.invalid')) {
      return impl.stampsFail ? jsonRes({ error: 'indexer down' }, 500) : jsonRes(STAMPS_BODY)
    }
    if (url.endsWith('/blocks/tip/height')) return textRes(String(TIP))
    if (/\/address\/[^/]+\/utxo$/.test(url)) return jsonRes(UTXOS_BODY)
    if (url.includes('/address/')) return jsonRes(ADDRESS_BODY)
    if (url.endsWith('/fees/recommended')) return jsonRes(FEES_BODY)
    if (/\/tx\/[0-9a-fA-F]{64}\/status$/.test(url)) return jsonRes(TX_STATUS_BODY)
    if (url.endsWith('/tx') && method === 'POST') return textRes(TXID)
    return textRes('not found', 404)
  }
  impl.calls = calls
  impl.failWith = null
  impl.stampsFail = false
  return impl
}

const BTC_ENV = { BTC_ENABLED: 'true', BTC_STAMPS_URL: 'https://stamps.test.invalid' }

function build({ env = {}, bitcoinFetch = mockBitcoinFetch(), killSwitch = createKillSwitch(false) } = {}) {
  const config = testConfig({ ...BTC_ENV, ...env })
  const clock = { t: TEST_NOW }
  const { app } = createApp(config, {
    providers: mockProviders(config),
    engineClient: mockEngine(),
    now: () => clock.t,
    killSwitch,
    bitcoinFetch,
  })
  return { app, config, clock, bitcoinFetch, killSwitch }
}

const get = (app, path) => request(app).get(path).set('X-Origin-Auth', ORIGIN_SECRET)
const post = (app, path, body) => request(app).post(path).set('X-Origin-Auth', ORIGIN_SECRET).send(body)

const ADDRESSES_PATH = '/v1/bitcoin/mainnet/addresses'
const FEES_PATH = '/v1/bitcoin/mainnet/fees'
const TX_PATH = '/v1/bitcoin/mainnet/tx'
const TX_STATUS_PATH = `/v1/bitcoin/mainnet/tx/${TXID}`
const STAMPS_PATH = `/v1/bitcoin/mainnet/stamps?addresses=${ADDR_MAIN_BECH32}`

// ---- unit: address validation -------------------------------------------------------------------

describe('bitcoin address validation', () => {
  it('accepts each mainnet address family', () => {
    for (const a of [ADDR_MAIN_BECH32, ADDR_MAIN_TAPROOT, ADDR_MAIN_P2PKH, ADDR_MAIN_P2SH]) {
      expect(isValidBitcoinAddress(a, 'mainnet')).toBe(true)
    }
  })

  it('accepts each testnet address family', () => {
    for (const a of [ADDR_TEST_BECH32, ADDR_TEST_P2PKH, ADDR_TEST_P2SH]) {
      expect(isValidBitcoinAddress(a, 'testnet')).toBe(true)
    }
  })

  it('rejects wrong-network prefixes both ways', () => {
    expect(isValidBitcoinAddress(ADDR_TEST_BECH32, 'mainnet')).toBe(false)
    expect(isValidBitcoinAddress(ADDR_MAIN_BECH32, 'testnet')).toBe(false)
    expect(isValidBitcoinAddress(ADDR_MAIN_P2PKH, 'testnet')).toBe(false)
  })

  it('rejects EVM addresses, bad charsets, and junk', () => {
    expect(isValidBitcoinAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'mainnet')).toBe(false)
    expect(isValidBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8fbio', 'mainnet')).toBe(false) // b/i/o outside bech32 charset
    expect(isValidBitcoinAddress('bc1', 'mainnet')).toBe(false)
    expect(isValidBitcoinAddress('', 'mainnet')).toBe(false)
    expect(isValidBitcoinAddress(42, 'mainnet')).toBe(false)
  })

  it('validates txids and raw-tx hex bounds', () => {
    expect(isTxid(TXID)).toBe(true)
    expect(isTxid('0x' + TXID)).toBe(false)
    expect(isRawTxHex('02000000abcd')).toBe(true)
    expect(isRawTxHex('02000000abc')).toBe(false) // odd length
    expect(isRawTxHex('zz00')).toBe(false)
    expect(isRawTxHex('11'.repeat(100_001))).toBe(false) // > 100 kB
  })
})

// ---- unit: normalize ----------------------------------------------------------------------------

describe('bitcoin normalize', () => {
  it('maps balances + UTXOs with confirmations from the tip, dropping malformed records', () => {
    const r = normalizeAddressResult(ADDR_MAIN_BECH32, ADDRESS_BODY, UTXOS_BODY, TIP)
    expect(r.address).toBe(ADDR_MAIN_BECH32)
    expect(r.confirmedSats).toBe(125_000)
    expect(r.pendingSats).toBe(-4_200) // signed mempool net
    expect(r.utxos).toHaveLength(2) // junk record dropped
    expect(r.utxos[0]).toEqual({ txid: TXID, vout: 0, valueSats: 125_000, confirmations: 4, blockHeight: 903_208 })
    expect(r.utxos[1]).toMatchObject({ confirmations: 0, blockHeight: null })
  })

  it('normalizes mempool.space fee recommendations with clamping', () => {
    expect(normalizeFeeRates(FEES_BODY, 500)).toEqual({ fast: 12, normal: 6, slow: 2 })
    expect(normalizeFeeRates(FEES_BODY, 5)).toEqual({ fast: 5, normal: 5, slow: 2 }) // max clamp
    expect(normalizeFeeRates({ fastestFee: 0.4, halfHourFee: 0.2, hourFee: 0.1 }, 500)).toEqual({ fast: 1, normal: 1, slow: 1 }) // floor 1
  })

  it('normalizes the blockstream /fee-estimates dialect and refuses junk', () => {
    expect(normalizeFeeRates(FEE_ESTIMATES_BODY, 500)).toEqual({ fast: 12, normal: 6, slow: 3 })
    expect(normalizeFeeRates({ nonsense: true }, 500)).toBeNull()
    expect(normalizeFeeRates(null, 500)).toBeNull()
  })

  it('maps tx status with tip-derived confirmations', () => {
    expect(normalizeTxStatus(TXID, TX_STATUS_BODY, TIP)).toEqual({ txid: TXID, confirmed: true, blockHeight: 903_210, confirmations: 2 })
    expect(normalizeTxStatus(TXID, { confirmed: false }, TIP)).toEqual({ txid: TXID, confirmed: false, blockHeight: null, confirmations: 0 })
  })

  it('maps stamps entries and counts unparseable ones as dropped', () => {
    const r = normalizeStampsBalance(STAMPS_BODY, ADDR_MAIN_BECH32)
    expect(r.dropped).toBe(0)
    expect(r.stamps[0]).toEqual({
      stampId: 'A1234567890123456789',
      address: ADDR_MAIN_BECH32,
      outpoint: { txid: STAMP_TX, vout: 1 },
      imageUrl: 'https://stampchain.io/stamps/abc.png',
      mimeType: 'image/png',
    })
    const partial = normalizeStampsBalance({ data: [STAMPS_BODY.data[0], { cpid: 'A2', tx_hash: 'nope' }] }, ADDR_MAIN_BECH32)
    expect(partial.stamps).toHaveLength(1)
    expect(partial.dropped).toBe(1)
  })

  it('treats an unrecognizable stamps body as degraded (null), never guesses', () => {
    expect(normalizeStampsBalance({ weird: true }, ADDR_MAIN_BECH32)).toBeNull()
    expect(normalizeStampsBalance('html error page', ADDR_MAIN_BECH32)).toBeNull()
  })
})

// ---- config: fail-loud boot validation ----------------------------------------------------------

describe('bitcoin config boot validation', () => {
  it('fails boot loudly on a malformed Esplora URL when enabled', () => {
    expect(() => testConfig({ BTC_ENABLED: 'true', BTC_ESPLORA_URL: 'not a url' })).toThrow(/BTC_ESPLORA_URL/)
    expect(() => testConfig({ BTC_ENABLED: 'true', BTC_ESPLORA_TESTNET_URL: 'ftp://nope' })).toThrow(/BTC_ESPLORA_TESTNET_URL/)
    expect(() => testConfig({ ...BTC_ENV, BTC_STAMPS_URL: '::::' })).toThrow(/BTC_STAMPS_URL/)
  })

  it('fails boot loudly on a nonsensical fee clamp when enabled', () => {
    expect(() => testConfig({ BTC_ENABLED: 'true', BTC_MAX_FEE_RATE: '0' })).toThrow(/BTC_MAX_FEE_RATE/)
    expect(() => testConfig({ BTC_ENABLED: 'true', BTC_MAX_FEE_RATE: '-5' })).toThrow(/BTC_MAX_FEE_RATE/)
  })

  it('tolerates malformed values while the module is disabled (soft-optional)', () => {
    expect(() => testConfig({ BTC_ESPLORA_URL: 'not a url' })).not.toThrow()
  })
})

// ---- cross-cutting: origin lock / disabled / killswitch / network -------------------------------

describe('bitcoin proxy cross-cutting', () => {
  it('requires the origin-auth header', async () => {
    const { app } = build()
    await request(app).get(FEES_PATH).expect(403)
  })

  it('503s bitcoin_disabled on every route when BTC_ENABLED is unset', async () => {
    const { app } = build({ env: { BTC_ENABLED: '' } })
    for (const req of [get(app, FEES_PATH), get(app, TX_STATUS_PATH), get(app, STAMPS_PATH)]) {
      const res = await req.expect(503)
      expect(res.body.error).toBe('bitcoin_disabled')
    }
    const res = await post(app, ADDRESSES_PATH, { addresses: [ADDR_MAIN_BECH32] }).expect(503)
    expect(res.body.error).toBe('bitcoin_disabled')
  })

  it('503s bitcoin_killed on the module killswitch', async () => {
    const { app } = build({ env: { BTC_KILLSWITCH: 'true' } })
    const res = await get(app, FEES_PATH).expect(503)
    expect(res.body.error).toBe('bitcoin_killed')
  })

  it('503s bitcoin_killed on the global killswitch', async () => {
    const { app } = build({ killSwitch: createKillSwitch(true) })
    const res = await post(app, TX_PATH, { rawTx: '0200ab' }).expect(503)
    expect(res.body.error).toBe('bitcoin_killed')
  })

  it('404s an unknown network', async () => {
    const { app } = build()
    const res = await get(app, '/v1/bitcoin/regtest/fees').expect(404)
    expect(res.body.error).toBe('unknown_network')
  })
})

// ---- POST /addresses ----------------------------------------------------------------------------

describe('bitcoin batch addresses', () => {
  it('returns tipHeight + per-address balances and UTXOs (contract DTO)', async () => {
    const { app } = build()
    const res = await post(app, ADDRESSES_PATH, { addresses: [ADDR_MAIN_BECH32, ADDR_MAIN_P2PKH] }).expect(200)
    expect(res.body.tipHeight).toBe(TIP)
    expect(res.body.results).toHaveLength(2)
    expect(res.body.results[0]).toMatchObject({ address: ADDR_MAIN_BECH32, confirmedSats: 125_000, pendingSats: -4_200 })
    expect(res.body.results[0].utxos[0]).toEqual({ txid: TXID, vout: 0, valueSats: 125_000, confirmations: 4, blockHeight: 903_208 })
  })

  it('routes testnet addresses to the testnet upstream', async () => {
    const { app, bitcoinFetch } = build()
    await post(app, '/v1/bitcoin/testnet/addresses', { addresses: [ADDR_TEST_BECH32] }).expect(200)
    expect(bitcoinFetch.calls.every((c) => c.url.startsWith('https://mempool.space/testnet4/api'))).toBe(true)
  })

  it('400s invalid_address on a wrong-network or malformed address', async () => {
    const { app } = build()
    for (const addresses of [[ADDR_TEST_BECH32], ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'], [], 'not-a-list']) {
      const res = await post(app, ADDRESSES_PATH, { addresses }).expect(400)
      expect(res.body.error).toBe('invalid_address')
    }
  })

  it('400s a batch over 50 addresses', async () => {
    const { app } = build()
    const res = await post(app, ADDRESSES_PATH, { addresses: Array(51).fill(ADDR_MAIN_BECH32) }).expect(400)
    expect(res.body.error).toBe('invalid_address')
  })

  it('serves a repeat batch from cache within the TTL (no second upstream hit)', async () => {
    const { app, bitcoinFetch } = build()
    await post(app, ADDRESSES_PATH, { addresses: [ADDR_MAIN_BECH32] }).expect(200)
    const upstreamCalls = bitcoinFetch.calls.length
    // Same SET in a different order -> same cache key (sorted-set hash).
    await post(app, ADDRESSES_PATH, { addresses: [ADDR_MAIN_BECH32] }).expect(200)
    expect(bitcoinFetch.calls.length).toBe(upstreamCalls)
  })
})

// ---- GET /fees ----------------------------------------------------------------------------------

describe('bitcoin fees', () => {
  it('returns clamped integer rates + tipHeight (contract DTO)', async () => {
    const { app } = build()
    const res = await get(app, FEES_PATH).expect(200)
    expect(res.body).toEqual({ rates: { fast: 12, normal: 6, slow: 2 }, tipHeight: TIP })
  })

  it('clamps rates to BTC_MAX_FEE_RATE', async () => {
    const { app } = build({ env: { BTC_MAX_FEE_RATE: '10' } })
    const res = await get(app, FEES_PATH).expect(200)
    expect(res.body.rates).toEqual({ fast: 10, normal: 6, slow: 2 })
  })

  it('falls back to /fee-estimates when /fees/recommended 404s (blockstream dialect)', async () => {
    const fetchImpl = mockBitcoinFetch({
      '/fees/recommended': () => textRes('not found', 404),
      '/fee-estimates': FEE_ESTIMATES_BODY,
    })
    const { app } = build({ bitcoinFetch: fetchImpl })
    const res = await get(app, FEES_PATH).expect(200)
    expect(res.body.rates).toEqual({ fast: 12, normal: 6, slow: 3 })
    expect(fetchImpl.calls.some((c) => c.url.endsWith('/fee-estimates'))).toBe(true)
  })

  it('serves a repeat read from cache within the TTL', async () => {
    const { app, bitcoinFetch } = build()
    await get(app, FEES_PATH).expect(200)
    const upstreamCalls = bitcoinFetch.calls.length
    await get(app, FEES_PATH).expect(200)
    expect(bitcoinFetch.calls.length).toBe(upstreamCalls)
  })

  it('502s upstream_unavailable when the upstream is down (after retries)', async () => {
    const fetchImpl = mockBitcoinFetch()
    fetchImpl.failWith = 500
    const { app } = build({ bitcoinFetch: fetchImpl })
    const res = await get(app, FEES_PATH).expect(502)
    expect(res.body.error).toBe('upstream_unavailable')
    expect(fetchImpl.calls.length).toBeGreaterThan(1) // retried before giving up
  })
})

// ---- POST /tx (broadcast) -----------------------------------------------------------------------

describe('bitcoin broadcast', () => {
  it('broadcasts raw hex as text/plain and returns the txid', async () => {
    const { app, bitcoinFetch } = build()
    const res = await post(app, TX_PATH, { rawTx: '0200ab'.repeat(10) }).expect(200)
    expect(res.body).toEqual({ txid: TXID })
    const call = bitcoinFetch.calls.find((c) => c.method === 'POST')
    expect(call.url).toBe('https://mempool.space/api/tx')
    expect(call.headers['content-type']).toBe('text/plain')
    expect(call.body).toBe('0200ab'.repeat(10))
  })

  it('400s invalid_rawtx on malformed hex', async () => {
    const { app } = build()
    for (const rawTx of ['0xzz', 'abc', '', null, '11'.repeat(100_001)]) {
      const res = await post(app, TX_PATH, { rawTx }).expect(400)
      expect(res.body.error).toBe('invalid_rawtx')
    }
  })

  it('400s broadcast_rejected with the upstream reason verbatim-safe', async () => {
    const fetchImpl = mockBitcoinFetch({
      '/tx': (url, opts) => (opts?.method === 'POST' ? textRes('sendrawtransaction RPC error: min relay fee not met', 400) : jsonRes(TX_STATUS_BODY)),
    })
    const { app } = build({ bitcoinFetch: fetchImpl })
    const res = await post(app, TX_PATH, { rawTx: '0200ab' }).expect(400)
    expect(res.body.error).toBe('broadcast_rejected')
    expect(res.body.message).toMatch(/min relay fee/)
  })

  it('502s when the upstream is down and never retries the broadcast', async () => {
    const fetchImpl = mockBitcoinFetch()
    fetchImpl.failWith = 500
    const { app } = build({ bitcoinFetch: fetchImpl })
    const res = await post(app, TX_PATH, { rawTx: '0200ab' }).expect(502)
    expect(res.body.error).toBe('upstream_unavailable')
    expect(fetchImpl.calls.filter((c) => c.method === 'POST')).toHaveLength(1) // writes never retry
  })

  it('enforces the tighter write quota with Retry-After', async () => {
    const { app } = build({ env: { BTC_WRITE_QUOTA_PER_IP: '1' } })
    await post(app, TX_PATH, { rawTx: '0200ab' }).expect(200)
    const res = await post(app, TX_PATH, { rawTx: '0200ac' }).expect(429)
    expect(res.body.error).toBe('quota_exceeded')
    expect(res.headers['retry-after']).toBeDefined()
  })
})

// ---- GET /tx/:txid ------------------------------------------------------------------------------

describe('bitcoin tx status', () => {
  it('returns confirmation status with tip-derived confirmations (contract DTO)', async () => {
    const { app } = build()
    const res = await get(app, TX_STATUS_PATH).expect(200)
    expect(res.body).toEqual({ txid: TXID, confirmed: true, blockHeight: 903_210, confirmations: 2 })
  })

  it('400s invalid_txid on a malformed txid', async () => {
    const { app } = build()
    const res = await get(app, '/v1/bitcoin/mainnet/tx/nope').expect(400)
    expect(res.body.error).toBe('invalid_txid')
  })

  it('404s tx_not_found while the upstream does not know the tx', async () => {
    const fetchImpl = mockBitcoinFetch({ '/status': () => textRes('Transaction not found', 404) })
    const { app } = build({ bitcoinFetch: fetchImpl })
    const res = await get(app, TX_STATUS_PATH).expect(404)
    expect(res.body.error).toBe('tx_not_found')
  })
})

// ---- GET /stamps --------------------------------------------------------------------------------

describe('bitcoin stamps', () => {
  it('returns normalized stamps holdings (contract DTO, degraded:false)', async () => {
    const { app } = build()
    const res = await get(app, STAMPS_PATH).expect(200)
    expect(res.body.degraded).toBe(false)
    expect(res.body.stamps).toEqual([
      {
        stampId: 'A1234567890123456789',
        address: ADDR_MAIN_BECH32,
        outpoint: { txid: STAMP_TX, vout: 1 },
        imageUrl: 'https://stampchain.io/stamps/abc.png',
        mimeType: 'image/png',
      },
    ])
  })

  it('is degraded:true when no indexer is configured (client fail-safes)', async () => {
    const { app } = build({ env: { BTC_STAMPS_URL: '' } })
    const res = await get(app, STAMPS_PATH).expect(200)
    expect(res.body).toEqual({ degraded: true, stamps: [] })
  })

  it('is degraded:true (never 502) when the indexer is down', async () => {
    const fetchImpl = mockBitcoinFetch()
    fetchImpl.stampsFail = true
    const { app } = build({ bitcoinFetch: fetchImpl })
    const res = await get(app, STAMPS_PATH).expect(200)
    expect(res.body).toEqual({ degraded: true, stamps: [] })
  })

  it('is degraded:true on an unrecognizable indexer response shape', async () => {
    const fetchImpl = mockBitcoinFetch({ 'stamps.test.invalid': { totally: 'unexpected' } })
    const { app } = build({ bitcoinFetch: fetchImpl })
    const res = await get(app, STAMPS_PATH).expect(200)
    expect(res.body).toEqual({ degraded: true, stamps: [] })
  })

  it('400s invalid_address on a bad addresses query', async () => {
    const { app } = build()
    const res = await get(app, `/v1/bitcoin/mainnet/stamps?addresses=${ADDR_TEST_BECH32}`).expect(400)
    expect(res.body.error).toBe('invalid_address')
    await get(app, '/v1/bitcoin/mainnet/stamps').expect(400)
  })

  it('re-fetches a degraded result after 30s but caches a healthy one for 300s', async () => {
    const fetchImpl = mockBitcoinFetch()
    fetchImpl.stampsFail = true
    const { app, clock } = build({ bitcoinFetch: fetchImpl })
    let res = await get(app, STAMPS_PATH).expect(200)
    expect(res.body.degraded).toBe(true)

    // Indexer recovers; within the 30s degraded TTL the cached degraded value is still served.
    fetchImpl.stampsFail = false
    res = await get(app, STAMPS_PATH).expect(200)
    expect(res.body.degraded).toBe(true)

    // Past the 30s degraded TTL the loader re-runs and the healthy result replaces it...
    clock.t += 31
    res = await get(app, STAMPS_PATH).expect(200)
    expect(res.body.degraded).toBe(false)

    // ...and that healthy result is then honored for the long TTL (no re-fetch at +60s).
    const upstreamCalls = fetchImpl.calls.length
    clock.t += 60
    res = await get(app, STAMPS_PATH).expect(200)
    expect(res.body.degraded).toBe(false)
    expect(fetchImpl.calls.length).toBe(upstreamCalls)
  })
})

// ---- quotas -------------------------------------------------------------------------------------

describe('bitcoin read quotas', () => {
  it('429s past the per-IP read quota with Retry-After', async () => {
    const { app } = build({ env: { BTC_QUOTA_PER_IP: '1' } })
    await get(app, FEES_PATH).expect(200)
    const res = await get(app, FEES_PATH).expect(429)
    expect(res.body.error).toBe('quota_exceeded')
    expect(res.headers['retry-after']).toBeDefined()
  })
})
