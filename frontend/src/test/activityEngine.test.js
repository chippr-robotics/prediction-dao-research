/**
 * Engine composition tests (spec 031) — detectAll runs N sources, merges fresh entries in registry order,
 * collects per-domain action maps, and isolates failures (a failing source retains its prior slice + prior
 * action map; others proceed). Pure aggregation; sources are mocked.
 */
import { describe, it, expect, vi } from 'vitest'
import { detectAll, countActionNeeded } from '../data/notifications/activityEngine'
import { defaultStore, setSourceSlice } from '../data/notifications/activityStore'

const NOW = 1765432100000
const ctx = { account: '0xabc', chainId: 137, nowMs: NOW }

function source(key, result) {
  return { key, label: key, detect: vi.fn().mockResolvedValue(result) }
}

describe('activityEngine.detectAll (spec 031)', () => {
  it('merges fresh entries in registry order and records slice updates + action maps', async () => {
    const a = source('a', { ok: true, entries: [{ id: 'a1' }], nextSnapshots: { x: 1 }, nextAux: {}, currentIds: ['x'], actionNeededById: { x: 'vote' } })
    const b = source('b', { ok: true, entries: [{ id: 'b1' }, { id: 'b2' }], nextSnapshots: {}, nextAux: {}, currentIds: [], actionNeededById: {} })
    const r = await detectAll({ ...ctx, sources: [a, b], priorStore: defaultStore() })
    expect(r.fresh.map((e) => e.id)).toEqual(['a1', 'b1', 'b2']) // order = registry order
    expect(r.sliceUpdates.a.snapshots).toEqual({ x: 1 })
    expect(r.actionNeededByDomain).toEqual({ a: { x: 'vote' }, b: {} })
    expect(r.anyFailure).toBe(false)
  })

  it('passes each source its OWN prior slice', async () => {
    const a = source('a', { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} })
    let store = defaultStore()
    store = setSourceSlice(store, 'a', { snapshots: { seen: true }, aux: { w: 1 } })
    await detectAll({ ...ctx, sources: [a], priorStore: store })
    expect(a.detect).toHaveBeenCalledWith(expect.objectContaining({ prior: { snapshots: { seen: true }, aux: { w: 1 } } }))
  })

  it('a failing source (ok:false) is isolated: no slice update, prior action map retained, others proceed', async () => {
    const ok = source('ok', { ok: true, entries: [{ id: 'ok1' }], nextSnapshots: { y: 2 }, currentIds: ['y'], actionNeededById: { y: 'queue' } })
    const bad = source('bad', { ok: false })
    const r = await detectAll({ ...ctx, sources: [bad, ok], priorStore: defaultStore(), prevActionByDomain: { bad: { z: 'renew' } } })
    expect(r.fresh.map((e) => e.id)).toEqual(['ok1'])
    expect(r.sliceUpdates).not.toHaveProperty('bad') // prior slice retained
    expect(r.sliceUpdates).toHaveProperty('ok')
    expect(r.actionNeededByDomain.bad).toEqual({ z: 'renew' }) // prior action map carried
    expect(r.anyFailure).toBe(true)
  })

  it('a thrown source is treated as ok:false (never crashes the cycle)', async () => {
    const boom = { key: 'boom', detect: vi.fn().mockRejectedValue(new Error('rpc down')) }
    const r = await detectAll({ ...ctx, sources: [boom], priorStore: defaultStore() })
    expect(r.anyFailure).toBe(true)
    expect(r.fresh).toEqual([])
  })

  it('surfaces a source partial flag', async () => {
    const p = source('p', { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {}, partial: true })
    const r = await detectAll({ ...ctx, sources: [p], priorStore: defaultStore() })
    expect(r.partialByDomain.p).toBe(true)
  })

  it('countActionNeeded totals truthy kinds across domains', () => {
    expect(countActionNeeded({ a: { x: 'vote', y: null }, b: { z: 'renew' } })).toBe(2)
    expect(countActionNeeded({})).toBe(0)
  })

  it('extensibility: a brand-new source object flows through with no engine changes (SC-004)', async () => {
    // A future domain implemented purely as { key, detect } — the engine consumes it unchanged.
    const future = { key: 'futarchy', label: 'Futarchy', detect: vi.fn().mockResolvedValue({ ok: true, entries: [{ id: 'f1' }], nextSnapshots: { p: 1 }, currentIds: ['p'], actionNeededById: { p: 'decide' } }) }
    const r = await detectAll({ ...ctx, sources: [future], priorStore: defaultStore() })
    expect(r.fresh.map((e) => e.id)).toEqual(['f1'])
    expect(r.sliceUpdates.futarchy.snapshots).toEqual({ p: 1 })
    expect(r.actionNeededByDomain.futarchy).toEqual({ p: 'decide' })
  })
})
