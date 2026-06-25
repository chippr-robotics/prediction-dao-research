import { describe, it, expect } from 'vitest'
import { syncedObjects } from '../../lib/backup/syncedObjects'

// Spec 032 — the synced-object registry: address book is network-scoped and merges additively by
// (address, chainId) so the same address on two networks stays two distinct entries (FR-015a/FR-008);
// preferences are network-agnostic and merge last-writer-wins.

const addressBook = syncedObjects.find((o) => o.key === 'addressBook')
const prefs = syncedObjects.find((o) => o.key === 'preferences')
const ADDR = '0x1111111111111111111111111111111111111111'

function bookWith(id, addr, chainId, nickname) {
  return { schemaVersion: 1, contacts: [{ id, nickname, addresses: [{ address: addr, chainId, notes: '', addedAt: 1 }], createdAt: 1, updatedAt: 1 }], updatedAt: 1 }
}

describe('syncedObjects', () => {
  it('declares the address book network-scoped and merges additively by (address, chainId)', () => {
    expect(addressBook.networkScoped).toBe(true)
    const current = bookWith('c1', ADDR, 137, 'Alex')
    const incoming = bookWith('c2', ADDR, 63, 'Alex') // SAME address, different network
    const { book } = addressBook.merge(current, incoming)
    const keys = book.contacts.flatMap((c) => c.addresses.map((a) => `${a.address.toLowerCase()}:${a.chainId}`))
    expect(keys).toContain(`${ADDR}:137`)
    expect(keys).toContain(`${ADDR}:63`)
    expect(keys.length).toBe(2) // two distinct entries, not collapsed
  })

  it('declares preferences network-agnostic and merges last-writer-wins', () => {
    expect(prefs.networkScoped).toBe(false)
    const { value } = prefs.merge({ defaultSlippage: 0.5 }, { defaultSlippage: 2.0 })
    expect(value).toEqual({ defaultSlippage: 2.0 })
  })
})
