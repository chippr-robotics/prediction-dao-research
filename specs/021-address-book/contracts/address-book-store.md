# Contract: `addressBookStore` (pure data layer)

`frontend/src/lib/addressBook/addressBookStore.js` — framework-agnostic, pure
functions over a plain `AddressBook` object plus thin load/save helpers around
`utils/userStorage.js`. No React. Fully unit-testable.

## Persistence helpers

```js
// Load the book for an owner; returns an empty, valid book if none/invalid.
loadAddressBook(ownerAddress: string): AddressBook

// Persist the book for an owner (localStorage via userStorage). Updates updatedAt.
saveAddressBook(ownerAddress: string, book: AddressBook): void
```

- Owner address is lowercased for the storage key (matches `userStorage`).
- A malformed/parse-failed record loads as an empty book (never throws to the UI).

## Pure operations (return a NEW book; never mutate input)

```js
createEmptyBook(): AddressBook

addContact(book, { nickname, addresses }): { book, contact }
updateContact(book, contactId, { nickname? }): book
deleteContact(book, contactId): book

addAddress(book, contactId, { address, chainId, notes? }): book
updateAddress(book, contactId, addrKey, { notes?, chainId? }): book
removeAddress(book, contactId, addrKey): book   // addrKey = (lowercase(address), chainId)
```

## Query / utility helpers

```js
// Validate + checksum an address; throws/returns error sentinel on invalid input.
normalizeAddress(input: string): string            // throws on invalid (FR-005)
isValidAddress(input: string): boolean

addressKey(address: string, chainId: number): string  // `${lowercase(address)}:${chainId}`

// Find where an address+network is already saved (duplicate detection, FR-007).
findByAddress(book, address: string, chainId: number): { contact, savedAddress } | null

// Flat, searchable index for the picker (FR-015).
listEntries(book): Array<{ contactId, nickname, address, chainId, notes }>

// Substring match over nickname + address (case-insensitive).
searchEntries(book, query: string): Array<{ contactId, nickname, address, chainId, notes }>
```

## Merge (import, clarified Q2)

```js
// Additive merge keyed on (address, chainId). Returns the merged book plus the list
// of metadata conflicts the caller must resolve (differing nickname/notes).
mergeBook(current: AddressBook, incoming: AddressBook): {
  book: AddressBook,
  conflicts: Array<{
    addressKey: string,
    existing: { nickname, notes },
    incoming: { nickname, notes }
  }>
}

// Apply the member's per-conflict choices ('keep' | 'incoming').
applyConflictResolutions(book, resolutions: Record<addressKey, 'keep' | 'incoming'>): book
```

## Invariants

- Never deletes existing data during a merge (FR-022).
- `(address, chainId)` never duplicated within the book.
- Every persisted `SavedAddress` has a valid address and a `chainId`.
- All functions are pure except `loadAddressBook`/`saveAddressBook`.

## Error handling

- Invalid address → throw a typed error the UI maps to a field-level message
  (FR-005); no partial writes.
- Storage write failure (quota) → throw; UI surfaces a non-destructive error and the
  in-memory book is unchanged.
