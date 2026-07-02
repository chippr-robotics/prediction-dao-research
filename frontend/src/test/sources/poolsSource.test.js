/**
 * poolsSource tests (spec 037 follow-up) — group-pool lifecycle snapshot-diff into the activity feed:
 * joining-closed / resolved / cancelled / member-joined transitions, action-needed for resolved+cancelled,
 * baseline on first sight, and ok:false on read failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../lib/lookup/myWagersSources', () => ({ loadMyWagersSources: h.load }))

import { poolsSource } from '../../data/notifications/sources/poolsSource'

const pool = (over = {}) => ({ address: '0xpool1', poolId: 3, state: 0, stateLabel: 'Joining open', memberCount: 2, maxMembers: 10, ...over })
const detect = (args) => poolsSource.detect({ account: '0xUser', chainId: 137, nowMs: 1_000_000, prior: { snapshots: {} }, ...args })

describe('poolsSource', () => {
  beforeEach(() => { h.load.mockReset() })

  it('returns empty (no read) when there is no account', async () => {
    const out = await poolsSource.detect({ account: null, chainId: 137, nowMs: 1, prior: { snapshots: {} } })
    expect(out).toEqual({ ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} })
    expect(h.load).not.toHaveBeenCalled()
  })

  it('first sight is a baseline — snapshots but no entries', async () => {
    h.load.mockResolvedValue({ createdPools: [pool()], joinedPools: [] })
    const out = await detect({ prior: { snapshots: {} } })
    expect(out.ok).toBe(true)
    expect(out.entries).toEqual([])
    expect(out.nextSnapshots['0xpool1']).toMatchObject({ state: 0, memberCount: 2 })
    expect(out.currentIds).toEqual(['0xpool1'])
  })

  it('emits a resolved entry + action-needed on 0→2', async () => {
    h.load.mockResolvedValue({ createdPools: [pool({ state: 2 })], joinedPools: [] })
    const out = await detect({ prior: { snapshots: { '0xpool1': { state: 0, memberCount: 2 } } } })
    expect(out.entries).toHaveLength(1)
    expect(out.entries[0]).toMatchObject({ domain: 'pools', type: 'pool-resolved', severity: 'success', actionable: true, refId: '0xpool1' })
    expect(out.entries[0].link).toEqual({ to: '/pools/0xpool1' })
    expect(out.actionNeededById).toEqual({ '0xpool1': 'checkPool' })
  })

  it('emits a cancelled entry + refund action on →3', async () => {
    h.load.mockResolvedValue({ createdPools: [], joinedPools: [pool({ state: 3 })] })
    const out = await detect({ prior: { snapshots: { '0xpool1': { state: 1, memberCount: 5 } } } })
    expect(out.entries[0]).toMatchObject({ type: 'pool-cancelled', severity: 'warning', actionable: true })
    expect(out.actionNeededById).toEqual({ '0xpool1': 'refund' })
  })

  it('emits joining-closed on 0→1 (informational, no action)', async () => {
    h.load.mockResolvedValue({ createdPools: [pool({ state: 1 })], joinedPools: [] })
    const out = await detect({ prior: { snapshots: { '0xpool1': { state: 0, memberCount: 2 } } } })
    expect(out.entries[0]).toMatchObject({ type: 'pool-closed', severity: 'info', actionable: false })
    expect(out.actionNeededById).toEqual({})
  })

  it('emits a member-joined entry when the count grows while still open', async () => {
    h.load.mockResolvedValue({ createdPools: [pool({ state: 0, memberCount: 4 })], joinedPools: [] })
    const out = await detect({ prior: { snapshots: { '0xpool1': { state: 0, memberCount: 2 } } } })
    expect(out.entries[0]).toMatchObject({ type: 'pool-member-joined', severity: 'info' })
    expect(out.entries[0].message).toMatch(/4\/10 members/)
  })

  it('de-dups a pool that is both created and joined', async () => {
    h.load.mockResolvedValue({ createdPools: [pool()], joinedPools: [pool()] })
    const out = await detect({ prior: { snapshots: {} } })
    expect(out.currentIds).toEqual(['0xpool1'])
  })

  it('returns ok:false when the pool read fails (retain prior slice)', async () => {
    h.load.mockRejectedValue(new Error('subgraph down'))
    const out = await detect({ prior: { snapshots: {} } })
    expect(out).toEqual({ ok: false })
  })
})
