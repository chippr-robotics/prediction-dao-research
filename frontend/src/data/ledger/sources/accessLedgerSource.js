/**
 * Spec 095 — programmatic-access audit records.
 *
 * Two things a member must be able to look back on: which API keys this device minted for them, and
 * when the assistant was switched on or off. Both are decisions about what can reach their account
 * and what leaves their device, so neither may exist only as a toast — a toast is single-slot,
 * auto-dismissing and lossy. These append one client-ledger record each, which rides the encrypted
 * spec-032 backup like every other `cl:` entry.
 *
 * METADATA ONLY, ALWAYS. A record carries the key id, the label the member typed, and the scope
 * list. It never carries a token, a signature, or one character of a conversation — and it cannot,
 * because `refs` is assembled here field by field rather than spread from a caller's object.
 *
 * ENTRY IDS ARE STABLE, so re-running a capture is a no-op (`appendClientRecord` ignores an id it
 * already holds and the activity-ledger backup domain unions by entryId):
 *   · key events are keyed by (event, chain, keyId) — a key is minted once and revoked once.
 *   · the assistant toggle is keyed by (state, chain, UTC day). A switch has no natural identity
 *     and a per-second id would let a member who flips it repeatedly write an unbounded number of
 *     records into their own backup. One record per state per day says what happened without
 *     turning a preference into a log.
 *
 * The ledger CLASS is `membership` — the same call `legacyRecoverySource` and `hardwareWalletSource`
 * made for account-level events that move no value. A new class would have to be threaded through
 * normalization, reports and every filter to say nothing new.
 */

import { appendClientRecord } from '../ledgerClientStore'
import { clientEntryId } from '../identity'
import { LEDGER_CLASS, LEDGER_STATUS, LEDGER_DIRECTION, PROVENANCE, TS_PROVENANCE } from '../constants'

/** Feed domain these events belong to (see data/notifications/domains.js). */
export const ACCESS_DOMAIN = 'access'

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function capture(account, chainId, { entryId, kind, refs }) {
  if (!account) return
  appendClientRecord(account, {
    entryId: clientEntryId(entryId),
    chainId: Number(chainId),
    account: String(account).toLowerCase(),
    class: LEDGER_CLASS.MEMBERSHIP,
    kind,
    direction: LEDGER_DIRECTION.NONE,
    status: LEDGER_STATUS.SETTLED,
    provenance: PROVENANCE.CLIENT,
    timestamp: Date.now(),
    timestampProvenance: TS_PROVENANCE.DEVICE,
    refs,
  })
}

/**
 * Record that an API key was minted.
 *
 * @param {string} account - the signed-in account whose ledger owns the record
 * @param {number} chainId - active chain
 * @param {{ keyId: string, label?: string, scopes?: string[], expiresAt?: number }} info
 */
export function captureApiKeyCreated(account, chainId, info = {}) {
  const keyId = info.keyId ? String(info.keyId) : null
  if (!keyId) return
  capture(account, chainId, {
    entryId: `api-key-created:${Number(chainId)}:${keyId}`,
    kind: 'api_key_created',
    // Metadata ONLY — the token itself is shown once and never written anywhere.
    refs: {
      keyId,
      label: typeof info.label === 'string' ? info.label.slice(0, 120) : '',
      scopes: Array.isArray(info.scopes) ? info.scopes.map(String) : [],
      expiresAt: Number(info.expiresAt) || null,
    },
  })
}

/**
 * Record that an API key was revoked.
 *
 * @param {{ keyId: string, label?: string, durable?: boolean }} info - `durable` is the gateway's own
 *   answer about whether its revocation record survives a restart; it is recorded because it is the
 *   difference between "withdrawn" and "withdrawn on the process that is running right now".
 */
export function captureApiKeyRevoked(account, chainId, info = {}) {
  const keyId = info.keyId ? String(info.keyId) : null
  if (!keyId) return
  capture(account, chainId, {
    entryId: `api-key-revoked:${Number(chainId)}:${keyId}`,
    kind: 'api_key_revoked',
    refs: {
      keyId,
      label: typeof info.label === 'string' ? info.label.slice(0, 120) : '',
      durable: info.durable === true,
    },
  })
}

/**
 * Record that the assistant was switched on or off.
 *
 * @param {boolean} enabled
 */
export function captureAssistantPreference(account, chainId, enabled) {
  const state = enabled === true ? 'enabled' : 'disabled'
  capture(account, chainId, {
    entryId: `assistant-${state}:${Number(chainId)}:${utcDay(Date.now())}`,
    kind: enabled === true ? 'assistant_enabled' : 'assistant_disabled',
    refs: { assistant: state },
  })
}
