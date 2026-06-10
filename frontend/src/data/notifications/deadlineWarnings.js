/**
 * Pure deadline-warning derivation for wager notifications.
 *
 * Scans the user's normalized wagers (toWagerShape output from
 * utils/blockchainService.js) for deadlines approaching within 24 h and emits
 * 'warn-acceptance' / 'warn-resolution' ActivityEntry objects per the
 * deadline-warnings section of
 * specs/012-wager-notifications/contracts/notification-types.md.
 *
 * Windows:
 *   acceptance — canonical state `pending` and 0 < acceptanceDeadline − now ≤ 24h
 *   resolution — canonical state `resolvable`, the viewer may resolve
 *                (canResolve), and 0 < resolveDeadlineTime − now ≤ 24h
 *
 * Anti-spam (FR-008): at most one warning per wager per window per UTC day.
 * `warnRecords[wagerId][window]` holds the ms timestamp of the last warning;
 * a wager is skipped when that timestamp falls in the same UTC day bucket as
 * `nowMs`. The day bucket (UTC ISO date, e.g. "2026-06-10") is also embedded
 * in the entry id, so the store's id-based dedup enforces the same rule.
 *
 * Passed deadlines never warn — the `expired` / `refundable` state transition
 * carries the after-the-fact message (diff engine's job, not ours).
 *
 * Pure: no I/O, no Date.now(), no randomness; time arrives as `nowMs`.
 * Inputs are never mutated — `nextWarnRecords` is the input object itself
 * when nothing was emitted (callers can skip persisting), otherwise a copy
 * updated only for the warnings actually emitted.
 */

import { deriveState, canResolve } from './derivedState'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function lower(s) {
  return s ? String(s).toLowerCase() : ''
}

/** Case-insensitive address equality; false when either side is empty. */
function sameAddress(a, b) {
  const la = lower(a)
  return la !== '' && la === lower(b)
}

/** UTC day bucket for a ms timestamp, e.g. 1781474400000 → "2026-06-10". */
function toUtcDayBucket(ms) {
  return new Date(Number(ms)).toISOString().slice(0, 10)
}

/**
 * Tiny human-readable countdown: 'in 23h' at hour granularity, 'in 45m'
 * below one hour (clamped to 'in 1m' so an imminent deadline never reads
 * as "in 0m").
 */
function formatRemaining(remainingMs) {
  if (remainingMs >= HOUR_MS) return `in ${Math.floor(remainingMs / HOUR_MS)}h`
  return `in ${Math.max(1, Math.floor(remainingMs / MINUTE_MS))}m`
}

/** Display description with the catalog's "Wager #id" fallback. */
function descOf(wager) {
  return wager.description || `Wager #${wager.id}`
}

/**
 * The single warning this wager owes `account` right now, or null.
 * The two windows are mutually exclusive because they hang off disjoint
 * canonical states (`pending` vs `resolvable`).
 */
function pendingWarning(wager, account, now) {
  const state = deriveState(wager, account, now)

  if (state === 'pending') {
    const remaining = Number(wager.acceptanceDeadline) - now
    if (remaining <= 0 || remaining > DAY_MS) return null
    const time = formatRemaining(remaining)
    if (sameAddress(wager.creator, account)) {
      return {
        window: 'acceptance',
        type: 'warn-acceptance',
        actionable: false,
        message: `'${descOf(wager)}' expires ${time} if not accepted`,
      }
    }
    if (sameAddress(wager.opponent, account)) {
      return {
        window: 'acceptance',
        type: 'warn-acceptance',
        actionable: true,
        message: `'${descOf(wager)}' expires ${time} — accept before it's gone`,
      }
    }
    return null
  }

  if (state === 'resolvable') {
    if (!canResolve(wager, account)) return null
    const remaining = Number(wager.resolveDeadlineTime) - now
    if (remaining <= 0 || remaining > DAY_MS) return null
    return {
      window: 'resolution',
      type: 'warn-resolution',
      actionable: true,
      message: `Resolution window for '${descOf(wager)}' closes ${formatRemaining(remaining)}`,
    }
  }

  return null
}

/**
 * Compute deadline-warning entries for the viewer's wagers.
 *
 * @param {object} params
 * @param {object[]} params.wagers - Normalized wagers (toWagerShape output)
 * @param {Object<string, Object<string, number>>} params.warnRecords -
 *   `deadlineWarnings` map from the ActivityStore:
 *   `{ [wagerId]: { acceptance?: lastWarnedAtMs, resolution?: lastWarnedAtMs } }`
 * @param {string|null} params.account - Viewer's wallet address (any casing)
 * @param {number} params.nowMs - Current time in ms (caller-supplied clock)
 * @returns {{ entries: object[], nextWarnRecords: object }} New ActivityEntry
 *   objects (severity 'warning', read false, createdAt nowMs) plus the warn
 *   records to persist — the input object untouched when nothing was emitted.
 */
export function computeDeadlineWarnings({ wagers, warnRecords, account, nowMs }) {
  const records = warnRecords || {}
  const list = Array.isArray(wagers) ? wagers : []
  if (!account || list.length === 0) return { entries: [], nextWarnRecords: records }

  const now = Number(nowMs)
  const dayBucket = toUtcDayBucket(now)
  const entries = []
  let nextWarnRecords = records

  for (const wager of list) {
    const warning = pendingWarning(wager, account, now)
    if (!warning) continue

    const lastWarnedAt = records[wager.id]?.[warning.window]
    if (lastWarnedAt != null && toUtcDayBucket(lastWarnedAt) === dayBucket) continue

    entries.push({
      id: `${wager.id}:warn:${warning.window}:${dayBucket}`,
      type: warning.type,
      wagerId: wager.id,
      message: warning.message,
      severity: 'warning',
      actionable: warning.actionable,
      createdAt: now,
      read: false,
    })

    // Copy-on-first-write keeps the no-emission path reference-stable and
    // the input object unmutated (nested record replaced wholesale).
    if (nextWarnRecords === records) nextWarnRecords = { ...records }
    nextWarnRecords[wager.id] = { ...nextWarnRecords[wager.id], [warning.window]: now }
  }

  return { entries, nextWarnRecords }
}
