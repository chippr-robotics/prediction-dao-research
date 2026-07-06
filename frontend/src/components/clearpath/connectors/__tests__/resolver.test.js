import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spec 042 — the pluggable connector resolver. Both concrete connectors are mocked so these tests exercise the
// resolver's own logic (detection order, unknown fallback, fault isolation, framework→connector mapping) without
// a live chain. Each connector's on-chain probe is covered by its own unit test.

const h = vi.hoisted(() => ({ ozMatches: vi.fn(), bravoMatches: vi.fn() }))

vi.mock('../ozGovernor', () => ({
  ozGovernorConnector: { framework: 0, matches: (...a) => h.ozMatches(...a) },
}))
vi.mock('../governorBravo', () => ({
  governorBravoConnector: { framework: 1, matches: (...a) => h.bravoMatches(...a) },
}))

import { detectFramework, getConnector } from '../index'

describe('connector resolver (spec 042)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('detectFramework returns 0 for an OpenZeppelin Governor', async () => {
    h.ozMatches.mockResolvedValue(true)
    await expect(detectFramework({}, '0xdao')).resolves.toBe(0)
    expect(h.bravoMatches).not.toHaveBeenCalled() // short-circuits on the first match
  })

  it('detectFramework returns 1 for a GovernorBravo DAO (OZ probe first, then Bravo)', async () => {
    h.ozMatches.mockResolvedValue(false)
    h.bravoMatches.mockResolvedValue(true)
    await expect(detectFramework({}, '0xdao')).resolves.toBe(1)
  })

  it("detectFramework returns 'unknown' when no connector matches", async () => {
    h.ozMatches.mockResolvedValue(false)
    h.bravoMatches.mockResolvedValue(false)
    await expect(detectFramework({}, '0xdao')).resolves.toBe('unknown')
  })

  it('detectFramework is fault-isolated: a throwing probe does not abort detection', async () => {
    h.ozMatches.mockRejectedValue(new Error('rpc revert'))
    h.bravoMatches.mockResolvedValue(true)
    await expect(detectFramework({}, '0xdao')).resolves.toBe(1)
  })

  it('getConnector maps a framework value to its connector, null for unknown', () => {
    expect(getConnector(0)?.framework).toBe(0)
    expect(getConnector(1)?.framework).toBe(1)
    expect(getConnector('unknown')).toBeNull()
    expect(getConnector(99)).toBeNull()
  })
})
