// Spec 032 — the registry of user-authored objects included in a backup. Each declares how to load/apply it,
// whether it is network-scoped (its elements carry chainId), and how it merges. Adding a future object
// (tokens, DAOs) = one entry here with networkScoped set truthfully — no backup/restore redesign (FR-016).

import { loadAddressBook, saveAddressBook, mergeBook } from '../addressBook/addressBookStore'
import { loadWatchlist, saveWatchlist, mergeWatchlists } from '../tokens/tokenWatchlistStore'
import { getUserPreference, saveUserPreference } from '../../utils/userStorage'

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
    key: 'tokens',
    label: 'Token watchlist',
    networkScoped: true, // every WatchlistEntry carries chainId; identity is (address, chainId) — Spec 034
    load: (account) => loadWatchlist(account),
    // mode: 'replace' overwrites; 'merge' is an idempotent union by (address, chainId).
    // The watchlist is a reference set with no editable per-entry field, so there are never conflicts.
    apply: (account, value, mode) => {
      if (mode === 'replace') {
        saveWatchlist(account, value)
        return { conflicts: [] }
      }
      const { value: merged } = mergeWatchlists(loadWatchlist(account), value)
      saveWatchlist(account, merged)
      return { conflicts: [] }
    },
    merge: (current, incoming) => mergeWatchlists(current, incoming),
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
]

export default syncedObjects
