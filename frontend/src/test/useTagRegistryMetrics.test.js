import { describe, it, expect } from 'vitest'
import { reduceTagMetrics } from '../hooks/useTagRegistryMetrics'

const H = (n) => '0x' + String(n).repeat(64).slice(0, 64)
const H1 = H(1)
const H2 = H(2)
const H3 = H(3)
const OWNER = '0x' + 'a'.repeat(40)

describe('reduceTagMetrics (spec 054 operator metrics)', () => {
  it('tallies lifetime counts and computes net registrations', () => {
    const events = [
      { name: 'TagRegistered', args: { tagHash: H1, tag: 'alpha', owner: OWNER }, blockNumber: 10, logIndex: 0 },
      { name: 'TagRegistered', args: { tagHash: H2, tag: 'beta', owner: OWNER }, blockNumber: 11, logIndex: 0 },
      { name: 'TagChanged', args: { newTagHash: H3, owner: OWNER }, blockNumber: 12, logIndex: 0 },
      { name: 'TagReleased', args: { tagHash: H2, owner: OWNER }, blockNumber: 13, logIndex: 0 },
    ]
    const m = reduceTagMetrics(events, false)
    expect(m.counts.registered).toBe(2)
    expect(m.counts.changed).toBe(1)
    expect(m.counts.released).toBe(1)
    expect(m.counts.reclaimed).toBe(0)
    // net = registered − released − reclaimed (change is count-neutral)
    expect(m.netRegistrations).toBe(1)
    expect(m.truncated).toBe(false)
    expect(m.totalEvents).toBe(4)
  })

  it('resolves current moderation state via last-write-wins per tag hash', () => {
    const events = [
      { name: 'TagRegistered', args: { tagHash: H1, tag: 'alpha', owner: OWNER }, blockNumber: 10, logIndex: 0 },
      { name: 'TagRegistered', args: { tagHash: H2, tag: 'beta', owner: OWNER }, blockNumber: 10, logIndex: 1 },
      { name: 'TagSuspended', args: { tagHash: H1, suspended: true }, blockNumber: 11, logIndex: 0 },
      { name: 'TagSuspended', args: { tagHash: H1, suspended: false }, blockNumber: 20, logIndex: 0 }, // later unsuspend wins
      { name: 'TagVerificationSet', args: { tagHash: H2, verified: true }, blockNumber: 12, logIndex: 0 },
      { name: 'TagReserved', args: { tagHash: H3, reserved: true }, blockNumber: 13, logIndex: 0 },
    ]
    const m = reduceTagMetrics(events, false)
    expect(m.suspended).toHaveLength(0) // last write for H1 is false
    expect(m.verified.map((v) => v.tag)).toEqual(['beta']) // labelled from TagRegistered
    expect(m.reserved.map((r) => r.tagHash)).toEqual([H3])
    expect(m.reserved[0].tag).toBeNull() // reserved-by-hash, never registered → no label
  })

  it('orders the recent feed newest-first and honors the truncated flag', () => {
    const events = [
      { name: 'TagRegistered', args: { tagHash: H1, tag: 'alpha', owner: OWNER }, blockNumber: 5, logIndex: 0 },
      { name: 'TagReleased', args: { tagHash: H1, owner: OWNER }, blockNumber: 30, logIndex: 2 },
      { name: 'TagRegistered', args: { tagHash: H2, tag: 'beta', owner: OWNER }, blockNumber: 30, logIndex: 1 },
    ]
    const m = reduceTagMetrics(events, true)
    expect(m.truncated).toBe(true)
    // newest first: block 30 logIndex 2 (Released), then 30/1 (Registered), then 5/0
    expect(m.recent.map((r) => r.type)).toEqual(['TagReleased', 'TagRegistered', 'TagRegistered'])
    expect(m.recent[0].block).toBe(30)
  })

  it('handles an empty event set', () => {
    const m = reduceTagMetrics([], false)
    expect(m.netRegistrations).toBe(0)
    expect(m.recent).toEqual([])
    expect(m.suspended).toEqual([])
  })
})
