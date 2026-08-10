import { describe, it, expect } from 'vitest'
import { loadBitcoinHoldings, toBitcoinHolding } from '../portfolioSource'
import { ledgerStore } from '../wallet'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  }
}

const ACCOUNT = '0xabc'

function seededStore(addresses = [{ address: 'tb1qaddr0', type: 'segwit', index: 0 }]) {
  const store = ledgerStore(memoryStorage())
  store.set(ACCOUNT, 'bitcoin-testnet', { issued: addresses, preferredType: 'segwit' })
  return store
}

const okLookup = (utxosByAddress = {}) => ({
  ok: true,
  results: Object.entries(utxosByAddress).map(([address, utxos]) => ({
    address,
    confirmedSats: utxos.reduce((s, u) => s + (u.confirmations > 0 ? u.valueSats : 0), 0),
    pendingSats: 0,
    utxos,
  })),
})

const healthyStamps = (stamps = []) => ({ ok: true, degraded: false, stamps })

describe('loadBitcoinHoldings (spec 061 — FR-008/009/010/018/019)', () => {
  it('returns no holding for accounts that never used bitcoin (no zero claim)', async () => {
    const res = await loadBitcoinHoldings({
      account: ACCOUNT,
      networkIds: ['bitcoin-testnet'],
      gateway: { lookupAddresses: () => { throw new Error('must not be called') }, getStamps: () => {} },
      store: ledgerStore(memoryStorage()),
    })
    expect(res.holdings).toHaveLength(0)
    expect(res.failed).toHaveLength(0)
  })

  it('sums confirmed/pending/protected across issued addresses', async () => {
    const store = seededStore([
      { address: 'tb1qaddr0', type: 'segwit', index: 0 },
      { address: 'tb1paddr1', type: 'taproot', index: 0 },
    ])
    const gateway = {
      lookupAddresses: async () =>
        okLookup({
          tb1qaddr0: [
            { txid: 'a', vout: 0, valueSats: 60_000, confirmations: 4 },
            { txid: 'b', vout: 0, valueSats: 10_000, confirmations: 0 },
          ],
          tb1paddr1: [{ txid: 'c', vout: 1, valueSats: 30_000, confirmations: 2 }],
        }),
      getStamps: async () =>
        healthyStamps([{ stampId: 'S1', outpoint: { txid: 'c', vout: 1 } }]),
    }
    const res = await loadBitcoinHoldings({
      account: ACCOUNT,
      networkIds: ['bitcoin-testnet'],
      gateway,
      store,
    })
    expect(res.failed).toHaveLength(0)
    expect(res.holdings).toHaveLength(1)
    const h = res.holdings[0]
    expect(h.confirmedSats).toBe(90_000)
    expect(h.pendingSats).toBe(10_000)
    expect(h.protectedSats).toBe(30_000) // the stamp-bearing taproot coin
    expect(h.spendableSats).toBe(60_000)
    expect(h.stampsDegraded).toBe(false)
    expect(h.asset).toMatchObject({ id: 'btc-native', chainId: 'bitcoin-testnet', symbol: 'BTC' })
  })

  it('gateway failure reports BTC as failed — never zero (FR-010)', async () => {
    const res = await loadBitcoinHoldings({
      account: ACCOUNT,
      networkIds: ['bitcoin-testnet'],
      gateway: {
        lookupAddresses: async () => ({ ok: false, error: 'upstream_unavailable', stale: true }),
        getStamps: async () => healthyStamps(),
      },
      store: seededStore(),
    })
    expect(res.holdings).toHaveLength(0)
    expect(res.failed).toEqual(['BTC'])
  })

  it('degraded stamps recognition protects all confirmed value (fail-safe)', async () => {
    const gateway = {
      lookupAddresses: async () =>
        okLookup({ tb1qaddr0: [{ txid: 'a', vout: 0, valueSats: 50_000, confirmations: 3 }] }),
      getStamps: async () => ({ ok: true, degraded: true, stamps: [] }),
    }
    const res = await loadBitcoinHoldings({
      account: ACCOUNT,
      networkIds: ['bitcoin-testnet'],
      gateway,
      store: seededStore(),
    })
    const h = res.holdings[0]
    expect(h.stampsDegraded).toBe(true)
    expect(h.confirmedSats).toBe(50_000)
    expect(h.protectedSats).toBe(50_000)
    expect(h.spendableSats).toBe(0)
  })

  it('networks are independent: only in-scope ids load (FR-021)', async () => {
    const calls = []
    const gateway = {
      lookupAddresses: async (networkId) => {
        calls.push(networkId)
        return okLookup({})
      },
      getStamps: async () => healthyStamps(),
    }
    await loadBitcoinHoldings({
      account: ACCOUNT,
      networkIds: ['bitcoin-testnet'],
      gateway,
      store: seededStore(),
    })
    expect(calls).toEqual(['bitcoin-testnet'])
  })
})

describe('toBitcoinHolding', () => {
  const entry = (over = {}) => ({
    asset: { id: 'btc-native', chainId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', decimals: 8, kind: 'native', categoryId: 'digital-commodities', baselineSymbol: 'BTC' },
    confirmedSats: 150_000_000,
    pendingSats: 0,
    protectedSats: 0,
    spendableSats: 150_000_000,
    stampsDegraded: false,
    ...over,
  })

  it('converts sats to BTC and prices via the BTC feed entry', () => {
    const priceMap = new Map([['BTC', { usd: 100_000, source: 'chainlink', chainId: 137 }]])
    const h = toBitcoinHolding(entry(), priceMap)
    expect(h.balance).toBe(1.5)
    expect(h.balanceRaw).toBe(150_000_000n)
    expect(h.usd).toBe(150_000)
    expect(h.bitcoin.spendableSats).toBe(150_000_000)
  })

  it('zero is worth exactly $0; nonzero without a price is honestly unpriced', () => {
    const zero = toBitcoinHolding(entry({ confirmedSats: 0, spendableSats: 0 }), new Map())
    expect(zero.usd).toBe(0)
    const unpriced = toBitcoinHolding(entry(), new Map())
    expect(unpriced.usd).toBeNull()
  })
})
