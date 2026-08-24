/**
 * Mini-app audit source (spec 073, data-model.md §3 · FR-019/FR-020).
 *
 * Every privileged thing a mini-app does happens through the host, so the host
 * — not the app — is what writes the audit trail: a launch, a transaction the
 * app asked for, an integrity refusal, a change to the app's own state, and the
 * app-contextual entries an app chooses to log. None of it requires the app's
 * cooperation, which is the whole point of FR-019: an audit an app can decline
 * to produce is not an audit.
 *
 * WHAT THESE RECORDS ARE, AND WHAT THEY ARE NOT.
 *
 * They are attribution, not valuation. Every entry carries direction `none` and
 * no amount, deliberately: the host knows an app requested a transaction, not
 * what that transaction was worth, and a class that guessed would corrupt the
 * member's totals and their tax report. Where the transaction is also visible
 * on-chain, `mergeEntries` folds this record into the on-chain entry by txHash
 * — the value is then reported once, by the source that can substantiate it,
 * and this record survives as the annotation saying which app asked for it.
 *
 * Because of that fold, the compliance surface (FR-020: filterable by app,
 * account and time) reads {@link listMiniAppEntries}, which goes to the client
 * store directly, rather than the merged ledger view.
 *
 * WHAT NEVER ENTERS AN ENTRY. No package bytes, no key material, no store
 * VALUES, no free-form app payloads beyond a bounded set of short scalars.
 * Every helper below records only the fields it names — a caller that passes
 * extra properties does not get them written — and the ledger travels in the
 * spec-032 encrypted backup, so "small and named" is the whole containment
 * strategy. It is worth being precise about what that does and does not buy:
 * it bounds what an app can put into the member's audit trail; it cannot make
 * an app's own data secret. The reason no key material can appear here is that
 * the host never puts any within a mini-app's reach in the first place (FR-013).
 *
 * IDENTITY. Every entryId is `clientEntryId('miniapp:<appId>:<kind>:<disc>')`,
 * where the discriminator is whatever makes the underlying FACT unique — a
 * package version, a transaction hash, a failing artifact — falling back to the
 * event time for the kinds whose fact is "this happened now". Re-recording the
 * same fact is therefore a no-op in the append-only store (`appendClientRecord`
 * drops a known id), so a remount, a retry, or a restored backup can never
 * inflate the trail.
 */
import { listClientRecords, listAllClientRecords, appendClientRecord } from '../ledgerClientStore'
import { clientEntryId } from '../identity'
import {
  LEDGER_CLASS,
  LEDGER_STATUS,
  LEDGER_STATUSES,
  LEDGER_DIRECTION,
  PROVENANCE,
  TS_PROVENANCE,
} from '../constants'

/**
 * The kinds this source writes (data-model.md §3). Values are part of every
 * entryId and of the encrypted backup, so they are append-only and never
 * renamed.
 */
export const MINIAPP_KIND = Object.freeze({
  /** A verified package was mounted — recorded once per package version. */
  LAUNCHED: 'miniapp_launched',
  /** The app asked the host to submit a transaction (FR-019). */
  TX_SUBMITTED: 'miniapp_tx_submitted',
  /** A package failed manifest/file verification and was discarded (FR-011). */
  INTEGRITY_FAILED: 'miniapp_integrity_failed',
  /** A significant write to the app's namespaced store. */
  STATE_CHANGED: 'miniapp_state_changed',
  /** An app-contextual entry written through `host.audit.log`. */
  APP_LOGGED: 'miniapp_app_logged',
})

/** Statuses that end a transaction's story; anything else leaves it pending. */
const TERMINAL_STATUSES = [LEDGER_STATUS.SETTLED, LEDGER_STATUS.FAILED, LEDGER_STATUS.CANCELLED]

/** Bounds on an app-supplied `audit.log` payload — see the header on containment. */
const MAX_LOG_REFS = 12
const MAX_LOG_STRING = 200
const LOG_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,32}$/

/** EVM chain id, or null. Bitcoin network ids are strings (spec 061). */
function evmChainId(value) {
  const n = Number(value)
  return typeof value !== 'string' && Number.isFinite(n) && n > 0 ? n : null
}

const text = (v, max = 128) => (v != null && v !== '' ? String(v).slice(0, max) : null)

