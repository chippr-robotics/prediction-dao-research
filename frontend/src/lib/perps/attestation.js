/**
 * The perps jurisdiction + leverage-risk attestation (spec 083, T019, FR-015).
 *
 * THIS GATES OPENING A POSITION AND NOTHING ELSE. Nothing exported here may be imported by a
 * close, reduce, cancel or recovery path, and there is deliberately no export that could be read as
 * permission to exit — no `canManage`, no `isBlocked`. SC-004 requires zero code paths that gate an
 * exit on jurisdiction, and the cheapest way to keep that true is to give the exit paths nothing to
 * call. A member who declines every item here can still close every position they hold.
 *
 * Modelled on `utils/entryGateAck.js` (spec 007 US4): a stored record with a read / write /
 * subscribe trio, device-scoped, storage-failure tolerant. Two things differ, both deliberate:
 *
 *   1. **It is versioned against the TEXT.** `PERPS_ATTESTATION_VERSION` (config/perps.js) is
 *      bumped whenever the wording below changes materially, and a record at an older version does
 *      not satisfy the current one. Crediting a member with agreeing to words they never saw is
 *      the failure this prevents.
 *   2. **The items are discrete and NONE are pre-ticked.** `initialAttestationState()` returns every
 *      item false. A pre-ticked acknowledgement is not an acknowledgement, and the shape of the
 *      default is what makes that testable rather than a property of one component.
 *
 * Why an attestation at all, rather than a geoblock: no geoblock endpoint exists for these venues,
 * and IP geolocation would be the gateway's first region logic — against the no-backend constraint
 * (research D9). FairWins does not, and must not, help anyone around a venue's own restriction
 * (FR-016), which is why circumvention is one of the items.
 *
 * TOTALITY: every export here can run during render or inside an event handler in a browser with
 * storage disabled. Nothing throws — a storage failure degrades to a session-only record.
 */
import { PERPS_ATTESTATION_VERSION } from '../../config/perps'

/**
 * One key, with the version INSIDE the record rather than in the key name. A versioned key would
 * leave every superseded acknowledgement lying in storage forever, and would make "has this member
 * ever attested?" a scan instead of a read.
 */
export const PERPS_ATTESTATION_KEY = 'fairwins.perps.attestation'

const ATTESTATION_EVENT = 'fairwins:perps-attestation'

/**
 * What the member is acknowledging, as separate statements they tick individually.
 *
 * The text lives here rather than in `perpsCopy.js` because it IS the versioned artifact: the
 * record stores which of these ids were ticked, and changing a sentence without bumping
 * `PERPS_ATTESTATION_VERSION` would leave stored records pointing at words that no longer exist.
 */
export const PERPS_ATTESTATION_ITEMS = Object.freeze([
  Object.freeze({
    id: 'jurisdiction',
    label:
      'I am allowed to trade perpetual futures where I live. I am not in a country or region ' +
      'where they are prohibited, and I am not on any sanctions list.',
  }),
  Object.freeze({
    id: 'leverage-risk',
    label:
      'I understand that leverage can lose my entire stake. A normal price move can liquidate the ' +
      'position, and what I put in is then gone.',
  }),
  Object.freeze({
    id: 'no-circumvention',
    label:
      'I am not using a VPN, proxy, or any other means to get around a restriction placed on me ' +
      'by a trading venue or by FairWins.',
  }),
  Object.freeze({
    id: 'venue-terms',
    label:
      'I am trading on a third-party venue under that venue’s own terms. FairWins does not hold ' +
      'my position, control the venue, or act as my counterparty.',
  }),
])

export const PERPS_ATTESTATION_ITEM_IDS = Object.freeze(PERPS_ATTESTATION_ITEMS.map((i) => i.id))

/** Every item false. The default IS the requirement — nothing arrives pre-ticked. */
export function initialAttestationState() {
  return PERPS_ATTESTATION_ITEM_IDS.reduce((acc, id) => {
    acc[id] = false
    return acc
  }, {})
}

/**
 * Session fallback for a browser that refuses storage (private mode, blocked cookies). The member
 * genuinely acknowledged, so this visit proceeds; nothing was persisted, so the next visit asks
 * again. Both halves are honest — the alternative is a member who can never open a position, or a
 * record we claim to have kept and did not.
 */
let sessionRecord = null

