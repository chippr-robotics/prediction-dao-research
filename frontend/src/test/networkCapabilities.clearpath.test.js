import { describe, it, expect } from 'vitest'
import { getNetwork } from '../config/networks'
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
