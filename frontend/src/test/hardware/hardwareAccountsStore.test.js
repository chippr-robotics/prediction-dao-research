/**
 * Backup-synced hardware-accounts store (spec 087, FR-005/FR-011).
 * Uses jsdom localStorage via userStorage; asserts public-artifacts-only shape
 * sanitization, load/save round-trip, the address-keyed newest-wins merge, and
 * the revision pub/sub React surfaces subscribe to.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadHardwareAccounts,
  saveHardwareAccounts,
  mergeHardwareAccounts,
  subscribeHardwareAccounts,
  getHardwareAccountsRevision,
  HARDWARE_ACCOUNTS_STORAGE_KEY,
} from '../../lib/hardware/hardwareAccountsStore'

const OWNER = '0x' + 'a'.repeat(40)
const ADDR_A = '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const ADDR_B = '0x' + 'b'.repeat(40)
const PATH_LIVE = "m/44'/60'/0'/0/0"
const entry = (address, addedAt = 1, over = {}) => ({
  address,
  vendor: 'ledger',
  path: PATH_LIVE,
  label: '',
  addedAt,
  ...over,
})

const physicalKey = `fw_user_${OWNER.toLowerCase()}_${HARDWARE_ACCOUNTS_STORAGE_KEY}`

beforeEach(() => globalThis.localStorage?.clear?.())

describe('loadHardwareAccounts', () => {
  it('returns {} when nothing is stored', () => {
    expect(loadHardwareAccounts(OWNER)).toEqual({})
  })

  it('returns {} for garbage shapes (array, string, null)', () => {
    globalThis.localStorage.setItem(physicalKey, JSON.stringify(['not', 'a', 'map']))
    expect(loadHardwareAccounts(OWNER)).toEqual({})
    globalThis.localStorage.setItem(physicalKey, JSON.stringify('garbage'))
    expect(loadHardwareAccounts(OWNER)).toEqual({})
    globalThis.localStorage.setItem(physicalKey, JSON.stringify(null))
    expect(loadHardwareAccounts(OWNER)).toEqual({})
  })

  it('drops malformed entries on load and keeps valid ones', () => {
    globalThis.localStorage.setItem(
      physicalKey,
      JSON.stringify({
        [ADDR_A]: entry(ADDR_A, 1),
        [ADDR_B]: { address: 'not-an-address', vendor: 'ledger', path: PATH_LIVE },
      }),
    )
    const loaded = loadHardwareAccounts(OWNER)
    expect(Object.keys(loaded)).toEqual([ADDR_A.toLowerCase()])
  })
})

describe('saveHardwareAccounts', () => {
  it('persists under the documented per-account storage key, keys lowercased', () => {
    saveHardwareAccounts(OWNER, { [ADDR_A]: entry(ADDR_A, 1) })
    const raw = JSON.parse(globalThis.localStorage.getItem(physicalKey))
    expect(Object.keys(raw)).toEqual([ADDR_A.toLowerCase()])
    const loaded = loadHardwareAccounts(OWNER)
    expect(loaded[ADDR_A.toLowerCase()].address).toBe(ADDR_A)
  })

  it('sanitizes invalid entries: bad address, unknown vendor, missing path', () => {
    const clean = saveHardwareAccounts(OWNER, {
      [ADDR_A]: entry(ADDR_A, 1),
      '0xshort': entry('0xshort', 2), // bad address
      [ADDR_B]: entry(ADDR_B, 3, { vendor: 'keystone' }), // unknown vendor
      ['0x' + 'c'.repeat(40)]: { address: '0x' + 'c'.repeat(40), vendor: 'trezor' }, // missing path
    })
    expect(Object.keys(clean)).toEqual([ADDR_A.toLowerCase()])
    expect(loadHardwareAccounts(OWNER)).toEqual(clean)
  })
})

describe('mergeHardwareAccounts', () => {
  it('unions by lowercased address', () => {
    const { value, conflicts } = mergeHardwareAccounts(
      { [ADDR_A.toLowerCase()]: entry(ADDR_A, 10) },
      { [ADDR_B]: entry(ADDR_B, 5, { vendor: 'trezor' }) },
    )
    expect(Object.keys(value).sort()).toEqual([ADDR_A.toLowerCase(), ADDR_B.toLowerCase()].sort())
    expect(conflicts).toEqual([])
  })

  it('newer addedAt wins on the same address', () => {
    const older = entry(ADDR_A, 10, { label: 'old' })
    const newer = entry(ADDR_A, 20, { label: 'new' })
    expect(mergeHardwareAccounts({ [ADDR_A]: older }, { [ADDR_A]: newer }).value[ADDR_A.toLowerCase()].label).toBe('new')
    // Direction flipped: the local (current) entry is newer and is kept.
    expect(mergeHardwareAccounts({ [ADDR_A]: newer }, { [ADDR_A]: older }).value[ADDR_A.toLowerCase()].label).toBe('new')
  })

  it('flags a conflict when both sides disagree about vendor or path', () => {
    const { value, conflicts } = mergeHardwareAccounts(
      { [ADDR_A]: entry(ADDR_A, 10, { vendor: 'ledger' }) },
      { [ADDR_A]: entry(ADDR_A, 20, { vendor: 'trezor' }) },
    )
    expect(conflicts).toEqual([{ address: ADDR_A.toLowerCase() }])
    expect(value[ADDR_A.toLowerCase()].vendor).toBe('trezor') // newer save kept

    const pathConflict = mergeHardwareAccounts(
      { [ADDR_A]: entry(ADDR_A, 10) },
      { [ADDR_A]: entry(ADDR_A, 20, { path: "m/44'/60'/1'/0/0" }) },
    )
    expect(pathConflict.conflicts).toEqual([{ address: ADDR_A.toLowerCase() }])
  })

  it('drops malformed entries from either side and never conflicts on identical entries', () => {
    const same = entry(ADDR_A, 10)
    const { value, conflicts } = mergeHardwareAccounts(
      { [ADDR_A]: same, bad: { address: 'nope' } },
      { [ADDR_A]: { ...same, addedAt: 20 } },
    )
    expect(Object.keys(value)).toEqual([ADDR_A.toLowerCase()])
    expect(conflicts).toEqual([])
  })
})

describe('revision pub/sub', () => {
  it('fires subscribers and bumps the revision on save', () => {
    const before = getHardwareAccountsRevision()
    const listener = vi.fn()
    const unsubscribe = subscribeHardwareAccounts(listener)
    saveHardwareAccounts(OWNER, { [ADDR_A]: entry(ADDR_A, 1) })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getHardwareAccountsRevision()).toBe(before + 1)
    unsubscribe()
  })

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeHardwareAccounts(listener)
    unsubscribe()
    saveHardwareAccounts(OWNER, {})
    expect(listener).not.toHaveBeenCalled()
  })

  it('one throwing listener does not block the rest', () => {
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    const un1 = subscribeHardwareAccounts(bad)
    const un2 = subscribeHardwareAccounts(good)
    expect(() => saveHardwareAccounts(OWNER, {})).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    un1()
    un2()
  })
})
