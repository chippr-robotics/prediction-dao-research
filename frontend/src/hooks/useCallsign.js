/**
 * useCallsign (spec 054) — reverse-resolve an address to its active `%callsign`, for display.
 *
 * Optional identity layer: null-safe and soft-failing. If the registry is undeployed on the active chain,
 * the RPC errors, or the address simply has no callsign, this returns `{ callsign: null }` and the caller falls through
 * to the existing name chain (address book > ENS > generated) — a tagless counterparty is a first-class case.
 *
 * Short-TTL in-memory cache keyed by (chainId, address), mirroring the ENS reverse-lookup cache window.
 */
import { useContext, useEffect, useState } from 'react'
import { WalletContext } from '../contexts/WalletContext.js'
import { lookupCallsignOf } from '../lib/callsigns/resolveCallsign'
import { isValidEthereumAddress } from '../utils/validation'

const TTL_MS = 5 * 60 * 1000
const cache = new Map() // `${chainId}:${addressLower}` -> { at, value }

function cacheKey(chainId, address) {
  return `${chainId}:${String(address).toLowerCase()}`
}

/**
 * @param {string} address counterparty address
 * @returns {{ callsign: string|null, verified: boolean, isLoading: boolean }}
 */
export function useCallsign(address) {
  // Read the wallet context OPTIONALLY (not the throwing useWeb3) so this display helper works in
  // lightweight renders without a WalletProvider — degrading to "no callsign" exactly like useOpponentName.
  const wallet = useContext(WalletContext)
  const provider = wallet?.provider
  const chainId = wallet?.chainId
  const isAddress = isValidEthereumAddress(address)
  const [state, setState] = useState({ callsign: null, verified: false, isLoading: false })

  useEffect(() => {
    if (!isAddress || !provider || chainId == null) {
      setState({ callsign: null, verified: false, isLoading: false })
      return
    }
    const key = cacheKey(chainId, address)
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) {
      setState({ callsign: hit.value?.callsign || null, verified: hit.value?.verified || false, isLoading: false })
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, isLoading: true }))
    lookupCallsignOf(address, { provider, chainId })
      .then((value) => {
        cache.set(key, { at: Date.now(), value })
        if (!cancelled) setState({ callsign: value?.callsign || null, verified: value?.verified || false, isLoading: false })
      })
      .catch(() => {
        // Soft-fail: never surface an error to the display chain (FR-013).
        if (!cancelled) setState({ callsign: null, verified: false, isLoading: false })
      })
    return () => {
      cancelled = true
    }
  }, [isAddress, address, provider, chainId])

  return state
}

export default useCallsign
