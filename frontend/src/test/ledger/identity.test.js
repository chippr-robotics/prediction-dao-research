/**
 * Spec 051 T003 — entryId builders + merge precedence
 * (specs/051-unified-activity-ledger/data-model.md "Identity").
 */
import { describe, it, expect } from 'vitest'
import {
  onchainEntryId,
  subgraphEntryId,
  derivedWagerEntryId,
  clientEntryId,
  namespaceOf,
  wagerDedupKey,
  mergeEntries,
} from '../../data/ledger/identity'

const TX = '0x' + 'ab'.repeat(32)

function entry(overrides = {}) {
  return {
    entryId: 'oc:137:' + TX + ':0',
    chainId: 137,
    account: '0xuser',
    class: 'wager',
    kind: 'deposit',
    provenance: 'onchain',
    txHash: TX,
    refs: {},
    ...overrides,
  }
}

describe('entryId builders', () => {
  it('builds namespaced ids deterministically', () => {
    expect(onchainEntryId({ chainId: 137, txHash: TX, logIndex: 3 })).toBe(`oc:137:${TX}:3`)
    expect(subgraphEntryId({ chainId: 137, entityId: `${TX}-1` })).toBe(`oc:137:wt:${TX}-1`)
    expect(
      derivedWagerEntryId({ chainId: 63, wagerId: '7', kind: 'refund', party: '0xABC' }),
    ).toBe('dv:63:wager:7:refund:0xabc')
    expect(clientEntryId('u-u-i-d')).toBe('cl:u-u-i-d')
  })

  it('is idempotent across re-derivation (same inputs → same id)', () => {
    const a = derivedWagerEntryId({ chainId: 63, wagerId: 7, kind: 'deposit', party: '0xAbC' })
    const b = derivedWagerEntryId({ chainId: 63, wagerId: '7', kind: 'deposit', party: '0xabc' })
    expect(a).toBe(b)
  })

  it('exposes the namespace of an id', () => {
    expect(namespaceOf('oc:1:x:0')).toBe('oc')
    expect(namespaceOf('dv:1:wager:1:deposit:0xa')).toBe('dv')
    expect(namespaceOf('cl:uuid')).toBe('cl')
    expect(namespaceOf('garbage')).toBe(null)
  })
})

describe('mergeEntries', () => {
  it('unions by entryId — identical ids collapse to one record', () => {
    const a = entry()
    const merged = mergeEntries([a, { ...a }])
    expect(merged).toHaveLength(1)
  })

  it('drops a derived entry when an on-chain entry covers the same underlying event', () => {
    const key = wagerDedupKey({ wagerId: '7', kind: 'deposit' })
    const oc = entry({ refs: { wagerId: '7', dedupKey: key } })
    const dv = entry({
      entryId: 'dv:137:wager:7:deposit:0xuser',
      provenance: 'derived',
      txHash: null,
      refs: { wagerId: '7', dedupKey: key },
    })
    const merged = mergeEntries([dv, oc])
    expect(merged).toHaveLength(1)
    expect(merged[0].provenance).toBe('onchain')
  })

  it('keeps derived entries whose underlying event has no on-chain record', () => {
    const dv = entry({
      entryId: 'dv:137:wager:9:refund:0xuser',
      provenance: 'derived',
      txHash: null,
      refs: { wagerId: '9', dedupKey: wagerDedupKey({ wagerId: '9', kind: 'refund' }) },
    })
    expect(mergeEntries([dv])).toHaveLength(1)
  })

  it('links a client record to its on-chain entry by txHash instead of duplicating', () => {
    const oc = entry({ class: 'transfer', kind: 'send' })
    const cl = entry({
      entryId: 'cl:uuid-1',
      class: 'transfer',
      kind: 'send',
      provenance: 'client',
      txHash: TX,
      refs: { route: 'gasless' },
    })
    const merged = mergeEntries([cl, oc])
    expect(merged).toHaveLength(1)
    expect(merged[0].entryId).toBe(oc.entryId)
    expect(merged[0].refs.linkedClientEntryId).toBe('cl:uuid-1')
    expect(merged[0].refs.route).toBe('gasless')
  })

  it('keeps client records with no matching on-chain entry (e.g. failed gasless ops)', () => {
    const cl = entry({
      entryId: 'cl:uuid-2',
      class: 'transfer',
      provenance: 'client',
      status: 'failed',
      txHash: null,
    })
    expect(mergeEntries([cl])).toHaveLength(1)
  })

  it('never mutates its inputs', () => {
    const oc = entry({ class: 'transfer' })
    const frozenRefs = Object.freeze({ route: 'gasless' })
    const cl = entry({
      entryId: 'cl:uuid-3',
      class: 'transfer',
      provenance: 'client',
      txHash: TX,
      refs: frozenRefs,
    })
    const snapshot = JSON.stringify([oc, cl])
    mergeEntries([oc, cl])
    expect(JSON.stringify([oc, cl])).toBe(snapshot)
  })
})
