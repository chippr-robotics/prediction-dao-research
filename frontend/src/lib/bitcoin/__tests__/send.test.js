import { describe, it, expect } from 'vitest'
import { HDKey } from '@scure/bip32'
import { prepareSend, executeSend, isQuoteFresh, FEE_QUOTE_TTL_MS } from '../send'
import { encodeAddress } from '../addresses'

const root = HDKey.fromMasterSeed(new Uint8Array(64).fill(9))
const key0 = root.derive("m/84'/1'/0'/0/0")
const key1 = root.derive("m/84'/1'/0'/0/1")
const addr0 = encodeAddress(key0.publicKey, { type: 'segwit', network: 'bitcoin-testnet' })
const addr1 = encodeAddress(key1.publicKey, { type: 'segwit', network: 'bitcoin-testnet' })

const DEST = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

let seq = 0
const coin = (valueSats, over = {}) => ({
  txid: `${(++seq).toString(16).padStart(2, '0')}`.repeat(32),
  vout: 0,
  valueSats,
  address: addr0,
  confirmations: 3,
  classification: 'spendable',
  scriptType: 'p2wpkh',
  lockedByTx: null,
  ...over,
})

const freshQuote = (now) => ({ rates: { fast: 10, normal: 5, slow: 1 }, fetchedAt: now })

const keyFor = (address) => {
  if (address === addr0) return { publicKey: key0.publicKey, privateKey: key0.privateKey, scriptType: 'p2wpkh' }
  if (address === addr1) return { publicKey: key1.publicKey, privateKey: key1.privateKey, scriptType: 'p2wpkh' }
  return null
}

describe('prepareSend (FR-011/012/013)', () => {
  const now = 1_000_000

  it('builds a confirmable plan with the fee as its own component', () => {
    const res = prepareSend({
      coins: [coin(100_000)],
      destination: DEST,
      amountSats: 50_000,
      feeRate: 5,
      quote: freshQuote(now),
      changeAddress: addr1,
      networkId: 'bitcoin-testnet',
      nowMs: now,
    })
    expect(res.ok).toBe(true)
    expect(res.plan.destinationType).toBe('p2wpkh')
    expect(res.plan.feeSats).toBeGreaterThan(0)
    expect(res.plan.amountSats + res.plan.feeSats + res.plan.changeSats).toBe(100_000)
    expect(res.plan.changeAddress).toBe(addr1)
  })

  it('rejects invalid and wrong-network destinations before any signing', () => {
    const bad = prepareSend({
      coins: [coin(100_000)],
      destination: '0x1234567890123456789012345678901234567890',
      amountSats: 1_000,
      feeRate: 5,
      quote: freshQuote(now),
      networkId: 'bitcoin-testnet',
      nowMs: now,
    })
    expect(bad).toMatchObject({ ok: false, error: 'invalid_destination' })
    const wrongNet = prepareSend({
      coins: [coin(100_000)],
      destination: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      amountSats: 1_000,
      feeRate: 5,
      quote: freshQuote(now),
      networkId: 'bitcoin-testnet',
      nowMs: now,
    })
    expect(wrongNet.ok).toBe(false)
  })

  it('a stale quote can never price a send (edge: fee spike)', () => {
    const res = prepareSend({
      coins: [coin(100_000)],
      destination: DEST,
      amountSats: 1_000,
      feeRate: 5,
      quote: { ...freshQuote(now), fetchedAt: now - FEE_QUOTE_TTL_MS - 1 },
      networkId: 'bitcoin-testnet',
      nowMs: now,
    })
    expect(res).toMatchObject({ ok: false, error: 'stale_fee_quote' })
    expect(isQuoteFresh(freshQuote(now), now)).toBe(true)
    expect(isQuoteFresh(null, now)).toBe(false)
  })

  it("'max' consumes all spendable coins with no change", () => {
    const res = prepareSend({
      coins: [coin(60_000), coin(40_000, { address: addr1 }), coin(30_000, { classification: 'protected' })],
      destination: DEST,
      amountSats: 'max',
      feeRate: 2,
      quote: freshQuote(now),
      networkId: 'bitcoin-testnet',
      nowMs: now,
    })
    expect(res.ok).toBe(true)
    expect(res.plan.isMax).toBe(true)
    expect(res.plan.inputs).toHaveLength(2)
    expect(res.plan.changeSats).toBe(0)
    expect(res.plan.amountSats + res.plan.feeSats).toBe(100_000)
  })

  it('surfaces shortfalls with explainable numbers', () => {
    const res = prepareSend({
      coins: [coin(10_000)],
      destination: DEST,
      amountSats: 50_000,
      feeRate: 2,
      quote: freshQuote(now),
      networkId: 'bitcoin-testnet',
      nowMs: now,
    })
    expect(res).toMatchObject({ ok: false, error: 'insufficient_funds' })
    expect(res.shortfallSats).toBeGreaterThan(0)
  })
})

describe('executeSend (FR-012/014)', () => {
  const now = 1_000_000
  const plan = (coins, amountSats = 50_000) => {
    const res = prepareSend({
      coins,
      destination: DEST,
      amountSats,
      feeRate: 5,
      quote: freshQuote(now),
      changeAddress: addr1,
      networkId: 'bitcoin-testnet',
      nowMs: now,
    })
    expect(res.ok).toBe(true)
    return res.plan
  }

  it('signs, broadcasts, and reports outpoints to lock', async () => {
    const broadcasts = []
    const gateway = {
      broadcast: async (networkId, rawTxHex) => {
        broadcasts.push({ networkId, rawTxHex })
        return { ok: true, txid: 'deadbeef' }
      },
    }
    const coins = [coin(100_000)]
    const res = await executeSend({ plan: plan(coins), keyFor, gateway })
    expect(res.ok).toBe(true)
    expect(res.txid).toBe('deadbeef')
    expect(res.lockedOutpoints).toEqual([`${coins[0].txid}:0`])
    expect(broadcasts[0].networkId).toBe('bitcoin-testnet')
    expect(broadcasts[0].rawTxHex).toMatch(/^02000000/)
  })

  it('broadcast rejection surfaces the upstream reason, nothing locked', async () => {
    const gateway = {
      broadcast: async () => ({ ok: false, error: 'broadcast_rejected', message: 'min relay fee not met' }),
    }
    const res = await executeSend({ plan: plan([coin(100_000)]), keyFor, gateway })
    expect(res).toMatchObject({ ok: false, error: 'broadcast_rejected', message: 'min relay fee not met' })
  })

  it('missing key material fails as signing_failed (never a partial broadcast)', async () => {
    const gateway = { broadcast: async () => ({ ok: true, txid: 'x' }) }
    const res = await executeSend({
      plan: plan([coin(100_000, { address: 'tb1qunknownaddr' })]),
      keyFor,
      gateway,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('signing_failed')
  })
})
