import { describe, it, expect } from 'vitest'
import { getNetwork, getClearPathChainIds } from '../config/networks'
import { getNetworkFeatures } from '../config/networkCapabilities'

// Spec 042 — the `clearpath` per-chain capability + its Network-tab feature tag.

describe('clearpath capability (spec 042)', () => {
  it('declares clearpath on governance networks and off on the local sandbox', () => {
    expect(getNetwork(63)?.capabilities?.clearpath).toBe(true) // Mordor (Olympia)
    expect(getNetwork(61)?.capabilities?.clearpath).toBe(true) // ETC mainnet
    expect(getNetwork(80002)?.capabilities?.clearpath).toBe(true) // Amoy
    expect(getNetwork(137)?.capabilities?.clearpath).toBe(true) // Polygon
    expect(getNetwork(1)?.capabilities?.clearpath).toBe(true) // Ethereum mainnet (ClearPath-only)
    expect(getNetwork(1337)?.capabilities?.clearpath).toBe(false) // local Hardhat
  })

  it('exposes a clearpath feature tag via getNetworkFeatures', () => {
    const tag = getNetworkFeatures(1).find((f) => f.key === 'clearpath')
    expect(tag).toBeTruthy()
    expect(tag.deployed).toBe(true)
    const localTag = getNetworkFeatures(1337).find((f) => f.key === 'clearpath')
    expect(localTag.deployed).toBe(false)
  })
})

describe('getClearPathChainIds (network-agnostic follow-up to spec 042)', () => {
  it('returns every clearpath-capable chain, mainnets before testnets, and excludes non-clearpath chains', () => {
    const ids = getClearPathChainIds()
    expect(ids).toEqual(expect.arrayContaining([1, 61, 137, 63, 80002]))
    expect(ids).not.toContain(1337) // local Hardhat sandbox
    expect(ids).not.toContain(11155111) // Sepolia — clearpath off
    expect(ids).not.toContain(560048) // Hoodi — clearpath off
    const testnetStart = ids.findIndex((id) => getNetwork(id).isTestnet)
    expect(ids.slice(testnetStart).every((id) => getNetwork(id).isTestnet)).toBe(true)
  })
})
