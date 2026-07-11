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
    const { entries, staleClasses } = await repo.listEntries(CTX)
    expect(entries).toHaveLength(1)
    expect(staleClasses).toEqual(['earn'])
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
