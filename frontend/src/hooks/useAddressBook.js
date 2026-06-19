/**
 * useAddressBook (Spec 021) — reactive binding over the pure addressBookStore,
 * scoped to the connected wallet. Loads on mount, persists every mutation, and
 * exposes CRUD + search + import/merge helpers.
 */

import { useState, useCallback, useMemo } from 'react'
import { useWallet } from './useWalletManagement'
import {
  loadAddressBook,
  saveAddressBook,
  createEmptyBook,
  addContact as addContactPure,
  updateContact as updateContactPure,
  deleteContact as deleteContactPure,
  addAddress as addAddressPure,
  updateAddress as updateAddressPure,
  removeAddress as removeAddressPure,
  findByAddress as findByAddressPure,
  searchEntries as searchEntriesPure,
  listEntries as listEntriesPure,
  mergeBook as mergeBookPure,
  applyConflictResolutions as applyConflictResolutionsPure,
} from '../lib/addressBook/addressBookStore'

export function useAddressBook() {
  const { address } = useWallet()
  const [book, setBook] = useState(() =>
    address ? loadAddressBook(address) : createEmptyBook(),
  )

  // Re-load from storage when the connected wallet changes — per-wallet
  // isolation. This is the React-endorsed "adjust state during render" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders),
  // which avoids the cascading-render of a setState-in-effect.
  const [loadedFor, setLoadedFor] = useState(address)
  if (address !== loadedFor) {
    setLoadedFor(address)
    setBook(address ? loadAddressBook(address) : createEmptyBook())
  }

  // Commit a new book: persist (if a wallet is connected) and update state.
  const commit = useCallback(
    (nextBook) => {
      if (address) saveAddressBook(address, nextBook)
      setBook(nextBook)
      return nextBook
    },
    [address],
  )

  const addContact = useCallback(
    (draft) => {
      const { book: next, contact } = addContactPure(book, draft)
      commit(next)
      return contact
    },
    [book, commit],
  )

  const updateContact = useCallback(
    (id, patch) => commit(updateContactPure(book, id, patch)),
    [book, commit],
  )
  const deleteContact = useCallback((id) => commit(deleteContactPure(book, id)), [book, commit])
  const addAddress = useCallback(
    (id, addr) => commit(addAddressPure(book, id, addr)),
    [book, commit],
  )
  const updateAddress = useCallback(
    (id, key, patch) => commit(updateAddressPure(book, id, key, patch)),
    [book, commit],
  )
  const removeAddress = useCallback(
    (id, key) => commit(removeAddressPure(book, id, key)),
    [book, commit],
  )

  const findByAddress = useCallback((addr, chainId) => findByAddressPure(book, addr, chainId), [book])
  const search = useCallback((query) => searchEntriesPure(book, query), [book])
  const entries = useMemo(() => listEntriesPure(book), [book])

  // Import: merge an incoming book additively, returning conflicts to resolve.
  const importBook = useCallback(
    (incoming) => {
      const { book: merged, conflicts } = mergeBookPure(book, incoming)
      // Persist the additive part immediately; conflicts only affect metadata.
      commit(merged)
      return { conflicts, book: merged }
    },
    [book, commit],
  )

  const resolveConflicts = useCallback(
    (conflicts, resolutions) =>
      commit(applyConflictResolutionsPure(book, conflicts, resolutions)),
    [book, commit],
  )

  return {
    address,
    book,
    contacts: book.contacts,
    entries,
    addContact,
    updateContact,
    deleteContact,
    addAddress,
    updateAddress,
    removeAddress,
    findByAddress,
    search,
    importBook,
    resolveConflicts,
  }
}

export default useAddressBook