/**
 * The app id as it appears INSIDE an entryId.
 *
 * Ids that reach here have already passed manifest/catalog validation, so this
 * normally changes nothing. It exists because an audit record is the wrong
 * thing to drop over a naming detail: an integrity failure is reported with the
 * id the catalog knew, from a package whose manifest may not have parsed at
 * all, and a raw `:` in that string would fracture the id namespace. Unexpected
 * characters are folded to `_` for the id; `refs.appId` keeps the id verbatim,
 * so nothing is lost.
 */
function appIdSegment(appId) {
  return String(appId).toLowerCase().replace(/[^a-z0-9-]/g, '_').slice(0, 32)
}

/**
 * The stable id of a mini-app audit entry.
 * @param {string} appId
 * @param {string} kind - one of {@link MINIAPP_KIND}
 * @param {string} discriminator - what makes this fact unique
 * @returns {string|null}
 */
export function miniAppEntryId(appId, kind, discriminator) {
  if (!appId || !kind || !discriminator) return null
  return clientEntryId(`miniapp:${appIdSegment(appId)}:${kind}:${discriminator}`)
}

/**
 * Append one audit record. Never throws — an audit write must not break the
 * action it is auditing — and returns the entryId so a caller can link records.
 */
function appendMiniAppRecord(account, chainId, entry) {
  const id = evmChainId(chainId)
  if (!account || !entry?.appId || !entry?.entryId || id == null) return null
  appendClientRecord(account, {
    entryId: entry.entryId,
    chainId: id,
    account: String(account).toLowerCase(),
    class: LEDGER_CLASS.MINIAPP,
    kind: entry.kind,
    // Attribution, not valuation: the host records that something happened,
    // never a value it cannot substantiate (see the header).
    direction: LEDGER_DIRECTION.NONE,
    status: entry.status,
    failureReason: entry.failureReason ?? null,
    txHash: entry.txHash ?? null,
    timestamp: Number(entry.at) > 0 ? Number(entry.at) : Date.now(),
    timestampProvenance: TS_PROVENANCE.DEVICE,
    provenance: PROVENANCE.CLIENT,
    refs: { appId: text(entry.appId, 64), ...entry.refs },
  })
  return entry.entryId
}

/**
 * Record that a verified package was mounted.
 *
 * Keyed by the package it ran, not by the moment: an audit answers "this
 * account ran exactly this package", and a member navigating in and out of a
 * workspace ten times has not done ten auditable things. A new version (or a
 * new manifest hash for the same version) is a new fact and gets its own entry.
 *
 * @param {string} account
 * @param {number} chainId
 * @param {{appId: string, version?: string, manifestHash?: string, cid?: string, at?: number}} info
 * @returns {string|null} entryId
 */
export function captureMiniAppLaunch(account, chainId, info = {}) {
  const id = evmChainId(chainId)
  if (!account || !info.appId || id == null) return null
  const version = text(info.version, 32) || 'unknown'
  const manifestHash = text(info.manifestHash, 66) || 'unknown'
  const entryId = miniAppEntryId(info.appId, MINIAPP_KIND.LAUNCHED, `${id}:${version}:${manifestHash}`)
  if (!entryId) return null
  return appendMiniAppRecord(account, id, {
    entryId,
    appId: info.appId,
    kind: MINIAPP_KIND.LAUNCHED,
    status: LEDGER_STATUS.SETTLED,
    at: info.at,
    // The exact package that ran: content id + the hash the chain approved.
    // Both are public identifiers of bytes, never the bytes themselves.
    refs: { version: text(info.version, 32), manifestHash: text(info.manifestHash, 66), cid: text(info.cid, 128) },
  })
}

/**
 * Record a transaction the mini-app asked the host to submit (FR-019).
 *
 * The host calls this at submit time, when only the hash is known, and again
 * when the transaction resolves. Because the store is append-only, the second
 * call does NOT edit the first: it appends a superseding record
 * (`refs.supersedes`, the `bridgeLedgerSource` pattern) under its own id, so
 * the resolved status is what the ledger shows while the original submission
 * stays readable for audit.
 *
 * @param {string} account
 * @param {number} chainId
 * @param {{appId: string, txHash: string, to?: string, status?: string,
 *          failureReason?: string, description?: string, at?: number}} info
 * @returns {string|null} entryId
 */
