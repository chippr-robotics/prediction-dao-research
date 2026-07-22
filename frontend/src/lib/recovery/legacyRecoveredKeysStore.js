// Spec 062 — the backup-synced store of a member's recovered legacy accounts. It holds ONLY the
// passphrase-encrypted vault entries (ciphertext blobs), never plaintext key material, so it is safe
// to place in the app-wide encrypted backup (spec 032). Per-account, keyed by lowercased address so a
// given legacy account is stored once. This module owns the storage key + value shape; the imperative
// CRUD facade (`legacyKeyVault` in legacyKeys.js) reads/writes through the same key, so there is a
// single source of truth.

import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

// Per-account userStorage key (resolves to fw_user_<owner>_legacy_recovered_keys).
export const LEGACY_KEYS_STORAGE_KEY = 'legacy_recovered_keys'

const isEntry = (e) => e && typeof e === 'object' && typeof e.address === 'string' && typeof e.ct === 'string'
const lower = (a) => String(a).toLowerCase()

/**
 * Load the recovered-keys map for an account: { [lowerAddress]: VaultEntry }.
 * Tolerates a legacy/global array shape by ignoring anything that isn't a well-formed entry map.
 */
export function loadLegacyRecoveredKeys(account) {
  const raw = getUserPreference(account, LEGACY_KEYS_STORAGE_KEY, {}, true)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    if (isEntry(v)) out[lower(k)] = v
  }
  return out
}

/** Persist the full map (replaces). */
export function saveLegacyRecoveredKeys(account, map) {
  const clean = {}
  for (const [k, v] of Object.entries(map || {})) {
    if (isEntry(v)) clean[lower(k)] = v
  }
  saveUserPreference(account, LEGACY_KEYS_STORAGE_KEY, clean, true)
  return clean
}

/**
 * Merge two recovered-keys maps (backup restore "merge" mode). Union by lowercased address; on the
 * same address the entry with the newer `importedAt` wins. `conflicts` lists addresses present on both
 * sides whose ciphertext differs (informational — the newer import is kept). Pure; touches no storage.
 * @returns {{ value: Record<string, object>, conflicts: Array<{ address: string }> }}
 */
export function mergeLegacyRecoveredKeys(current, incoming) {
  const out = {}
  const conflicts = []
  for (const [k, v] of Object.entries(current || {})) {
    if (isEntry(v)) out[lower(k)] = v
  }
  for (const [k, v] of Object.entries(incoming || {})) {
    if (!isEntry(v)) continue
    const key = lower(k)
    const existing = out[key]
    if (!existing) {
      out[key] = v
      continue
    }
    if (existing.ct !== v.ct) conflicts.push({ address: key })
    out[key] = (v.importedAt || 0) >= (existing.importedAt || 0) ? v : existing
  }
  return { value: out, conflicts }
}
