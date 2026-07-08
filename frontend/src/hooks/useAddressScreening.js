/**
 * useAddressScreening (Spec 021) — advisory, fail-closed sanctions/compliance
 * screening for the address book and address picker. Wraps the existing
 * utils/sanctionsScreen.js (read-only SanctionsGuard reads). This is a UX
 * pre-check only; the on-chain guard remains the real enforcement (FR-013).
 *
 * Results are cached per (chainId, lowercase(address)) for a short TTL so a
 * contact that becomes restricted is reflected on the next open after expiry,
 * without background polling (FR-010, FR-014, clarified Q5).
 */

import { useState, useCallback } from 'react'
import { useWallet } from './useWalletManagement'
import { screenAddress } from '../utils/sanctionsScreen'
import { addressKey } from '../lib/addressBook/addressBookStore'
import { SCREENING_TTL_MS } from '../lib/addressBook/constants'

// Shared across hook instances for the session.
const cache = new Map() // key -> { status, ts }
const inflight = new Map() // key -> Promise<status>

/** Test seam: clear the module-level screening cache. */
export function __clearScreeningCache() {
  cache.clear()
  inflight.clear()
}

function fresh(key) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < SCREENING_TTL_MS) return entry.status
  return null
}

export function useAddressScreening() {
  const { provider, chainId: activeChainId } = useWallet()
  const [, setTick] = useState(0)
  const rerender = useCallback(() => setTick((n) => n + 1), [])

  const screenOne = useCallback(
    (address, chainId) => {
      const key = addressKey(address, chainId)
      const cached = fresh(key)
      if (cached) return Promise.resolve(cached)
      if (inflight.has(key)) return inflight.get(key)

      const promise = (async () => {
        let status
        // Only screen an entry against a provider that talks to its own chain;
        // otherwise report uncertain rather than screening the wrong network.
        if (!provider || Number(chainId) !== Number(activeChainId)) {
          status = 'uncertain'
        } else {
          try {
            const res = await screenAddress(address, provider)
            status = res.available ? (res.allowed ? 'clear' : 'restricted') : 'uncertain'
          } catch {
            status = 'uncertain' // fail-closed (FR-011)
          }
        }
        cache.set(key, { status, ts: Date.now() })
        inflight.delete(key)
        return status
      })()

      inflight.set(key, promise)
      return promise
    },
    [provider, activeChainId],
  )

  // Synchronous accessor: returns a cached status or 'loading' while it screens.
  const getStatus = useCallback(
    (address, chainId) => {
      const key = addressKey(address, chainId)
      const cached = fresh(key)
      if (cached) return cached
      screenOne(address, chainId).then(rerender)
      return 'loading'
    },
    [screenOne, rerender],
  )

  // Imperatively (re-)screen a batch (e.g. on book open / on select).
  const screen = useCallback(
    async (entries) => {
      await Promise.all((entries || []).map((e) => screenOne(e.address, e.chainId)))
      rerender()
    },
    [screenOne, rerender],
  )

  const anyRestricted = useCallback(
    (entries) =>
      (entries || []).some((e) => fresh(addressKey(e.address, e.chainId)) === 'restricted'),
    [],
  )

  return { screenOne, getStatus, screen, anyRestricted }
}

export default useAddressScreening