export function captureMiniAppTxSubmitted(account, chainId, info = {}) {
  const id = evmChainId(chainId)
  if (!account || !info.appId || !info.txHash || id == null) return null
  const txHash = String(info.txHash).toLowerCase()
  const status = LEDGER_STATUSES.includes(info.status) ? info.status : LEDGER_STATUS.PENDING
  const submittedId = miniAppEntryId(info.appId, MINIAPP_KIND.TX_SUBMITTED, `${id}:${txHash}`)
  if (!submittedId) return null
  const terminal = TERMINAL_STATUSES.includes(status)
  const entryId = terminal
    ? miniAppEntryId(info.appId, MINIAPP_KIND.TX_SUBMITTED, `${id}:${txHash}:${status}`)
    : submittedId
  return appendMiniAppRecord(account, id, {
    entryId,
    appId: info.appId,
    kind: MINIAPP_KIND.TX_SUBMITTED,
    status,
    failureReason: text(info.failureReason, 200),
    txHash: info.txHash,
    at: info.at,
    refs: {
      to: info.to ? String(info.to).toLowerCase() : null,
      description: text(info.description, 200),
      ...(terminal ? { supersedes: submittedId } : {}),
    },
  })
}

/**
 * Record that a package was refused because its bytes did not match what the
 * chain approved (FR-011).
 *
 * Keyed by the failing artifact — package, reason, file — so a member retrying
 * a broken app produces one entry, not one per attempt. Digests are recorded
 * because they are what makes the refusal reviewable; the bytes that produced
 * them are discarded by the loader and never reach the ledger.
 *
 * @param {string} account
 * @param {number} chainId
 * @param {{appId: string, reason?: string, cid?: string, path?: string,
 *          expected?: string, actual?: string, at?: number}} info
 * @returns {string|null} entryId
 */
export function captureMiniAppIntegrityFailure(account, chainId, info = {}) {
  const id = evmChainId(chainId)
  if (!account || !info.appId || id == null) return null
  const reason = text(info.reason, 64) || 'unknown'
  const cid = text(info.cid, 128) || 'unknown'
  // `manifest` is the honest default: a failure with no file path is a failure
  // of the manifest itself, which is the artifact the chain hashes.
  const path = text(info.path, 200) || 'manifest'
  const entryId = miniAppEntryId(info.appId, MINIAPP_KIND.INTEGRITY_FAILED, `${id}:${cid}:${reason}:${path}`)
  if (!entryId) return null
  return appendMiniAppRecord(account, id, {
    entryId,
    appId: info.appId,
    kind: MINIAPP_KIND.INTEGRITY_FAILED,
    status: LEDGER_STATUS.FAILED,
    failureReason: reason,
    at: info.at,
    refs: {
      reason,
      cid: text(info.cid, 128),
      path: text(info.path, 200),
      expectedDigest: text(info.expected, 66),
      actualDigest: text(info.actual, 66),
    },
  })
}

/**
 * Record a significant change to an app's namespaced store.
 *
 * The KEY is recorded, never the value: the value is the app's own data, can be
 * arbitrarily large, and copying it into a ledger that rides the member's
 * backup would turn an audit trail into a second, unbounded copy of app state.
 *
 * "Significant" is the host's judgement (it debounces bursts before calling);
 * this helper records what it is given, keyed by time so two real changes are
 * two entries.
 *
 * @param {string} account
 * @param {number} chainId
 * @param {{appId: string, storeKey: string, at?: number}} info
 * @returns {string|null} entryId
 */
export function captureMiniAppStateChange(account, chainId, info = {}) {
  const id = evmChainId(chainId)
  if (!account || !info.appId || !info.storeKey || id == null) return null
  const storeKey = text(info.storeKey, 64)
  const at = Number(info.at) > 0 ? Number(info.at) : Date.now()
  const entryId = miniAppEntryId(info.appId, MINIAPP_KIND.STATE_CHANGED, `${id}:${storeKey}:${at}`)
  if (!entryId) return null
  return appendMiniAppRecord(account, id, {
    entryId,
    appId: info.appId,
    kind: MINIAPP_KIND.STATE_CHANGED,
    status: LEDGER_STATUS.SETTLED,
    at,
    refs: { storeKey },
  })
}

/**
 * Reduce an app-supplied payload to short scalars.
 *
 * A mini-app writes this through `host.audit.log`, so it is untrusted input
 * heading for the member's durable, backed-up ledger. Only named-shaped keys
 * and primitive values survive, bounded in count and length — there is no shape
 * here big enough to smuggle a package, and nested structures (where an app
 * would otherwise dump a whole object graph) are dropped rather than walked.
 */
function sanitizeLogRefs(refs) {
  const out = {}
  if (!refs || typeof refs !== 'object' || Array.isArray(refs)) return out
  for (const [key, value] of Object.entries(refs)) {
    if (Object.keys(out).length >= MAX_LOG_REFS) break
    if (!LOG_KEY_PATTERN.test(key)) continue
    if (typeof value === 'string') out[key] = value.slice(0, MAX_LOG_STRING)
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'boolean' || value === null) out[key] = value
    // Everything else — objects, arrays, functions, BigInt, undefined — is dropped.
  }
  return out
}

