// Spec 063 (US2, T025-T027) — legacy Bitcoin discover + keyFor glue over the spec-061 stack (mocked gateway).

import { describe, it, expect, vi } from 'vitest'
import { seedFromMnemonic, legacyAddressAt } from '../legacyDerivation'
import { ledgerStore } from '../wallet'
import { discoverLegacyBitcoin, makeLegacyKeyFor, bitcoinAccountId } from '../legacyBitcoin'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const SEGWIT0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu' // BIP84 m/84'/0'/0'/0/0

// In-memory storage so ledgerStore doesn't depend on a real localStorage.
function memStore() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) }
}

// Gateway that reports a balance ONLY for the segwit index-0 address (the pinned vector).
function gatewayWithFundsAt(fundedAddress) {
  return {
    lookupAddresses: vi.fn(async (_net, addresses) => ({
      ok: true,
      tipHeight: 100,
      results: addresses.map((address) => ({
        address,
        confirmedSats: address === fundedAddress ? 500000 : 0,
        pendingSats: 0,
        utxos: address === fundedAddress ? [{ txid: 'aa'.repeat(32), vout: 0, valueSats: 500000, confirmations: 6 }] : [],
        hasHistory: address === fundedAddress,
      })),
    })),
    getStamps: vi.fn(async (_net, addresses) => ({ ok: true, degraded: false, stamps: addresses.map((a) => ({ address: a, utxos: [] })) })),
  }
}

describe('legacy Bitcoin — account id isolation', () => {
  it('derives a stable, non-EVM-colliding ledger account id from the seed', () => {
    const id = bitcoinAccountId(seedFromMnemonic(MNEMONIC))
    expect(id).toMatch(/^legacy:[0-9a-f]{8}$/)
    // Deterministic.
    expect(bitcoinAccountId(seedFromMnemonic(MNEMONIC))).toBe(id)
  })
})

describe('legacy Bitcoin — discovery over the spec-061 gap scan', () => {
  it('finds the funded segwit address and records it in the ledger', async () => {
    const seed = seedFromMnemonic(MNEMONIC)
    const store = ledgerStore(memStore())
    const gateway = gatewayWithFundsAt(SEGWIT0)

    const res = await discoverLegacyBitcoin({ seed, network: 'bitcoin', gateway, store })
    expect(res.ok).toBe(true)
    expect(gateway.lookupAddresses).toHaveBeenCalled()

    const issued = store.get(bitcoinAccountId(seed), 'bitcoin').issued
    const seg0 = issued.find((e) => e.type === 'segwit' && e.index === 0)
    expect(seg0?.address).toBe(SEGWIT0)
  })
})

describe('legacy Bitcoin — keyFor resolves discovered addresses to signing keys', () => {
  it('returns the correct key + scriptType for a discovered address', async () => {
    const seed = seedFromMnemonic(MNEMONIC)
    const store = ledgerStore(memStore())
    await discoverLegacyBitcoin({ seed, network: 'bitcoin', gateway: gatewayWithFundsAt(SEGWIT0), store })

    const keyFor = makeLegacyKeyFor({ seed, network: 'bitcoin', store })
    const key = keyFor(SEGWIT0)
    expect(key).not.toBeNull()
    expect(key.scriptType).toBe('p2wpkh')
    expect(key.privateKey).toBeInstanceOf(Uint8Array)
    expect(key.publicKey.length).toBe(33)
    // The key's address must round-trip back to the discovered address.
    expect(legacyAddressAt(seed, { type: 'segwit', index: 0 })).toBe(SEGWIT0)
    // Unknown address ⇒ null (never a wrong key).
    expect(keyFor('bc1qunknownxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBeNull()
  })
})
