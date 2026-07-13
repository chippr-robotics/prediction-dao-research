/**
 * collectiblesAvailable (spec 055 FR-007/SC-003) — the single visibility gate for every
 * collectibles surface: OpenSea-served chain (Ethereum + Polygon) AND a configured gateway.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { collectiblesAvailable, collectiblesGatewayUrl } from '../../lib/collectibles/gatewayClient'
import { getNetwork } from '../../config/networks'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('collectibles capability flag (config/networks.js)', () => {
  it('is on for Ethereum mainnet and Polygon only', () => {
    expect(getNetwork(1).capabilities.collectibles).toBe(true)
    expect(getNetwork(137).capabilities.collectibles).toBe(true)
    for (const chainId of [61, 63, 80002, 11155111, 560048, 1337]) {
      expect(getNetwork(chainId).capabilities.collectibles).toBe(false)
    }
  })
})

describe('collectiblesAvailable', () => {
  it('requires BOTH the chain capability and a configured gateway', () => {
    vi.stubEnv('VITE_RELAYER_URL', 'https://relay.example')
    expect(collectiblesAvailable(137)).toBe(true)
    expect(collectiblesAvailable(1)).toBe(true)
    expect(collectiblesAvailable(63)).toBe(false) // Mordor: OpenSea does not serve it
    expect(collectiblesAvailable(999999)).toBe(false) // unknown chain
  })

  it('soft-fails everywhere when no gateway is configured (mirrors makeRelayer null)', () => {
    vi.stubEnv('VITE_RELAYER_URL', '')
    expect(collectiblesAvailable(137)).toBe(false)
    expect(collectiblesAvailable(1)).toBe(false)
  })

  it('normalizes the configured base URL (trailing slash stripped)', () => {
    vi.stubEnv('VITE_RELAYER_URL', 'https://relay.example/')
    expect(collectiblesGatewayUrl()).toBe('https://relay.example')
  })
})
