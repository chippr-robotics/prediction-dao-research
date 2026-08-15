// Spec 085 — imperative CRUD facade over the hardware-accounts store, one instance per owning
// member account (mirrors `legacyKeyVault`, spec 062). All reads/writes go through the store
// module's single storage key. Saving an address that is already known updates its label instead of
// duplicating it (FR-011); comparison is case-insensitive throughout.

import {
  loadHardwareAccounts,
  saveHardwareAccounts,
  HARDWARE_VENDORS,
} from './hardwareAccountsStore'

const lower = (a) => String(a).toLowerCase()

/**
 * @param {string} owner the connected member account the entries belong to
 * @returns {{
 *   list: () => Array<object>,
 *   get: (address: string) => object|null,
 *   has: (address: string) => boolean,
 *   add: (entry: { address: string, vendor: 'ledger'|'trezor', path: string, label?: string }) =>
 *     { entry: object, updated: boolean },
 *   updateLabel: (address: string, label: string) => object|null,
 *   remove: (address: string) => object|null,
 * }}
 */
export function hardwareWalletVault(owner) {
  if (!owner) throw new Error('hardwareWalletVault requires the owning account address')

  const read = () => loadHardwareAccounts(owner)

  return {
    /** Entries sorted oldest-first, so the list order is stable as accounts are added. */
    list() {
      return Object.values(read()).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
    },

    get(address) {
      return read()[lower(address)] || null
    },

    has(address) {
      return Boolean(read()[lower(address)])
    },

    /**
     * Save a hardware account. If the address is already saved, the existing entry keeps its
     * `addedAt` and vendor/path and only the label is refreshed — re-adding is not an error and
     * never duplicates (FR-011).
     */
    add({ address, vendor, path, label = '' }) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(String(address || ''))) {
        throw new Error('A hardware account needs a valid EVM address')
      }
      if (!HARDWARE_VENDORS.includes(vendor)) throw new Error(`Unknown hardware vendor: ${vendor}`)
      if (!path || typeof path !== 'string') throw new Error('A hardware account needs its derivation path')

      const map = read()
      const key = lower(address)
      const existing = map[key]
      if (existing) {
        const entry = { ...existing, label: label || existing.label }
        map[key] = entry
        saveHardwareAccounts(owner, map)
        return { entry, updated: true }
      }
      const entry = { address, vendor, path, label: label || '', addedAt: Date.now() }
      map[key] = entry
      saveHardwareAccounts(owner, map)
      return { entry, updated: false }
    },

    updateLabel(address, label) {
      const map = read()
      const key = lower(address)
      if (!map[key]) return null
      map[key] = { ...map[key], label: String(label || '') }
      saveHardwareAccounts(owner, map)
      return map[key]
    },

    /** Forget the saved reference. The device still controls the funds — this only removes the entry. */
    remove(address) {
      const map = read()
      const key = lower(address)
      const entry = map[key]
      if (!entry) return null
      delete map[key]
      saveHardwareAccounts(owner, map)
      return entry
    },
  }
}
