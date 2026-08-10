/**
 * Spec 062 — legacy-account-recovery audit record.
 *
 * A recovery must be auditable (there is a durable record that a legacy account
 * was brought in) WITHOUT ever leaking key material. This helper appends one
 * client-ledger record carrying only the recovered address, the time, and the
 * recovery type — never the private key or mnemonic. It rides the encrypted
 * spec-032 backup like any other client-ledger entry (the ledger is the
 * `activityLedger` synced object).
 *
 * The entryId is STABLE (derived from chain + address), so re-recovering the
 * same account is idempotent: `appendClientRecord` no-ops on an existing id and
 * the activity-ledger backup domain unions by entryId — no misleading duplicate.
 */

import { appendClientRecord } from '../ledgerClientStore'
import { clientEntryId } from '../identity'
import { LEDGER_CLASS, LEDGER_STATUS, LEDGER_DIRECTION, PROVENANCE, TS_PROVENANCE } from '../constants'

/**
 * Record that a legacy account was recovered. Metadata only — NEVER a secret.
 *
 * @param {string} account - the signed-in account whose ledger owns the record
 * @param {number} chainId - active chain
 * @param {{ recoveredAddress: string, source: 'privateKey'|'mnemonic' }} info
 */
export function captureLegacyRecovery(account, chainId, info = {}) {
  const recoveredAddress = info.recoveredAddress ? String(info.recoveredAddress).toLowerCase() : null
  if (!account || !recoveredAddress) return
  const source = info.source === 'mnemonic' ? 'mnemonic' : 'privateKey'
  appendClientRecord(account, {
    entryId: clientEntryId(`legacy-recovered:${Number(chainId)}:${recoveredAddress}`),
    chainId: Number(chainId),
    account: String(account).toLowerCase(),
    class: LEDGER_CLASS.MEMBERSHIP,
    kind: 'legacy_account_recovered',
    direction: LEDGER_DIRECTION.NONE,
    status: LEDGER_STATUS.SETTLED,
    provenance: PROVENANCE.CLIENT,
    timestamp: Date.now(),
    timestampProvenance: TS_PROVENANCE.DEVICE,
    // Metadata ONLY — address + type. No key material ever enters the ledger.
    refs: { recoveredAddress, source },
  })
}
