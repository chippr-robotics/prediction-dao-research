import { describe, it, expect, beforeEach } from 'vitest'
import {
  deriveVaultKey,
  addEntry,
  readEntries,
  removeEntry,
  hasVault,
} from '../../lib/openChallenge/codeVault'

// Device-local, wallet-encrypted backup of open-challenge codes (feature 024 follow-up).
describe('open-challenge code vault', () => {
  const ADDR = '0x1111111111111111111111111111111111111111'
  const key = deriveVaultKey('0xsignature-from-wallet')
  const otherKey = deriveVaultKey('0xa-different-wallet-signature')

  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty and reports no vault', () => {
    expect(hasVault(ADDR)).toBe(false)
    expect(readEntries(ADDR, key)).toEqual([])
  })

  it('saves a code and reads it back decrypted', () => {
    addEntry(ADDR, key, { code: 'river tiger kite zoo', wagerId: '7', description: 'Will it rain?' })
    expect(hasVault(ADDR)).toBe(true)
    const entries = readEntries(ADDR, key)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ code: 'river tiger kite zoo', wagerId: '7', description: 'Will it rain?' })
    expect(entries[0].savedAt).toEqual(expect.any(Number))
  })

  it('does not store the code in cleartext', () => {
    addEntry(ADDR, key, { code: 'river tiger kite zoo', wagerId: '7' })
    const raw = localStorage.getItem(`fairwins.ocCodeVault.${ADDR.toLowerCase()}`)
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('river tiger kite zoo')
  })

  it('de-duplicates by code (re-saving updates in place, newest first)', () => {
    addEntry(ADDR, key, { code: 'aaa bbb ccc ddd', wagerId: '1' })
    addEntry(ADDR, key, { code: 'eee fff ggg hhh', wagerId: '2' })
    addEntry(ADDR, key, { code: 'aaa bbb ccc ddd', wagerId: '1', description: 'updated' })
    const entries = readEntries(ADDR, key)
    expect(entries.map((e) => e.code)).toEqual(['aaa bbb ccc ddd', 'eee fff ggg hhh'])
    expect(entries[0].description).toBe('updated')
  })

  it('throws a friendly error when unlocked with the wrong wallet key', () => {
    addEntry(ADDR, key, { code: 'aaa bbb ccc ddd', wagerId: '1' })
    expect(() => readEntries(ADDR, otherKey)).toThrow(/different wallet/i)
  })

  it('removes a saved code', () => {
    addEntry(ADDR, key, { code: 'aaa bbb ccc ddd', wagerId: '1' })
    addEntry(ADDR, key, { code: 'eee fff ggg hhh', wagerId: '2' })
    const remaining = removeEntry(ADDR, key, 'aaa bbb ccc ddd')
    expect(remaining.map((e) => e.code)).toEqual(['eee fff ggg hhh'])
  })

  it('scopes the vault per wallet address', () => {
    const ADDR2 = '0x2222222222222222222222222222222222222222'
    addEntry(ADDR, key, { code: 'aaa bbb ccc ddd', wagerId: '1' })
    expect(readEntries(ADDR2, key)).toEqual([])
  })
})
