/**
 * Spec 051 T029 — one-time idempotent migration of the legacy
 * `fairwins.transfers.v1` device log into the client ledger (FR-017, SC-007).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { recordTransfer, updateTransfer, __clearTransfers, TRANSFER_STATUS } from '../../lib/transfer/transferStore'
import { migrateLegacyActivity } from '../../data/ledger/migrate'
import { listClientRecords, __clearClientLedger } from '../../data/ledger/ledgerClientStore'

const ACCOUNT = '0xAbc0000000000000000000000000000000000009'

beforeEach(() => {
  __clearTransfers()
  __clearClientLedger()
  localStorage.clear()
})

function seedLegacy() {
  const ok = recordTransfer(ACCOUNT, {
    chainId: 137,
    kind: 'stable',
    symbol: 'USC',
    decimals: 6,
    amount: '7.5',
    from: ACCOUNT,
    to: '0xdest',
    route: 'gasless',
  })
  updateTransfer(ACCOUNT, ok.id, { status: TRANSFER_STATUS.COMPLETE, txHash: '0x' + 'aa'.repeat(32) })
  const failed = recordTransfer(ACCOUNT, {
    chainId: 137,
    kind: 'native',
    symbol: 'MATIC',
    decimals: 18,
    amount: '0.01',
    from: ACCOUNT,
    to: '0xdest',
    route: 'gasless',
  })
  updateTransfer(ACCOUNT, failed.id, {
    status: TRANSFER_STATUS.FAILED,
    error: 'Smart Account does not have sufficient funds to execute the User Operation.',
  })
  const otherChain = recordTransfer(ACCOUNT, {
    chainId: 63,
    kind: 'native',
    symbol: 'METC',
    decimals: 18,
    amount: '1',
    from: ACCOUNT,
    to: '0xdest',
    route: 'direct',
  })
  return { ok, failed, otherChain }
}

describe('migrateLegacyActivity', () => {
  it('imports legacy transfers into the client ledger preserving status/error/txHash/createdAt, per chain', () => {
    const { ok, failed } = seedLegacy()
    const result = migrateLegacyActivity(ACCOUNT)
    expect(result.migrated).toBe(3)

    const polygon = listClientRecords(ACCOUNT, 137)
    expect(polygon).toHaveLength(2)
    const okEntry = polygon.find((r) => r.entryId === `cl:${ok.id}`)
    expect(okEntry.status).toBe('settled')
    expect(okEntry.txHash).toBe('0x' + 'aa'.repeat(32))
    expect(okEntry.timestamp).toBe(ok.createdAt)
    const failEntry = polygon.find((r) => r.entryId === `cl:${failed.id}`)
    expect(failEntry.status).toBe('failed')
    expect(failEntry.failureReason).toMatch(/sufficient funds/)

    expect(listClientRecords(ACCOUNT, 63)).toHaveLength(1)
  })

  it('is idempotent: a second run (marker set) imports nothing and duplicates nothing', () => {
    seedLegacy()
    migrateLegacyActivity(ACCOUNT)
    const second = migrateLegacyActivity(ACCOUNT)
    expect(second.migrated).toBe(0)
    expect(second.skipped).toBe(true)
    expect(listClientRecords(ACCOUNT, 137)).toHaveLength(2)
  })

  it('does not duplicate records already mirrored live (same cl: ids)', () => {
    const { ok } = seedLegacy()
    // Simulate the live mirror having already captured the settled transfer.
    migrateLegacyActivity(ACCOUNT)
    // Force marker off to simulate a re-run against overlapping data.
    localStorage.removeItem(`fw_user_${ACCOUNT.toLowerCase()}_activity_ledger_migrated_v1`)
    const rerun = migrateLegacyActivity(ACCOUNT)
    expect(rerun.migrated).toBe(0) // union by entryId — nothing new
    expect(listClientRecords(ACCOUNT, 137).filter((r) => r.entryId === `cl:${ok.id}`)).toHaveLength(1)
  })

  it('no-ops without an account', () => {
    expect(migrateLegacyActivity(null)).toEqual({ migrated: 0, skipped: true })
  })
})
