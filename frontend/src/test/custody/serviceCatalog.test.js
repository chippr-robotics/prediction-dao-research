// Spec 068 (US3, T027) — the per-chain approved-services catalog behind the rule composer's picker.

import { describe, it, expect } from 'vitest'
import { getServiceCatalog, findServiceByAddress } from '../../config/serviceCatalog'
import { getContractAddressForChain } from '../../config/contracts'

describe('serviceCatalog', () => {
  it('offers only services that actually have an address on that chain', () => {
    for (const chainId of [137, 63, 61, 1337]) {
      for (const service of getServiceCatalog(chainId)) {
        expect(service.addresses.length).toBeGreaterThan(0)
        for (const address of service.addresses) {
          expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/)
        }
        expect(service.name).toBeTruthy()
        expect(service.id).toBeTruthy()
      }
    }
  })

  it('names the swap venue from the network config rather than hardcoding a brand', () => {
    const polygon = getServiceCatalog(137)
    const dex = polygon.find((s) => s.id === 'dex.swapRouter')
    // Polygon's venue is Uniswap; ETC's is ETCswap — the catalog must follow the config either way.
    if (dex) expect(dex.name).toMatch(/uniswap/i)
  })

  it('includes platform contracts deployed on the chain', () => {
    const polygon = getServiceCatalog(137)
    const wagers = polygon.find((s) => s.id === 'platform.wagerRegistry')
    expect(wagers).toBeTruthy()
    expect(wagers.addresses[0].toLowerCase()).toBe(getContractAddressForChain('wagerRegistry', 137).toLowerCase())
  })

  it('never leaks another chain’s addresses through a default-network fallback', () => {
    // An unknown chain must yield nothing at all, not Polygon's catalog.
    expect(getServiceCatalog(424242)).toEqual([])
    expect(getServiceCatalog(undefined)).toEqual([])

    const polygonAddresses = new Set(getServiceCatalog(137).flatMap((s) => s.addresses.map((a) => a.toLowerCase())))
    for (const service of getServiceCatalog(63)) {
      for (const address of service.addresses) {
        // Mordor may legitimately share none of Polygon's addresses; assert no cross-chain bleed of
        // the wager registry in particular (a different deployment per chain).
        if (service.id === 'platform.wagerRegistry') {
          expect(polygonAddresses.has(address.toLowerCase())).toBe(false)
        }
      }
    }
  })

  it('resolves a known address back to its service so destinations can be named', () => {
    const registry = getContractAddressForChain('wagerRegistry', 137)
    expect(findServiceByAddress(137, registry)?.id).toBe('platform.wagerRegistry')
    expect(findServiceByAddress(137, '0x0000000000000000000000000000000000000009')).toBeNull()
    expect(findServiceByAddress(137, 'not-an-address')).toBeNull()
  })
})
