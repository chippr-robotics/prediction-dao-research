import { describe, it, expect, beforeEach } from 'vitest'
import { createBitcoinWallet, classifyUtxos, ledgerStore, nextIndex, GAP_LIMIT } from '../wallet'

// In-memory storage matching the localStorage surface ledgerStore needs.
function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  }
}

const deriveAddress = (type, index) => `${type === 'taproot' ? 'tb1p' : 'tb1q'}addr${index}`

// Gateway stub: `used` maps address → { confirmedSats, utxos }.
function gatewayStub(used = {}, { fail = false } = {}) {
  const calls = []
  return {
    calls,
    async lookupAddresses(networkId, addresses) {
      calls.push(addresses)
      if (fail) return { ok: false, error: 'upstream_unavailable', stale: true }
      return {
        ok: true,
        results: addresses.map((address) => ({
          address,
          confirmedSats: used[address]?.confirmedSats ?? 0,
          pendingSats: used[address]?.pendingSats ?? 0,
          utxos: used[address]?.utxos ?? [],
        })),
      }
    },
  }
}

const ACCOUNT = '0xAbC0000000000000000000000000000000000001'

function makeWallet({ used, fail, store } = {}) {
  return createBitcoinWallet({
    account: ACCOUNT,
    networkId: 'bitcoin-testnet',
    deriveAddress,
    gateway: gatewayStub(used, { fail }),
    store: store ?? ledgerStore(memoryStorage()),
    now: () => '2026-07-20T00:00:00.000Z',
  })
}

describe('bitcoin wallet ledger + rotation (spec 061, FR-003/004/005)', () => {
  let store
  beforeEach(() => {
    store = ledgerStore(memoryStorage())
  })

  it('issues fresh addresses, never repeating (rotation)', () => {
    const wallet = makeWallet({ store })
    const a = wallet.nextReceiveAddress('segwit')
    const b = wallet.nextReceiveAddress('segwit')
    const c = wallet.nextReceiveAddress('segwit')
    expect(a.index).toBe(0)
    expect(b.index).toBe(1)
    expect(c.index).toBe(2)
    expect(new Set([a.address, b.address, c.address]).size).toBe(3)
  })

  it('rotation cursors are independent per type; preference persists', () => {
    const wallet = makeWallet({ store })
    expect(wallet.preferredType()).toBe('segwit')
    wallet.nextReceiveAddress('segwit')
    const t = wallet.nextReceiveAddress('taproot')
    expect(t.index).toBe(0)
    expect(t.address.startsWith('tb1p')).toBe(true)
    wallet.setPreferredType('taproot')
    expect(wallet.preferredType()).toBe('taproot')
    expect(() => wallet.setPreferredType('p2pk')).toThrow()
    // preference + ledger survive a new controller over the same store
    const again = makeWallet({ store })
    expect(again.preferredType()).toBe('taproot')
    expect(again.nextReceiveAddress('segwit').index).toBe(1)
  })

  it('ledgers are scoped per account and network (no cross-leak, FR-021)', () => {
    const walletA = makeWallet({ store })
    walletA.nextReceiveAddress('segwit')
    const other = createBitcoinWallet({
      account: '0xother',
      networkId: 'bitcoin-testnet',
      deriveAddress,
      gateway: gatewayStub(),
      store,
    })
    expect(other.issuedAddresses()).toHaveLength(0)
    const mainnet = createBitcoinWallet({
      account: ACCOUNT,
      networkId: 'bitcoin',
      deriveAddress,
      gateway: gatewayStub(),
      store,
    })
    expect(mainnet.issuedAddresses()).toHaveLength(0)
  })

  it('nextIndex never decreases even with a sparse ledger', () => {
    const issued = [
      { type: 'segwit', index: 0 },
      { type: 'segwit', index: 7 }, // discovered ahead of cursor
      { type: 'taproot', index: 2 },
    ]
    expect(nextIndex(issued, 'segwit')).toBe(8)
    expect(nextIndex(issued, 'taproot')).toBe(3)
    expect(nextIndex([], 'segwit')).toBe(0)
  })
})