/** Accepts an array of ticked ids, a Set, or an `{ id: boolean }` map. Junk yields an empty list. */
function normalizeItems(items) {
  if (Array.isArray(items)) return items.filter((id) => typeof id === 'string')
  if (items instanceof Set) return [...items].filter((id) => typeof id === 'string')
  if (items && typeof items === 'object') {
    return Object.keys(items).filter((id) => items[id] === true)
  }
  return []
}

/** The current required items that a tick-set does NOT cover. Empty ⇒ complete. */
export function missingAttestationItems(items) {
  const ticked = new Set(normalizeItems(items))
  return PERPS_ATTESTATION_ITEM_IDS.filter((id) => !ticked.has(id))
}

/** Whether a tick-set covers every required item — what a submit button should be enabled on. */
export function isAttestationComplete(items) {
  return missingAttestationItems(items).length === 0
}

/** The stored record, or null when this browser has never attested. Never throws. */
export function readAttestation() {
  let raw = null
  try {
    raw = localStorage.getItem(PERPS_ATTESTATION_KEY)
  } catch {
    return sessionRecord
  }
  if (!raw) return sessionRecord
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : sessionRecord
  } catch {
    // Corrupt record: treat as never attested rather than as satisfying anything.
    return sessionRecord
  }
}

/**
 * Whether the stored record satisfies `version`.
 *
 * Two independent checks, because either alone has a hole:
 *   - the record's version must be at least `version` — an OLDER record was superseded and the
 *     member must see the new words. A record at a NEWER version satisfies an older requirement:
 *     they acknowledged text at least as current (a build rollback, not a bypass).
 *   - the record must cover every item this build requires, so an item added without a version
 *     bump still cannot be credited to someone who never saw it.
 */
export function hasAttested(version = PERPS_ATTESTATION_VERSION) {
  const record = readAttestation()
  if (!record) return false
  const stored = Number(record.version)
  const required = Number(version)
  if (!Number.isFinite(stored) || !Number.isFinite(required)) return false
  if (stored < required) return false
  return isAttestationComplete(record.items)
}

/**
 * The gate's full answer, for a UI that has to explain itself rather than just disable a button.
 * `reason` is null when attested.
 */
export function attestationState(version = PERPS_ATTESTATION_VERSION) {
  const record = readAttestation()
  const attested = hasAttested(version)
  const stored = record ? Number(record.version) : null
  return {
    attested,
    record,
    version: Number(version),
    superseded: Boolean(record) && !attested && Number.isFinite(stored) && stored < Number(version),
    reason: attested ? null : record ? 'Please confirm these again — the terms have been updated.' : null,
  }
}

/**
 * Record the member's acknowledgement.
 *
 * Refuses (returns null) unless every required item is ticked — a partial acknowledgement is not
 * one, and storing it would let `hasAttested` pass on a half-answer later. On success the record is
 * persisted where possible, kept in memory regardless, and broadcast so an open sheet re-renders in
 * the same visit.
 *
 * @returns {{version:number, items:string[], at:string}|null}
 */
export function recordAttestation(items, version = PERPS_ATTESTATION_VERSION) {
  const ticked = normalizeItems(items)
  if (!isAttestationComplete(ticked)) return null

  const record = {
    version: Number(version),
    // Store the canonical id order, not the order they were clicked in.
    items: PERPS_ATTESTATION_ITEM_IDS.filter((id) => ticked.includes(id)),
    at: new Date().toISOString(),
  }

  sessionRecord = record
  try {
    localStorage.setItem(PERPS_ATTESTATION_KEY, JSON.stringify(record))
  } catch {
    /* storage disabled — the session record above still satisfies this visit */
  }
  notify(record)
  return record
}

/** Forget the acknowledgement (member action, or a test). The member is asked again next time. */
export function clearAttestation() {
  sessionRecord = null
  try {
    localStorage.removeItem(PERPS_ATTESTATION_KEY)
  } catch {
    /* storage disabled — the session record is already gone */
  }
  notify(null)
  return null
}

/** Subscribe to attestation changes in this tab. Returns an unsubscribe function. */
export function subscribeAttestation(listener) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => listener(readAttestation())
  window.addEventListener(ATTESTATION_EVENT, handler)
  return () => window.removeEventListener(ATTESTATION_EVENT, handler)
}

function notify(record) {
  try {
    window.dispatchEvent(new CustomEvent(ATTESTATION_EVENT, { detail: record }))
  } catch {
    /* no window (SSR/tests) — subscribers simply never fire */
  }
}
