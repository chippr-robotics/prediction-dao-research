/**
 * Spec 051 T007 — repository assembly: aggregation, dedup, per-source
 * degradation, filters, sorting (contracts/ledger-source.md).
 */
import { describe, it, expect } from 'vitest'
import { createLedgerRepository } from '../../data/ledger/ledgerRepository'

const TX = (n) => '0x' + String(n).padStart(2, '0').repeat(32)
const CTX = { account: '0xUser', chainId: 137 }

function preItem(overrides = {}) {
  const tx = overrides.txHash ?? TX(1)
  return {
    entryId: `oc:137:${tx}:0`,
    chainId: 137,
    class: 'wager',
    kind: 'deposit',
    direction: 'out',
    status: 'settled',
    provenance: 'onchain',
    txHash: tx,
    amountRaw: '1000000',
    tokenAddress: '0xtoken',
    timestamp: 1_700_000_000_000,
    timestampProvenance: 'chain',
    ...overrides,
  }
}

function source(cls, items) {
  return { class: cls, list: async () => items }
}

// Identity enrichment: mark everything valued so tests are deterministic.
const passThroughEnrich = async (entries) =>
  entries.map((e) => ({ ...e, amount: 1, tokenSymbol: 'USC', tokenDecimals: 6, valueUsd: 1, valuationStatus: 'valued' }))

