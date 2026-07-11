// Spec 032 — the registry of user-authored objects included in a backup. Each declares how to load/apply it,
// whether it is network-scoped (its elements carry chainId), and how it merges. Adding a future object
// (tokens, DAOs) = one entry here with networkScoped set truthfully — no backup/restore redesign (FR-016).

import { loadAddressBook, saveAddressBook, mergeBook } from '../addressBook/addressBookStore'
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'
import {
  loadVaultReferences,
  saveVaultReferences,
  mergeVaultReferences,
} from '../custody/vaultReferences'
import {
  listClientRecordsAllChains,
  mergeClientRecordsAllChains,
} from '../../data/ledger/ledgerClientStore'

const PREF_KEYS = {
  recentSearches: 'recent_searches',
  favoriteMarkets: 'favorite_markets',
  defaultSlippage: 'default_slippage',
  polymarketCategories: 'polymarket_categories',
}
const PREF_DEFAULTS = { recentSearches: [], favoriteMarkets: [], defaultSlippage: 0.5, polymarketCategories: [] }

/** Ordered list of synced objects. */
export const syncedObjects = [
  {
    key: 'addressBook',
    label: 'Address book',
    networkScoped: true, // every SavedAddress carries chainId; identity is (address, chainId)
    load: (account) => loadAddressBook(account),
    // mode: 'replace' overwrites; 'merge' is additive by (address, chainId) and returns notes/nickname conflicts.
    apply: (account, value, mode) => {
      if (mode === 'replace') {
        saveAddressBook(account, value)
        return { conflicts: [] }
      }
      const { book, conflicts } = mergeBook(loadAddressBook(account), value)
      saveAddressBook(account, book)
      return { conflicts }
    },
    merge: (current, incoming) => mergeBook(current, incoming),
  },
  {
    key: 'preferences',
    label: 'Preferences',
    networkScoped: false, // global, no chainId
    load: (account) => {
      const out = {}
      for (const [field, storageKey] of Object.entries(PREF_KEYS)) {
        out[field] = getUserPreference(account, storageKey, PREF_DEFAULTS[field], true)
      }
      return out
    },
    // preferences are scalars/lists → last-writer-wins (the incoming value replaces) for both modes.
    apply: (account, value, _mode) => {
      for (const [field, storageKey] of Object.entries(PREF_KEYS)) {
        if (value && value[field] !== undefined) saveUserPreference(account, storageKey, value[field], true)
      }
      return { conflicts: [] }
    },
    merge: (_current, incoming) => ({ value: incoming, conflicts: [] }),
  },
  {
    // Spec 043 — custody vault references + labels. Network-scoped: identity is (chainId, address).
    key: 'vaultReferences',
    label: 'Vault references',
    networkScoped: true,
    load: (account) => loadVaultReferences(account),
    apply: (account, value, mode) => {
      if (mode === 'replace') {
        saveVaultReferences(account, value)
        return { conflicts: [] }
      }
      const { value: merged, conflicts } = mergeVaultReferences(loadVaultReferences(account), value)
      saveVaultReferences(account, merged)
      return { conflicts }
    },
    merge: (current, incoming) => mergeVaultReferences(current, incoming),
  },
  {
    // Spec 051 — client-only activity ledger records (failed gasless ops,
    // transfer history, earn action captures): the part of the audit trail
    // that cannot be re-derived from public chain data (FR-010). On-chain
    // entries are deliberately NOT in the bundle — they re-derive (FR-009).
    key: 'activityLedger',
    label: 'Activity history',
    networkScoped: true, // every record carries chainId
    load: (account) => listClientRecordsAllChains(account),
    // Records are append-only value objects, so BOTH modes union by entryId:
    // a "replace" that deleted history would violate the append-only audit
    // guarantee (FR-008). Identical ids are identical records — conflict-free.
    apply: (account, value, _mode) => {
      mergeClientRecordsAllChains(account, value)
      return { conflicts: [] }
    },
    merge: (current, incoming) => {
      const have = new Set((current || []).map((r) => r.entryId))
      const fresh = (incoming || []).filter((r) => r?.entryId && !have.has(r.entryId))
      return { value: [...(current || []), ...fresh], conflicts: [] }
    },
  },
]

export default syncedObjects