describe('gap-limit discovery (research R5, FR-003)', () => {
  it('recovers used addresses from an empty ledger (new device)', async () => {
    const used = {
      tb1qaddr0: { confirmedSats: 1000, utxos: [{ txid: 'a', vout: 0, valueSats: 1000, confirmations: 2 }] },
      tb1qaddr3: { confirmedSats: 500, utxos: [{ txid: 'b', vout: 1, valueSats: 500, confirmations: 9 }] },
    }
    const wallet = makeWallet({ used })
    const res = await wallet.discover(['segwit'])
    expect(res.ok).toBe(true)
    const indexes = res.addresses.filter((a) => a.type === 'segwit').map((a) => a.index).sort()
    expect(indexes).toEqual([0, 3])
    expect(res.utxos).toHaveLength(2)
    expect(res.utxos[0].scriptType).toBe('p2wpkh')
    // cursor resumes AFTER the highest used index
    expect(wallet.nextReceiveAddress('segwit').index).toBe(4)
  })

  it('finds funds paid ahead of the cursor within the gap window', async () => {
    const used = { [`tb1qaddr${GAP_LIMIT - 1}`]: { confirmedSats: 42, utxos: [] } }
    const wallet = makeWallet({ used })
    const res = await wallet.discover(['segwit'])
    expect(res.addresses.some((a) => a.index === GAP_LIMIT - 1)).toBe(true)
  })

  it('stops after GAP_LIMIT consecutive unused addresses', async () => {
    const wallet = createBitcoinWallet({
      account: ACCOUNT,
      networkId: 'bitcoin-testnet',
      deriveAddress,
      gateway: gatewayStub({}),
      store: ledgerStore(memoryStorage()),
    })
    const res = await wallet.discover(['segwit'])
    expect(res.ok).toBe(true)
    expect(res.addresses).toHaveLength(0)
  })

  it('merges discovery with cached issued entries; cursor never rolls back', async () => {
    const wallet = makeWallet({ used: {} })
    wallet.nextReceiveAddress('segwit') // index 0 issued locally, unused on chain
    wallet.nextReceiveAddress('segwit') // index 1
    const res = await wallet.discover(['segwit'])
    // unused-but-issued entries survive (they may be on printed invoices)
    expect(res.addresses.map((a) => a.index).sort()).toEqual([0, 1])
    expect(wallet.nextReceiveAddress('segwit').index).toBe(2)
  })

  it('gateway failure yields stale (cached ledger), never an empty reset', async () => {
    const store = ledgerStore(memoryStorage())
    const w1 = makeWallet({ store })
    w1.nextReceiveAddress('segwit')
    const w2 = makeWallet({ store, fail: true })
    const res = await w2.discover(['segwit'])
    expect(res.stale).toBe(true)
    expect(res.addresses).toHaveLength(1)
    expect(w2.nextReceiveAddress('segwit').index).toBe(1)
  })
})

describe('classifyUtxos (FR-018/FR-019 fail-safe)', () => {
  const utxo = (over = {}) => ({
    txid: 't1',
    vout: 0,
    valueSats: 1000,
    address: 'tb1qaddr0',
    confirmations: 3,
    scriptType: 'p2wpkh',
    ...over,
  })

  it('classifies spendable / protected / pending with healthy recognition', () => {
    const stamps = {
      ok: true,
      degraded: false,
      stamps: [{ stampId: 'S1', outpoint: { txid: 't2', vout: 1 } }],
    }
    const coins = classifyUtxos(
      [utxo(), utxo({ txid: 't2', vout: 1 }), utxo({ txid: 't3', confirmations: 0 })],
      stamps
    )
    expect(coins[0].classification).toBe('spendable')
    expect(coins[1]).toMatchObject({ classification: 'protected', stampId: 'S1' })
    expect(coins[2].classification).toBe('pending')
  })

  it('degraded or failed recognition marks every confirmed coin unverified', () => {
    for (const stamps of [
      { ok: true, degraded: true, stamps: [] },
      { ok: false },
      null,
      undefined,
    ]) {
      const coins = classifyUtxos([utxo(), utxo({ txid: 't9', confirmations: 0 })], stamps)
      expect(coins[0].classification).toBe('unverified')
      expect(coins[1].classification).toBe('pending') // pending stays pending
    }
  })

  it('locks in-flight outpoints (FR-014)', () => {
    const stamps = { ok: true, degraded: false, stamps: [] }
    const coins = classifyUtxos([utxo()], stamps, new Set(['t1:0']))
    expect(coins[0].lockedByTx).toBe('t1:0')
    expect(coins[0].classification).toBe('spendable') // locked ≠ reclassified; selection excludes it
  })
})
