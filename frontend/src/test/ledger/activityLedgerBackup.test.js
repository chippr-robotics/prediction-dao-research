/**
 * Spec 051 T031 — the `activityLedger` spec-032 synced object: backup
 * round-trip, union-by-entryId merge in every mode, restore dedup (FR-010/011).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import syncedObjects from '../../lib/backup/syncedObjects'
import {
  appendClientRecord,
  listClientRecords,
  __clearClientLedger,
} from '../../data/ledger/ledgerClientStore'

const ACCOUNT = '0xAbc0000000000000000000000000000000000031'

const failedGasless = {
  entryId: 'cl:t-fail',
  chainId: 137,
  class: 'transfer',
  kind: 'send',
  direction: 'none',
  status: 'failed',
  failureReason: 'Smart Account does not have sufficient funds to execute the User Operation.',
  provenance: 'client',
  txHash: null,
  timestamp: 1_760_000_000_000,
  timestampProvenance: 'device',
  recordedAt: 1_760_000_000_000,
  refs: { route: 'gasless', transferId: 't-fail' },
}

const mordorRecord = {
  ...failedGasless,
  entryId: 'cl:t-mordor',
  chainId: 63,
  refs: { route: 'direct', transferId: 't-mordor' },
}

const ledgerObject = syncedObjects.find((o) => o.key === 'activityLedger')

beforeEach(() => {
  __clearClientLedger()
  localStorage.clear()
})

describe('activityLedger synced object (spec 032 registry)', () => {
  it('is registered and network-scoped', () => {
    expect(ledgerObject).toBeTruthy()
    expect(ledgerObject.networkScoped).toBe(true)
  })

  it('load returns all client records across chains (the backup payload)', () => {
    appendClientRecord(ACCOUNT, failedGasless)
    appendClientRecord(ACCOUNT, mordorRecord)
    const payload = ledgerObject.load(ACCOUNT)
    expect(payload).toHaveLength(2)
    expect(new Set(payload.map((r) => r.chainId))).toEqual(new Set([137, 63]))
  })

  it('survives a full wipe + restore round-trip, including the failed gasless entry (SC-003)', () => {
    appendClientRecord(ACCOUNT, failedGasless)
    const backup = ledgerObject.load(ACCOUNT)

    __clearClientLedger() // the "new device"
    expect(listClientRecords(ACCOUNT, 137)).toHaveLength(0)

    ledgerObject.apply(ACCOUNT, backup, 'merge')
    const restored = listClientRecords(ACCOUNT, 137)
    expect(restored).toHaveLength(1)
    expect(restored[0].failureReason).toMatch(/sufficient funds/)
  })

  it('restore is a union — repeating it or overlapping live data never duplicates (FR-011)', () => {
    appendClientRecord(ACCOUNT, failedGasless)
    const backup = ledgerObject.load(ACCOUNT)
    ledgerObject.apply(ACCOUNT, backup, 'merge')
    ledgerObject.apply(ACCOUNT, backup, 'merge')
    expect(listClientRecords(ACCOUNT, 137)).toHaveLength(1)
  })

  it('replace mode also unions — restoring must never delete audit history (FR-008)', () => {
    appendClientRecord(ACCOUNT, failedGasless)
    appendClientRecord(ACCOUNT, { ...failedGasless, entryId: 'cl:t-local-only' })
    // A backup made before the second record existed:
    ledgerObject.apply(ACCOUNT, [failedGasless], 'replace')
    expect(listClientRecords(ACCOUNT, 137)).toHaveLength(2)
  })

  it('merge helper unions by entryId with no conflicts', () => {
    const { value, conflicts } = ledgerObject.merge([failedGasless], [failedGasless, mordorRecord])
    expect(value).toHaveLength(2)
    expect(conflicts).toEqual([])
  })
})