describe('ledgerRepository.listEntries', () => {
  it('aggregates entries from all sources, sorted newest first', async () => {
    const repo = createLedgerRepository({
      sources: [
        source('wager', [preItem({ timestamp: 3000 })]),
        source('transfer', [
          preItem({ entryId: `oc:137:${TX(2)}:0`, txHash: TX(2), class: 'transfer', kind: 'send', timestamp: 5000 }),
        ]),
      ],
      enrich: passThroughEnrich,
    })
    const { entries, staleClasses } = await repo.listEntries(CTX)
    expect(entries.map((e) => e.class)).toEqual(['transfer', 'wager'])
    expect(staleClasses).toEqual([])
  })

  it('degrades per source: a failing source is reported stale, others still return', async () => {
    const repo = createLedgerRepository({
      sources: [
        { class: 'earn', list: async () => { throw new Error('subgraph down') } },
        source('wager', [preItem()]),
      ],
      enrich: passThroughEnrich,
    })
    const { entries, staleClasses, readState } = await repo.listEntries(CTX)
    expect(entries).toHaveLength(1)
    expect(staleClasses).toEqual(['earn'])
    // One source answered, so the read happened — just not completely.
    expect(readState).toBe('read')
  })

  // Issue #1280 — the empty list a total failure returns is byte-identical to
  // the empty list of an account with no history. `readState` is what keeps
  // them apart, so the caller never renders a failed read as an empty record.
  it('reports readState "unreadable" when EVERY source failed', async () => {
    const repo = createLedgerRepository({
      sources: [
        { class: 'wager', list: async () => { throw new Error('rpc 503') } },
        { class: 'transfer', list: async () => { throw new Error('rpc 503') } },
      ],
      enrich: passThroughEnrich,
    })
    const { entries, staleClasses, readState } = await repo.listEntries(CTX)
    expect(entries).toEqual([])
    expect(staleClasses).toEqual(['wager', 'transfer'])
    expect(readState).toBe('unreadable')
  })

  it('an account with genuinely no history is readState "read", not unreadable', async () => {
    const repo = createLedgerRepository({
      sources: [source('wager', []), source('transfer', [])],
      enrich: passThroughEnrich,
    })
    const { entries, staleClasses, readState } = await repo.listEntries(CTX)
    expect(entries).toEqual([])
    expect(staleClasses).toEqual([])
    expect(readState).toBe('read')
  })

  // The shape of the SHIPPED wiring: six of the nine default sources read the
  // client record store and cannot fail because a network is down. Counting
  // rejections across all of them made `unreadable` unreachable in production —
  // the outage in #1280 would still have produced a confident empty ledger.
  it('client-store sources answering does NOT mask a total network outage', async () => {
    const repo = createLedgerRepository({
      sources: [
        // network-backed: the whole reason the ledger can speak about a chain
        { class: 'wager', backing: 'network', list: async () => { throw new Error('rpc 503') } },
        { class: 'pool', backing: 'network', list: async () => { throw new Error('subgraph refused') } },
        { class: 'membership', backing: 'network', list: async () => { throw new Error('rpc 503') } },
        // client-store: localStorage, fulfils regardless of any network
        { class: 'transfer', backing: 'client', list: async () => [] },
        { class: 'earn', backing: 'client', list: async () => [] },
        { class: 'miniapp', backing: 'client', list: async () => [] },
      ],
      enrich: passThroughEnrich,
    })
    const { entries, readState, staleClasses } = await repo.listEntries(CTX)
    expect(entries).toEqual([])
    expect(readState).toBe('unreadable')
    expect(staleClasses).toEqual(['wager', 'pool', 'membership'])
  })

  it('records that DID arrive are kept and shown, never discarded as unreadable', async () => {
    const repo = createLedgerRepository({
      sources: [
        { class: 'wager', backing: 'network', list: async () => { throw new Error('rpc 503') } },
        { ...source('transfer', [preItem({ class: 'transfer', kind: 'send' })]), backing: 'client' },
      ],
      enrich: passThroughEnrich,
    })
    const { entries, readState, staleClasses } = await repo.listEntries(CTX)
    // The member's own stored record is data, not noise: `unreadable` is
    // reserved for an entry list that carries no information at all, because
    // the estate merge drops an unreachable chain's entries entirely.
    expect(entries).toHaveLength(1)
    expect(readState).toBe('read')
    expect(staleClasses).toEqual(['wager'])
  })

  it('a source that is NOT deployed on the chain has read nothing, not failed', async () => {
    const repo = createLedgerRepository({
      // What Ethereum looks like: no FairWins escrow, so the network sources
      // return [] rather than rejecting. An empty result there is the truth.
      sources: [
        { class: 'wager', backing: 'network', list: async () => [] },
        { class: 'transfer', backing: 'client', list: async () => [] },
      ],
      enrich: passThroughEnrich,
    })
    const { readState, staleClasses } = await repo.listEntries(CTX)
    expect(readState).toBe('read')
    expect(staleClasses).toEqual([])
  })

  it('an unclassified source counts as network-backed (the conservative reading)', async () => {
    const repo = createLedgerRepository({
      sources: [{ class: 'wager', list: async () => { throw new Error('rpc 503') } }],
      enrich: passThroughEnrich,
    })
    expect((await repo.listEntries(CTX)).readState).toBe('unreadable')
  })

  it('dedups the same underlying event across sources (oc beats dv)', async () => {
    const dedupKey = 'wager:7:deposit'
    const repo = createLedgerRepository({
      sources: [
        source('wager', [preItem({ refs: { wagerId: '7', dedupKey } })]),
        source('wager', [
          preItem({
            entryId: 'dv:137:wager:7:deposit:0xuser',
            provenance: 'derived',
            txHash: null,
            timestamp: null,
            refs: { wagerId: '7', dedupKey },
          }),
        ]),
      ],
      enrich: passThroughEnrich,
    })
    const { entries } = await repo.listEntries(CTX)
    expect(entries).toHaveLength(1)
    expect(entries[0].provenance).toBe('onchain')
  })

  it('sorts null-timestamp entries after dated ones', async () => {
    const repo = createLedgerRepository({
      sources: [
        source('wager', [
          preItem({ entryId: 'dv:137:wager:1:deposit:0xuser', provenance: 'derived', txHash: null, timestamp: null }),
          preItem({ entryId: `oc:137:${TX(3)}:0`, txHash: TX(3), timestamp: 1000 }),
        ]),
      ],
      enrich: passThroughEnrich,
    })
    const { entries } = await repo.listEntries(CTX)
    expect(entries[0].timestamp).toBe(1000)
    expect(entries[1].timestamp).toBe(null)
  })

  it('filters by class, status, and period; failed entries are included by default', async () => {
    const repo = createLedgerRepository({
      sources: [
        source('transfer', [
          preItem({ entryId: `oc:137:${TX(4)}:0`, txHash: TX(4), class: 'transfer', kind: 'send', timestamp: 2000 }),
          preItem({
            entryId: 'cl:fail-1',
            provenance: 'client',
            class: 'transfer',
            kind: 'send',
            status: 'failed',
            failureReason: 'insufficient funds',
            txHash: null,
            timestamp: 4000,
            timestampProvenance: 'device',
          }),
        ]),
        source('wager', [preItem({ timestamp: 3000 })]),
      ],
      enrich: passThroughEnrich,
    })

    const all = await repo.listEntries(CTX)
    expect(all.entries).toHaveLength(3)

    const transfersOnly = await repo.listEntries({ ...CTX, filter: { classes: ['transfer'] } })
    expect(transfersOnly.entries.every((e) => e.class === 'transfer')).toBe(true)
    expect(transfersOnly.entries).toHaveLength(2)

    const failedOnly = await repo.listEntries({ ...CTX, filter: { statuses: ['failed'] } })
    expect(failedOnly.entries).toHaveLength(1)
    expect(failedOnly.entries[0].failureReason).toBe('insufficient funds')

    const period = await repo.listEntries({ ...CTX, period: { fromMs: 2500, toMs: 3500 } })
    expect(period.entries).toHaveLength(1)
    expect(period.entries[0].timestamp).toBe(3000)
  })

  it('marks a source stale when it returns entries violating invariants (e.g. leaked chainId)', async () => {
    const repo = createLedgerRepository({
      sources: [source('pool', [preItem({ chainId: 1 })]), source('wager', [preItem()])],
      enrich: passThroughEnrich,
    })
    const { entries, staleClasses } = await repo.listEntries(CTX)
    expect(entries).toHaveLength(1)
    expect(staleClasses).toEqual(['pool'])
  })

  it('exposes prunedBefore from the injected disclosure provider', async () => {
    const repo = createLedgerRepository({
      sources: [source('wager', [preItem()])],
      enrich: passThroughEnrich,
      getPrunedBefore: () => 12345,
    })
    const { prunedBefore } = await repo.listEntries(CTX)
    expect(prunedBefore).toBe(12345)
  })
})
