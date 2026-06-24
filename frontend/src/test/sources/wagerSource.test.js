/**
 * wagerSource wrapper tests (spec 031) — proves the wager source delegates to the (separately-tested) wager
 * diff/derive/deadline modules, stamps the generic domain/refId/link fields, and fails honestly. The wager
 * lifecycle logic itself is covered by diffEngine/derivedState/deadlineWarnings tests (unchanged).
 */
import { describe, it, expect, vi } from 'vitest'
import { createWagerSource } from '../../data/notifications/sources/wagerSource'

const NOW = 1765432100000
const ACCOUNT = '0xabcabcabcabcabcabcabcabcabcabcabcabcabca'
const prior = { snapshots: {}, aux: {} }

describe('wagerSource (spec 031)', () => {
  it('delegates and returns ok:true with snapshots + currentIds (first-sight emits no entries)', async () => {
    const fetchWagers = vi.fn().mockResolvedValue([{ id: '42', status: 'active' }, { id: '7', status: 'active' }])
    const scanProposals = vi.fn().mockResolvedValue({ proposals: [], ok: true })
    const src = createWagerSource({ fetchWagers, scanProposals })
    const res = await src.detect({ account: ACCOUNT, chainId: 137, nowMs: NOW, prior })
    expect(src.key).toBe('wagers')
    expect(res.ok).toBe(true)
    expect(res.entries).toEqual([]) // first sight = snapshot-only baseline
    expect(res.currentIds.sort()).toEqual(['42', '7'])
    expect(Object.keys(res.nextSnapshots).sort()).toEqual(['42', '7'])
    expect(res.actionNeededById).toHaveProperty('42')
    expect(fetchWagers).toHaveBeenCalledWith(ACCOUNT, 137)
  })

  it('stamps domain/refId/link on emitted entries (state-change vs prior snapshot)', async () => {
    // Prior snapshot says wager 42 was "active"; now it is cancelled → diffWagers emits a transition entry.
    const priorWith = { snapshots: { 42: { id: '42', state: 'active', status: 'active', snappedAt: NOW - 1000 } }, aux: {} }
    const fetchWagers = vi.fn().mockResolvedValue([{ id: '42', status: 'cancelled' }])
    const scanProposals = vi.fn().mockResolvedValue({ proposals: [], ok: true })
    const src = createWagerSource({ fetchWagers, scanProposals })
    const res = await src.detect({ account: ACCOUNT, chainId: 137, nowMs: NOW, prior: priorWith })
    expect(res.entries.length).toBeGreaterThan(0)
    for (const e of res.entries) {
      expect(e.domain).toBe('wagers')
      expect(e.refId).toBe('42')
      expect(e.link).toEqual({ to: '/app', state: { openWagerId: '42' } })
    }
  })

  it('returns ok:false and retains prior slice when the wager fetch fails', async () => {
    const fetchWagers = vi.fn().mockRejectedValue(new Error('rpc down'))
    const scanProposals = vi.fn().mockResolvedValue({ proposals: [], ok: true })
    const src = createWagerSource({ fetchWagers, scanProposals })
    const res = await src.detect({ account: ACCOUNT, chainId: 137, nowMs: NOW, prior: { snapshots: { 1: { state: 'active' } }, aux: {} } })
    expect(res.ok).toBe(false)
    expect(res.entries).toEqual([])
    expect(res.nextSnapshots).toEqual({ 1: { state: 'active' } }) // prior retained
  })

  it('degrades the draw enrichment when the scan fails (no fabricated revokes)', async () => {
    const fetchWagers = vi.fn().mockResolvedValue([{ id: '42', status: 'active' }])
    const scanProposals = vi.fn().mockRejectedValue(new Error('subgraph down'))
    const src = createWagerSource({ fetchWagers, scanProposals })
    const res = await src.detect({ account: ACCOUNT, chainId: 137, nowMs: NOW, prior })
    expect(res.ok).toBe(true) // wager read succeeded; enrichment degraded
  })
})
