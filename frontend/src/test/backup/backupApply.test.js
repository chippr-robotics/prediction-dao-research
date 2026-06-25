import { describe, it, expect, beforeEach } from 'vitest'
import { applyBundle } from '../../lib/backup/backupBundle'
import { loadAddressBook, saveAddressBook } from '../../lib/addressBook/addressBookStore'

// Spec 032 US3 + network-aware restore (T021/T024): merge keeps both; replace overwrites; the same address on
// two networks restores as two distinct entries (FR-015a / SC-012a).

const ACCT = '0xAbC0000000000000000000000000000000000009'
const A1 = '0x1111111111111111111111111111111111111111'
const A2 = '0x3333333333333333333333333333333333333333'

const book = (contacts) => ({ schemaVersion: 1, contacts, updatedAt: 1 })
const contact = (id, addr, chainId, nickname = 'X') => ({ id, nickname, addresses: [{ address: addr, chainId, notes: '', addedAt: 1 }], createdAt: 1, updatedAt: 1 })
const bundleWith = (ab) => ({ schema: 'fairwins-data-backup', version: 1, createdAt: 1, wallet: ACCT.toLowerCase(), objects: { addressBook: ab } })
const keysOf = (acct) => loadAddressBook(acct).contacts.flatMap((c) => c.addresses.map((a) => `${a.address.toLowerCase()}:${a.chainId}`))

beforeEach(() => localStorage.clear())

describe('applyBundle merge / replace + network-aware', () => {
  it('merge keeps both local and backup entries (additive, no loss)', () => {
    saveAddressBook(ACCT, book([contact('c1', A1, 137, 'Local')]))
    applyBundle(ACCT, bundleWith(book([contact('c2', A2, 137, 'Backup')])), 'merge')
    const keys = keysOf(ACCT)
    expect(keys).toContain(`${A1}:137`)
    expect(keys).toContain(`${A2.toLowerCase()}:137`)
  })

  it('replace overwrites local data with the backup', () => {
    saveAddressBook(ACCT, book([contact('c1', A1, 137, 'Local')]))
    applyBundle(ACCT, bundleWith(book([contact('c2', A2, 137, 'Backup')])), 'replace')
    expect(keysOf(ACCT)).toEqual([`${A2.toLowerCase()}:137`]) // local A1 gone
  })

  it('network-aware: the same address on two chains restores as two distinct entries', () => {
    const ab = book([{ id: 'c1', nickname: 'X', addresses: [{ address: A1, chainId: 137, notes: '', addedAt: 1 }, { address: A1, chainId: 63, notes: '', addedAt: 1 }], createdAt: 1, updatedAt: 1 }])
    applyBundle(ACCT, bundleWith(ab), 'replace')
    const keys = keysOf(ACCT)
    expect(keys).toContain(`${A1}:137`)
    expect(keys).toContain(`${A1}:63`)
    expect(keys.length).toBe(2)
  })
})
