/**
 * Derivation-path schemes for the account picker (spec 085, FR-004).
 * Ledger Live vs BIP-44 path shapes, vendor defaults, and paging.
 */
import { describe, it, expect } from 'vitest'
import { PATH_SCHEMES, defaultSchemeFor, schemeById, pagePaths } from '../../lib/hardware/derivations'

describe('PATH_SCHEMES', () => {
  it("'live' derives the Ledger Live account-per-hardened-index path", () => {
    const live = schemeById('live')
    expect(live.pathFor(0)).toBe("m/44'/60'/0'/0/0")
    expect(live.pathFor(3)).toBe("m/44'/60'/3'/0/0")
  })

  it("'bip44' derives the single-account address-index path", () => {
    const bip44 = schemeById('bip44')
    expect(bip44.pathFor(0)).toBe("m/44'/60'/0'/0/0")
    expect(bip44.pathFor(3)).toBe("m/44'/60'/0'/0/3")
  })

  it('exposes exactly the two documented schemes', () => {
    expect(PATH_SCHEMES.map((s) => s.id)).toEqual(['live', 'bip44'])
  })
})

describe('defaultSchemeFor', () => {
  it('starts Ledger on the Ledger Live scheme and Trezor on BIP-44', () => {
    expect(defaultSchemeFor('ledger')).toBe('live')
    expect(defaultSchemeFor('trezor')).toBe('bip44')
  })
})

describe('pagePaths', () => {
  it('returns count paths starting at offset with their indexes', () => {
    expect(pagePaths('live', 5, 3)).toEqual([
      { index: 5, path: "m/44'/60'/5'/0/0" },
      { index: 6, path: "m/44'/60'/6'/0/0" },
      { index: 7, path: "m/44'/60'/7'/0/0" },
    ])
  })

  it('defaults to the first page of five', () => {
    const page = pagePaths('bip44')
    expect(page).toHaveLength(5)
    expect(page[0]).toEqual({ index: 0, path: "m/44'/60'/0'/0/0" })
    expect(page[4]).toEqual({ index: 4, path: "m/44'/60'/0'/0/4" })
  })

  it('returns [] for an unknown scheme', () => {
    expect(pagePaths('electrum', 0, 5)).toEqual([])
    expect(schemeById('electrum')).toBeNull()
  })
})
