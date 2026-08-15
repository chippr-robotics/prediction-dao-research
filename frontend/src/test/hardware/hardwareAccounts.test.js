/**
 * hardwareWalletVault CRUD facade (spec 086, FR-005/FR-011).
 * Re-adding a saved address must update its label, never duplicate; all
 * address comparisons are case-insensitive; the list is stable oldest-first.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { hardwareWalletVault } from '../../lib/hardware/hardwareAccounts'

const OWNER = '0x' + 'a'.repeat(40)
const ADDR = '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const ADDR_2 = '0x' + 'b'.repeat(40)
const ADDR_3 = '0x' + 'c'.repeat(40)
const PATH_LIVE = "m/44'/60'/0'/0/0"

let nowSpy

beforeEach(() => {
  globalThis.localStorage?.clear?.()
  nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000)
})

afterEach(() => nowSpy.mockRestore())

describe('hardwareWalletVault', () => {
  it('requires an owning account', () => {
    expect(() => hardwareWalletVault(null)).toThrow(/owning account/)
  })

  it('add persists a new entry and returns { entry, updated: false }', () => {
    const vault = hardwareWalletVault(OWNER)
    const { entry, updated } = vault.add({ address: ADDR, vendor: 'ledger', path: PATH_LIVE, label: 'Cold' })
    expect(updated).toBe(false)
    expect(entry).toEqual({ address: ADDR, vendor: 'ledger', path: PATH_LIVE, label: 'Cold', addedAt: 1000 })
    // Persisted — a fresh facade over the same owner sees it.
    expect(hardwareWalletVault(OWNER).get(ADDR)).toEqual(entry)
  })

  it('re-adding the same address in a different case updates instead of duplicating (FR-011)', () => {
    const vault = hardwareWalletVault(OWNER)
    vault.add({ address: ADDR, vendor: 'ledger', path: PATH_LIVE, label: 'Original' })
    nowSpy.mockReturnValue(2000)
    const { entry, updated } = vault.add({
      address: ADDR.toLowerCase(),
      vendor: 'trezor', // ignored — the saved vendor/path win
      path: "m/44'/60'/9'/0/0",
      label: 'Renamed',
    })
    expect(updated).toBe(true)
    expect(entry.addedAt).toBe(1000) // keeps original addedAt
    expect(entry.vendor).toBe('ledger')
    expect(entry.path).toBe(PATH_LIVE)
    expect(entry.label).toBe('Renamed')
    expect(vault.list()).toHaveLength(1)
  })

  it('re-adding with no label keeps the existing label', () => {
    const vault = hardwareWalletVault(OWNER)
    vault.add({ address: ADDR, vendor: 'ledger', path: PATH_LIVE, label: 'Keep me' })
    const { entry } = vault.add({ address: ADDR, vendor: 'ledger', path: PATH_LIVE })
    expect(entry.label).toBe('Keep me')
  })

  it('add validates address, vendor, and path', () => {
    const vault = hardwareWalletVault(OWNER)
    expect(() => vault.add({ address: '0xnope', vendor: 'ledger', path: PATH_LIVE })).toThrow(/valid EVM address/)
    expect(() => vault.add({ address: ADDR, vendor: 'keystone', path: PATH_LIVE })).toThrow(/Unknown hardware vendor/)
    expect(() => vault.add({ address: ADDR, vendor: 'ledger', path: '' })).toThrow(/derivation path/)
    expect(vault.list()).toHaveLength(0)
  })

  it('updateLabel rewrites the label and returns the entry; null for unknown addresses', () => {
    const vault = hardwareWalletVault(OWNER)
    vault.add({ address: ADDR, vendor: 'ledger', path: PATH_LIVE, label: 'Before' })
    const updated = vault.updateLabel(ADDR.toLowerCase(), 'After')
    expect(updated.label).toBe('After')
    expect(vault.get(ADDR).label).toBe('After')
    expect(vault.updateLabel(ADDR_2, 'nobody home')).toBeNull()
  })

  it('remove returns the entry and deletes it; null for unknown addresses', () => {
    const vault = hardwareWalletVault(OWNER)
    const { entry } = vault.add({ address: ADDR, vendor: 'trezor', path: PATH_LIVE })
    const removed = vault.remove(ADDR.toLowerCase())
    expect(removed).toEqual(entry)
    expect(vault.has(ADDR)).toBe(false)
    expect(vault.list()).toHaveLength(0)
    expect(vault.remove(ADDR)).toBeNull()
  })

  it('list is sorted by addedAt ascending regardless of insertion order', () => {
    const vault = hardwareWalletVault(OWNER)
    nowSpy.mockReturnValue(300)
    vault.add({ address: ADDR, vendor: 'ledger', path: PATH_LIVE })
    nowSpy.mockReturnValue(100)
    vault.add({ address: ADDR_2, vendor: 'ledger', path: "m/44'/60'/1'/0/0" })
    nowSpy.mockReturnValue(200)
    vault.add({ address: ADDR_3, vendor: 'trezor', path: "m/44'/60'/0'/0/2" })
    expect(vault.list().map((e) => e.addedAt)).toEqual([100, 200, 300])
    expect(vault.list().map((e) => e.address)).toEqual([ADDR_2, ADDR_3, ADDR])
  })

  it('has() and get() are case-insensitive', () => {
    const vault = hardwareWalletVault(OWNER)
    vault.add({ address: ADDR, vendor: 'ledger', path: PATH_LIVE })
    expect(vault.has(ADDR.toLowerCase())).toBe(true)
    expect(vault.has(ADDR.toUpperCase().replace('0X', '0x'))).toBe(true)
    expect(vault.get(ADDR.toLowerCase())?.address).toBe(ADDR)
    expect(vault.has(ADDR_2)).toBe(false)
    expect(vault.get(ADDR_2)).toBeNull()
  })

  it('vaults are scoped per owner', () => {
    hardwareWalletVault(OWNER).add({ address: ADDR, vendor: 'ledger', path: PATH_LIVE })
    expect(hardwareWalletVault(ADDR_2).list()).toHaveLength(0)
  })
})
