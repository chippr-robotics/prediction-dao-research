/**
 * One-time migration of legacy device-local activity into the client ledger
 * (spec 051, FR-017/SC-007).
 *
 * Imports every `fairwins.transfers.v1` row for the account as a `cl:` ledger
 * record (via the same pure mapper the live mirror uses, so ids are identical
 * and the union is duplicate-free). Guarded by a per-account marker so it
 * runs once; a re-run against overlapping data is harmless because
 * appendClientRecord is a no-op on existing entryIds.
 *
 * The legacy store itself is left in place (it remains the transfer flow's
 * write path); only the READ paths moved to the ledger.
 */
import { listTransfers } from '../../lib/transfer/transferStore'
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'
import { transferRecordToEntry } from './sources/transferLedgerSource'
import { appendClientRecord, listAllClientRecords } from './ledgerClientStore'

const MIGRATION_MARKER = 'activity_ledger_migrated_v1'

/**
 * @param {string|null} account
 * @returns {{migrated: number, skipped?: boolean}}
 */
export function migrateLegacyActivity(account) {
  if (!account) return { migrated: 0, skipped: true }
  try {
    if (getUserPreference(account, MIGRATION_MARKER, false, true)) {
      return { migrated: 0, skipped: true }
    }

    // All chains at once: legacy rows carry their chainId.
    const legacy = listTransfers(account) || []
    let migrated = 0
    for (const record of legacy) {
      if (record?.chainId == null || !record.id) continue
      const entry = transferRecordToEntry(record, { account })
      const existing = listAllClientRecords(account, record.chainId)
      if (existing.some((r) => r.entryId === entry.entryId)) continue
      appendClientRecord(account, entry)
      migrated += 1
    }

    saveUserPreference(account, MIGRATION_MARKER, true, true)
    return { migrated }
  } catch {
    // Migration is best-effort — never break app bootstrap. The marker is NOT
    // set on failure so the next load retries.
    return { migrated: 0, skipped: true }
  }
}

export default migrateLegacyActivity
