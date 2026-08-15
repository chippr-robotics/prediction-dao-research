/**
 * Spec 085 — hardware-wallet account audit records.
 *
 * Adding or removing a cold-storage account must be auditable (a durable record
 * that the reference changed) without recording anything a device could be
 * fingerprinted by: the records carry the account address, vendor name, and
 * derivation path only (FR-007). They ride the encrypted spec-032 backup like
 * any other client-ledger entry (the `activityLedger` synced object).
 *
 * EntryIds are STABLE per (event, chain, address), so re-adding the same
 * account is idempotent — `appendClientRecord` no-ops on an existing id. A
 * remove after an add is a distinct event and gets its own record.
 */

import { appendClientRecord } from '../ledgerClientStore'
import { clientEntryId } from '../identity'
import { LEDGER_CLASS, LEDGER_STATUS, LEDGER_DIRECTION, PROVENANCE, TS_PROVENANCE } from '../constants'

function capture(account, chainId, kind, idPrefix, info) {
  const hardwareAddress = info.address ? String(info.address).toLowerCase() : null
  if (!account || !hardwareAddress) return
  appendClientRecord(account, {
    entryId: clientEntryId(`${idPrefix}:${Number(chainId)}:${hardwareAddress}`),
    chainId: Number(chainId),
    account: String(account).toLowerCase(),
    class: LEDGER_CLASS.MEMBERSHIP,
    kind,
    direction: LEDGER_DIRECTION.NONE,
    status: LEDGER_STATUS.SETTLED,
    provenance: PROVENANCE.CLIENT,
    timestamp: Date.now(),
    timestampProvenance: TS_PROVENANCE.DEVICE,
    // Metadata ONLY — address, vendor, path. Nothing device-identifying beyond the vendor name.
    refs: { hardwareAddress, vendor: info.vendor, path: info.path },
  })
}

/**
 * Record that a hardware account was saved.
 * @param {string} account - the signed-in account whose ledger owns the record
 * @param {number} chainId - active chain
 * @param {{ address: string, vendor: 'ledger'|'trezor', path: string }} info
 */
export function captureHardwareAccountAdded(account, chainId, info = {}) {
  capture(account, chainId, 'hardware_account_added', 'hardware-added', info)
}

/** Record that a saved hardware account was forgotten (the reference, not the funds). */
export function captureHardwareAccountRemoved(account, chainId, info = {}) {
  capture(account, chainId, 'hardware_account_removed', 'hardware-removed', info)
}
