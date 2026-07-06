import { describe, it, expect, vi, beforeEach } from 'vitest'

// Spec 042 — the pluggable connector resolver. We mock the concrete connector so these tests exercise the
// resolver's own logic (detection order, unknown fallback, fault isolation, framework→connector mapping) without
// a live chain. The OZ connector's on-chain probe is covered by its own unit tests.

const h = vi.hoisted(() => ({ ozMatches: vi.fn() }))

vi.mock('../ozGovernor', () => ({
  ozGovernorConnector: {
    framework: 0,
    matches: (...a) => h.ozMatches(...a),
  },
}))

import { detectFramework, getConnector } from '../index'

describe('connector resolver (spec 042)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('detectFramework returns 0 for an OpenZeppelin Governor', async () => {
    h.ozMatches.mockResolvedValue(true)
    await expect(detectFramework({}, '0xdao')).resolves.toBe(0)
  })

  it("detectFramework returns 'unknown' when no connector matches", async () => {
    h.ozMatches.mockResolvedValue(false)
    await expect(detectFramework({}, '0xdao')).resolves.toBe('unknown')
  })

  it('detectFramework is fault-isolated: a throwing probe does not abort detection', async () => {
    h.ozMatches.mockRejectedValue(new Error('rpc revert'))
    await expect(detectFramework({}, '0xdao')).resolves.toBe('unknown')
  })

  it('getConnector maps a framework value to its connector, null for unknown', () => {
    expect(getConnector(0)?.framework).toBe(0)
    expect(getConnector(1)).toBeNull()
    expect(getConnector('unknown')).toBeNull()
  })
})
