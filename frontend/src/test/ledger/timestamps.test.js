/**
 * Spec 051 T036 — chain-time hydration for subgraph-less networks (US4,
 * FR-005): bounded event scan → block timestamps in ms; budget exhaustion or
 * scan failure yields null (never 0); cache short-circuits RPC; cache loss is
 * harmless (re-derivable).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { hydrateWagerTimestamps, __clearTimestampCache } from '../../data/ledger/timestamps'

const CHAIN_ID = 63 // Mordor — no subgraph

function wager(id, overrides = {}) {
  return {
    id: String(id),
    creator: '0xme',
    status: 'resolved',
    createdAt: 0, // RegistrySource: no creation time on-chain
    resolvedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  __clearTimestampCache()
  localStorage.clear()
})

describe('hydrateWagerTimestamps', () => {
  it('fills createdAt/resolvedAt (ms) from the wager events + block times', async () => {
    const getWagerEvents = vi.fn(async (id) => [
      { name: 'WagerCreated', blockNumber: 100, args: { wagerId: id } },
      { name: 'PayoutClaimed', blockNumber: 200, args: { wagerId: id } },
    ])
    const getBlock = vi.fn(async (n) => ({ timestamp: n === 100 ? 1_700_000_000 : 1_700_000_600 }))
    const out = await hydrateWagerTimestamps([wager(7)], CHAIN_ID, { getWagerEvents, getBlock })
    expect(out[0].createdAt).toBe(1_700_000_000_000)
    expect(out[0].resolvedAt).toBe(1_700_000_600_000)
  })

  it('leaves timestamps falsy (never fabricated) when the scan fails or is over budget', async () => {
    const getWagerEvents = vi.fn(async () => {
      throw new Error('This report period is too large to read from the network')
    })
    const out = await hydrateWagerTimestamps([wager(8)], CHAIN_ID, { getWagerEvents, getBlock: vi.fn() })
    expect(out[0].createdAt).toBe(0) // untouched — deriveTransfers maps 0 → null timestamp
    expect(out[0].resolvedAt).toBe(null)
  })

  it('caches resolved times so the second call makes no RPC reads', async () => {
    const getWagerEvents = vi.fn(async (id) => [
      { name: 'WagerCreated', blockNumber: 100, args: { wagerId: id } },
    ])
    const getBlock = vi.fn(async () => ({ timestamp: 1_700_000_000 }))
    await hydrateWagerTimestamps([wager(9)], CHAIN_ID, { getWagerEvents, getBlock })
    expect(getWagerEvents).toHaveBeenCalledTimes(1)

    const out = await hydrateWagerTimestamps([wager(9)], CHAIN_ID, { getWagerEvents, getBlock })
    expect(getWagerEvents).toHaveBeenCalledTimes(1) // cache hit — no new scan
    expect(out[0].createdAt).toBe(1_700_000_000_000)
  })

  it('skips wagers that already carry a real createdAt', async () => {
    const getWagerEvents = vi.fn()
    const out = await hydrateWagerTimestamps(
      [wager(10, { createdAt: 1_700_000_111_000 })],
      CHAIN_ID,
      { getWagerEvents, getBlock: vi.fn() },
    )
    expect(getWagerEvents).not.toHaveBeenCalled()
    expect(out[0].createdAt).toBe(1_700_000_111_000)
  })

  it('bounds work per call: stops scanning new wagers once the budget is spent', async () => {
    let calls = 0
    const getWagerEvents = vi.fn(async (id) => {
      calls += 1
      return [{ name: 'WagerCreated', blockNumber: 100, args: { wagerId: id } }]
    })
    const getBlock = vi.fn(async () => ({ timestamp: 1_700_000_000 }))
    const many = Array.from({ length: 10 }, (_, i) => wager(100 + i))
    await hydrateWagerTimestamps(many, CHAIN_ID, { getWagerEvents, getBlock, maxWagersPerCall: 3 })
    expect(calls).toBe(3) // remaining wagers hydrate on later polls
  })
})
