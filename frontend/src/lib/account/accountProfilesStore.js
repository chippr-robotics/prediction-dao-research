// Spec 086 — per-account card cosmetics: a member-set profile picture (small data URL), a color
// shade, and a background pattern, keyed by lowercased account address.
//
// DEVICE-SCOPED, NOT SYNCED, and deliberately absent from `lib/backup/syncedObjects.js` — the
// same call navPreferences (spec 081), miniapp favorites (073) and network endpoints (069) made,
// and for the same load-bearing reasons:
//   - The header avatar must render on FIRST PAINT, before any wallet resolves, so the store
//     cannot be scoped under a connected owner.
//   - How this device dresses a card is presentation, not account data; and the image blobs
//     would bloat the encrypted backup for pure cosmetics. A test asserts the absence.
// Cosmetics carry NO authority — nothing may read them for any decision beyond rendering.

const STORAGE_KEY = 'fw_account_profiles_v1'

/** Curated tint shades — ids only; the CSS decides what each means per theme (FR-007). */
export const CARD_TINTS = Object.freeze(['none', 'mint', 'sky', 'violet', 'amber', 'rose', 'slate'])

/** Curated background patterns — ids only, rendered by AccountCard.css (FR-007). */
export const CARD_PATTERNS = Object.freeze(['none', 'waves', 'dots', 'grid', 'rings'])

// ~96KB ceiling on the stored data URL: a 128px avatar re-encoded on-device never comes close,
// and the cap keeps a hostile/corrupt write from bloating localStorage.
export const MAX_IMAGE_DATA_URL_LENGTH = 96 * 1024

const lower = (a) => String(a || '').toLowerCase()

const validImage = (v) =>
  typeof v === 'string' && v.startsWith('data:image/') && v.length <= MAX_IMAGE_DATA_URL_LENGTH

function sanitizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  if (validImage(raw.image)) out.image = raw.image
  if (CARD_TINTS.includes(raw.tint) && raw.tint !== 'none') out.tint = raw.tint
  if (CARD_PATTERNS.includes(raw.pattern) && raw.pattern !== 'none') out.pattern = raw.pattern
  if (Object.keys(out).length === 0) return null
  out.updatedAt = Number(raw.updatedAt) || Date.now()
  return out
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out = {}
    for (const [k, v] of Object.entries(parsed)) {
      const clean = sanitizeProfile(v)
      if (clean) out[lower(k)] = clean
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* storage full/denied — cosmetics fail soft; the next read re-reflects reality */
  }
}

// In-memory snapshot + revision + subscribers, the shared device-store shape
// (endpointStore/navPreferences/favorites).
let snapshot = null
let revision = 0
const listeners = new Set()

function current() {
  if (snapshot === null) snapshot = readAll()
  return snapshot
}

function emit() {
  revision += 1
  for (const l of [...listeners]) {
    try {
      l()
    } catch {
      /* one bad listener must not block the rest */
    }
  }
}

export function getAccountProfilesRevision() {
  return revision
}

/** useSyncExternalStore-shaped subscription. */
export function subscribeAccountProfiles(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The profile for an address: `{ image?, tint?, pattern?, updatedAt }` or null when unset. */
export function getAccountProfile(address) {
  if (!address) return null
  return current()[lower(address)] ?? null
}

/**
 * Merge a patch into an address's profile. Passing `null`/`'none'` for a field clears it; a
 * profile with nothing left is removed entirely (absence is the default, FR-010).
 */
export function setAccountProfile(address, patch = {}) {
  if (!address) return null
  const key = lower(address)
  const map = { ...current() }
  const prev = map[key] || {}
  const merged = { ...prev, ...patch, updatedAt: Date.now() }
  if (patch.image === null) delete merged.image
  if (patch.image !== undefined && patch.image !== null && !validImage(patch.image)) {
    throw new Error('Profile pictures must be small on-device images.')
  }
  const clean = sanitizeProfile(merged)
  if (clean) map[key] = clean
  else delete map[key]
  snapshot = map
  writeAll(map)
  emit()
  return clean
}

/** Forget every cosmetic for an address. */
export function clearAccountProfile(address) {
  if (!address) return
  const key = lower(address)
  const map = { ...current() }
  if (!(key in map)) return
  delete map[key]
  snapshot = map
  writeAll(map)
  emit()
}

export const ACCOUNT_PROFILES_STORAGE_KEY = STORAGE_KEY
