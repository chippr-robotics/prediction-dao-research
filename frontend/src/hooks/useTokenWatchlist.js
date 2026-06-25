/**
 * useTokenWatchlist (Spec 034) — reactive binding over the pure
 * tokenWatchlistStore, scoped to the connected wallet. Mirrors useAddressBook:
 * loads on mount, re-loads on wallet change (the React "store info from previous
 * renders" pattern — no setState-in-effect), persists every mutation.
 *
 * `entries` is filtered to the ACTIVE chain (FR-008) using the same chainId the
 * membership gate reads (useWeb3) so the gate and the list never disagree about
 * which network is active. Storage holds entries for all networks.
 */

import { useState, useCallback, useMemo } from 'react'
import { useWallet } from './useWalletManagement'
import { useWeb3 } from './useWeb3'
import {
  loadWatchlist,
  saveWatchlist,
  createEmptyWatchlist,
  addEntry as addEntryPure,
  removeEntry as removeEntryPure,
  isWatched as isWatchedPure,
} from '../lib/tokens/tokenWatchlistStore'

export function useTokenWatchlist() {
  const { address } = useWallet()
  const { chainId } = useWeb3()
  const [list, setList] = useState(() =>
    address ? loadWatchlist(address) : createEmptyWatchlist(),
  )

  // Re-load from storage when the connected wallet changes — per-wallet isolation.
  const [loadedFor, setLoadedFor] = useState(address)
  if (address !== loadedFor) {
    setLoadedFor(address)
    setList(address ? loadWatchlist(address) : createEmptyWatchlist())
  }

  const commit = useCallback(
    (next) => {
      if (address) saveWatchlist(address, next)
      setList(next)
      return next
    },
    [address],
  )

  const addToken = useCallback((entry) => commit(addEntryPure(list, entry)), [list, commit])
  const removeToken = useCallback(
    (addr, cid) => commit(removeEntryPure(list, addr, cid)),
    [list, commit],
  )
  const isWatched = useCallback((addr, cid) => isWatchedPure(list, addr, cid), [list])

  const allEntries = list.entries
  const entries = useMemo(
    () => allEntries.filter((e) => Number(e.chainId) === Number(chainId)),
    [allEntries, chainId],
  )

  return { address, chainId, entries, allEntries, addToken, removeToken, isWatched }
}

export default useTokenWatchlist
