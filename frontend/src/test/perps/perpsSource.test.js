/** Perps activity source (spec 082 / spec 031) — baseline, diff, and outage-is-not-a-change. */
import { describe, it, expect, vi } from 'vitest'
import { createPerpsSource } from '../../data/notifications/sources/perpsSource'

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const NOW = 1_765_000_000_000

const POS = (id, sizeUsd = 1000) => ({ id, venue: id.split(':')[0], direction: 'long', sizeUsd })

const make = (body) =>
  createPerpsSource({
    deps: { available: () => true, fetchPositions: vi.fn(async () => body) },
  })

describe('perpsSource', () => {
  it('first sight is a baseline — no retroactive entries', async () => {
    const source = make({ positions: [POS('gains:1')], sources: { gains: { status: 'read' } } })
    const result = await source.detect({ account: ACCOUNT, nowMs: NOW, prior: {} })
    expect(result.ok).toBe(true)
    expect(result.entries).toEqual([])
    expect(result.nextSnapshots['perps:gains']).toBeTruthy()
  })

  it('a changed position set emits one entry for the venue', async () => {
    const baseline = make({ positions: [POS('gains:1')], sources: { gains: { status: 'read' } } })
    const first = await baseline.detect({ account: ACCOUNT, nowMs: NOW, prior: {} })

    const changed = make({ positions: [], sources: { gains: { status: 'read' } } })
    const result = await changed.detect({ account: ACCOUNT, nowMs: NOW + 1, prior: { snapshots: first.nextSnapshots } })
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].type).toBe('perps-position-changed')
    expect(result.entries[0].message).toMatch(/closed on Gains Network/)
  })

  it('a venue outage keeps the baseline — an unreadable venue is NOT "positions closed"', async () => {
    const baseline = make({ positions: [POS('gains:1')], sources: { gains: { status: 'read' } } })
    const first = await baseline.detect({ account: ACCOUNT, nowMs: NOW, prior: {} })

    const degraded = make({ positions: [], sources: { gains: { status: 'degraded' } } })
    const result = await degraded.detect({ account: ACCOUNT, nowMs: NOW + 1, prior: { snapshots: first.nextSnapshots } })
    expect(result.entries).toEqual([])
    expect(result.nextSnapshots['perps:gains']).toEqual(first.nextSnapshots['perps:gains'])
  })

  it('total read failure returns ok:false so the engine keeps the prior slice', async () => {
    const source = createPerpsSource({
      deps: { available: () => true, fetchPositions: vi.fn(async () => Promise.reject(new Error('down'))) },
    })
    const result = await source.detect({ account: ACCOUNT, nowMs: NOW, prior: {} })
    expect(result).toEqual({ ok: false })
  })

  it('no account or unavailable surface is a quiet empty', async () => {
    const source = createPerpsSource({ deps: { available: () => false, fetchPositions: vi.fn() } })
    const result = await source.detect({ account: ACCOUNT, nowMs: NOW, prior: {} })
    expect(result.ok).toBe(true)
    expect(result.entries).toEqual([])
  })
})