/**
 * Record an app-contextual entry (`host.audit.log`). The app names the event;
 * the ledger kind stays `miniapp_app_logged` so an app can never mint a kind
 * that impersonates a host-generated record.
 *
 * Idempotency: a caller that can name the event (`dedupeKey`) gets a stable id
 * across re-records; otherwise the id is keyed by time, so two real events are
 * two entries and a repeat of the identical millisecond is one.
 *
 * @param {string} account
 * @param {number} chainId
 * @param {{appId: string, kind: string, refs?: object, dedupeKey?: string, at?: number}} info
 * @returns {string|null} entryId
 */
export function captureMiniAppLog(account, chainId, info = {}) {
  const id = evmChainId(chainId)
  if (!account || !info.appId || !info.kind || id == null) return null
  const appKind = text(info.kind, 64)
  const at = Number(info.at) > 0 ? Number(info.at) : Date.now()
  const discriminator = `${id}:${appKind}:${text(info.dedupeKey, 64) || at}`
  const entryId = miniAppEntryId(info.appId, MINIAPP_KIND.APP_LOGGED, discriminator)
  if (!entryId) return null
  return appendMiniAppRecord(account, id, {
    entryId,
    appId: info.appId,
    kind: MINIAPP_KIND.APP_LOGGED,
    status: LEDGER_STATUS.SETTLED,
    at,
    refs: { appKind, ...sanitizeLogRefs(info.refs) },
  })
}

/**
 * Flat view of a mini-app audit record for the compliance surface. Returns null
 * for anything that is not a mini-app entry, so a caller can map over mixed
 * records safely.
 * @param {object} record
 */
export function readMiniAppEntry(record) {
  if (!record || record.class !== LEDGER_CLASS.MINIAPP) return null
  const refs = record.refs || {}
  return {
    entryId: record.entryId,
    chainId: record.chainId ?? null,
    account: record.account ?? null,
    appId: refs.appId || null,
    kind: record.kind,
    appKind: refs.appKind || null,
    status: record.status,
    failureReason: record.failureReason ?? null,
    txHash: record.txHash ?? null,
    timestamp: record.timestamp ?? null,
    refs,
  }
}

/**
 * Every mini-app audit entry for (account, chainId), narrowable by app, kind
 * and time range — the three axes FR-020 requires a compliance review to have.
 * Reads the client store directly (see the header: a transaction record is
 * folded into its on-chain entry in the merged ledger view).
 *
 * @param {string} account
 * @param {number} chainId
 * @param {{appId?: string, kind?: string, fromMs?: number, toMs?: number}} [filter]
 */
export function listMiniAppEntries(account, chainId, filter = {}) {
  const id = evmChainId(chainId)
  if (!account || id == null) return []
  const wantedApp = filter.appId ? String(filter.appId).toLowerCase() : null
  return listClientRecords(account, id)
    .filter((r) => r.class === LEDGER_CLASS.MINIAPP)
    .map(readMiniAppEntry)
    .filter((e) => {
      if (wantedApp && String(e.appId || '').toLowerCase() !== wantedApp) return false
      if (filter.kind && e.kind !== filter.kind) return false
      if (filter.fromMs != null && (e.timestamp == null || e.timestamp < filter.fromMs)) return false
      if (filter.toMs != null && (e.timestamp == null || e.timestamp > filter.toMs)) return false
      return true
    })
}

/**
 * The full append-only history for (account, chainId), superseded records
 * included — what a reviewer needs when the question is what the host recorded,
 * not what the latest state is.
 */
export function listAllMiniAppRecords(account, chainId) {
  const id = evmChainId(chainId)
  if (!account || id == null) return []
  return listAllClientRecords(account, id).filter((r) => r.class === LEDGER_CLASS.MINIAPP)
}

export function createMiniAppLedgerSource(deps = {}) {
  const readClientRecords = deps.listClientRecords || listClientRecords
  return {
    class: LEDGER_CLASS.MINIAPP,
    // Reads the local record store only — it cannot fail because a network
    // is down, so it never testifies that a chain went unread (#1280).
    backing: 'client',
    async list({ account, chainId }) {
      return readClientRecords(account, chainId).filter((r) => r.class === LEDGER_CLASS.MINIAPP)
    },
  }
}
