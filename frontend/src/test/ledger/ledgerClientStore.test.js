/**
 * Spec 051 T026 — append-only client-record store (data-model.md
 * "ClientLedgerRecord"): supersede resolution, chainId scoping, FR-013
 * pruning guard, storage failure isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  appendClientRecord,
  listClientRecords,
  listAllClientRecords,
  getPrunedBefore,
  pruneClientRecords,
  __clearClientLedger,
} from '../../data/ledger/ledgerClientStore'

const ACCOUNT = '0xAbCd000000000000000000000000000000000001'

function record(overrides = {}) {
  return {
    entryId: 'cl:r1',
    chainId: 137,
    class: 'transfer',
    kind: 'send',
    direction: 'out',
    status: 'pending',
    provenance: 'client',
    amountRaw: '1000000',
    tokenAddress: '0xtoken',
    timestamp: 1_700_000_000_000,
    timestampProvenance: 'device',
    recordedAt: 1_700_000_000_000,
    refs: {},
    ...overrides,
  }
}

beforeEach(() => {
  __clearClientLedger()
})

describe('ledgerClientStore', () => {
  it('appends and lists records scoped by account and chainId', () => {
    appendClientRecord(ACCOUNT, record())
    appendClientRecord(ACCOUNT, record({ entryId: 'cl:r2', chainId: 63 }))
    expect(listClientRecords(ACCOUNT, 137)).toHaveLength(1)
    expect(listClientRecords(ACCOUNT, 63)).toHaveLength(1)
    expect(listClientRecords('0xother', 137)).toHaveLength(0)
  })

  it('is append-only: re-appending an existing entryId is a no-op (original preserved)', () => {
    appendClientRecord(ACCOUNT, record({ status: 'pending' }))
    appendClientRecord(ACCOUNT, record({ status: 'failed' })) // same entryId — ignored
    const rows = listClientRecords(ACCOUNT, 137)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending')
  })

  it('resolves supersede chains to the latest record while keeping the full chain readable', () => {
    appendClientRecord(ACCOUNT, record({ status: 'pending' }))
    appendClientRecord(
      ACCOUNT,
      record({
        entryId: 'cl:r1:u1',
        status: 'failed',
        failureReason: 'insufficient funds',
        recordedAt: 1_700_000_001_000,
        refs: { supersedes: 'cl:r1' },
      }),
    )
    const resolved = listClientRecords(ACCOUNT, 137)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].status).toBe('failed')
    expect(resolved[0].refs.supersedes).toBe('cl:r1')
    // Audit trail: raw history keeps both records.
    expect(listAllClientRecords(ACCOUNT, 137)).toHaveLength(2)
  })

  it('never throws into the caller when storage is unavailable', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded')
    }
    try {
      expect(() => appendClientRecord(ACCOUNT, record())).not.toThrow()
    } finally {
      Storage.prototype.setItem = original
    }
  })

  describe('pruning (FR-013)', () => {
    it('has no cap and no pruning by default', () => {
      for (let i = 0; i < 150; i++) {
        appendClientRecord(ACCOUNT, record({ entryId: `cl:bulk-${i}` }))
      }
      expect(listClientRecords(ACCOUNT, 137)).toHaveLength(150)
      expect(getPrunedBefore(ACCOUNT, 137)).toBe(null)
    })

    it('refuses to prune into the current or previous tax year', () => {
      const now = Date.UTC(2026, 6, 11) // 2026-07-11
      const janPrevYear = Date.UTC(2025, 0, 1)
      appendClientRecord(ACCOUNT, record())
      const result = pruneClientRecords(ACCOUNT, 137, { cutoffMs: janPrevYear + 1, nowMs: now })
      expect(result.pruned).toBe(0)
      expect(getPrunedBefore(ACCOUNT, 137)).toBe(null)
    })

    it('prunes older-than-cutoff records and records the disclosed marker', () => {
      const now = Date.UTC(2026, 6, 11)
      const old = Date.UTC(2023, 3, 1)
      const recent = Date.UTC(2026, 5, 1)
      appendClientRecord(ACCOUNT, record({ entryId: 'cl:old', timestamp: old, recordedAt: old }))
      appendClientRecord(ACCOUNT, record({ entryId: 'cl:new', timestamp: recent, recordedAt: recent }))
      const cutoff = Date.UTC(2024, 0, 1) // before Jan 1 of previous tax year (2025)
      const result = pruneClientRecords(ACCOUNT, 137, { cutoffMs: cutoff, nowMs: now })
      expect(result.pruned).toBe(1)
      expect(listClientRecords(ACCOUNT, 137).map((r) => r.entryId)).toEqual(['cl:new'])
      expect(getPrunedBefore(ACCOUNT, 137)).toBe(cutoff)
    })
  })
})
