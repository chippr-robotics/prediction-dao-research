# Contract: Watchlist Store & Hook

**Type**: Frontend module interfaces (JavaScript). These are the stable surfaces other code
depends on; they mirror the address-book precedent (`lib/addressBook/addressBookStore.js`,
`hooks/useAddressBook.js`).

---

## `frontend/src/lib/tokens/tokenWatchlistStore.js` (pure, no React)

```text
createEmptyWatchlist(): Watchlist
  → { schemaVersion: 1, entries: [], updatedAt }

loadWatchlist(account: string): Watchlist
  // reads getUserPreference(account, 'watchlist', createEmptyWatchlist(), true)
  // returns createEmptyWatchlist() when account is falsy

saveWatchlist(account: string, list: Watchlist): void
  // saveUserPreference(account, 'watchlist', { ...list, updatedAt }, true)

entryKey(address: string, chainId: number): string
  → `${chainId}:${address.toLowerCase()}`

addEntry(list, entry: WatchlistEntry): Watchlist
  // address lowercased; no-op if entryKey already present (FR-010); sets addedAt if absent

removeEntry(list, address: string, chainId: number): Watchlist        // FR-009

mergeWatchlists(current: Watchlist, incoming: Watchlist): { value: Watchlist, conflicts: [] }
  // idempotent union by entryKey; earliest addedAt wins; conflicts ALWAYS [] (FR-015)
```

**Guarantees**: pure functions (no I/O except load/save), addresses always lowercased,
identity always `(lowercased address, chainId)`, `entries` never contains duplicates.

---

## `frontend/src/hooks/useTokenWatchlist.js` (React)

```text
useTokenWatchlist(): {
  address: string | undefined,        // connected wallet (lowercased)
  chainId: number,                    // active chain (wagmi useChainId() || getCurrentChainId())
  entries: WatchlistEntry[],          // FILTERED to active chainId (FR-008)
  allEntries: WatchlistEntry[],       // every network (for backup/debug)
  addToken(entry): void,              // add + commit; dedupe (FR-002/003/010)
  removeToken(address, chainId): void,// remove + commit (FR-009)
  isWatched(address, chainId): boolean,
}
```

**Behavior**:
- useState initializer → `loadWatchlist(address)`; render-time address-change reload (the
  `useAddressBook` "previous render" pattern), no `setState`-in-effect.
- Every mutation calls a pure store fn then `commit(next)` → `saveWatchlist(address, next)` +
  `setState` (synchronous persistence).
- `entries` is derived as `allEntries.filter(e => e.chainId === chainId)` so a network switch
  instantly re-scopes without re-reading storage (FR-008).
- No wallet ⇒ `entries: []`, mutations are no-ops.

**Out of scope for this hook**: balance reads (Entity 7 / `useTokenBalances`), catalog
fetching (`useTokenRegistry`), and the membership gate (panel-level). The hook is storage-only.
