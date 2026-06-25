import { describe, it, expect, beforeEach } from 'vitest'
import { buildBundle, parseBundle, applyBundle, BUNDLE_SCHEMA } from '../../lib/backup/backupBundle'
import { loadAddressBook, saveAddressBook } from '../../lib/addressBook/addressBookStore'
import { saveUserPreference } from '../../utils/userStorage'

// Spec 032 — the unified, network-tagged bundle: build from local data, validate (reject a network-scoped
// element missing chainId), and round-trip apply.

const ACCT = '0xAbC0000000000000000000000000000000000001'
const ADDR = '0x1111111111111111111111111111111111111111'

function bookWith(addr, chainId, nickname = 'Alex') {
  return {
    schemaVersion: 1,
    contacts: [{ id: 'c1', nickname, addresses: [{ address: addr, chainId, notes: '', addedAt: 1 }], createdAt: 1, updatedAt: 1 }],
    updatedAt: 1,
  }
}

beforeEach(() => localStorage.clear())

describe('backupBundle', () => {
  it('builds a network-tagged unified bundle from local data', () => {
    saveAddressBook(ACCT, bookWith(ADDR, 137))
    saveUserPreference(ACCT, 'default_slippage', 1.5, true)
    const b = buildBundle(ACCT, 1000)
    expect(b.schema).toBe(BUNDLE_SCHEMA)
    expect(b.wallet).toBe(ACCT.toLowerCase())
    expect(b.objects.addressBook.contacts[0].addresses[0].chainId).toBe(137)
    expect(b.objects.preferences.defaultSlippage).toBe(1.5)
  })

  it('accepts a valid bundle and rejects a network-scoped element missing chainId (FR-015a)', () => {
    saveAddressBook(ACCT, bookWith(ADDR, 137))
    const good = buildBundle(ACCT, 1)
    expect(parseBundle(good)).toBe(good)

    const bad = JSON.parse(JSON.stringify(good))
    delete bad.objects.addressBook.contacts[0].addresses[0].chainId
    expect(() => parseBundle(bad)).toThrow(/chainId/i)
    expect(() => parseBundle({ schema: 'x', version: 1 })).toThrow()
  })

  it('round-trips: build on A, replace onto a fresh B', () => {
    saveAddressBook(ACCT, bookWith(ADDR, 137))
    const b = buildBundle(ACCT, 1)
    const B = '0xBbB0000000000000000000000000000000000002'
    applyBundle(B, b, 'replace')
    const restored = loadAddressBook(B)
    expect(restored.contacts[0].addresses[0].address.toLowerCase()).toBe(ADDR)
    expect(restored.contacts[0].addresses[0].chainId).toBe(137)
  })
})
