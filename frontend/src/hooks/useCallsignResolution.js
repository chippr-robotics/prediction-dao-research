/**
 * useCallsignResolution (spec 054) — forward-resolve a callsign-like input (`%chipprbots`) to its owner address for
 * address-entry surfaces. Additive to ENS/address entry: only engages when the input LOOKS like a callsign.
 *
 * Soft-failing and null-safe: a registry that is undeployed / unreachable, or a non-callsign input, yields
 * `{ isCallsign: false }` so the caller keeps working with raw addresses and ENS (FR-013). Only status ACTIVE
 * produces a usable `address`; every other status surfaces an honest, non-committable message (FR-011/022).
 */
import { useContext, useEffect, useState } from 'react'
import { WalletContext } from '../contexts/WalletContext.js'
import { resolveCallsign, statusMessage, CallsignStatus } from '../lib/callsigns/resolveCallsign'
import { isCallsignLike, normalizeCallsign } from '../lib/callsigns/normalizeCallsign'
import { isValidEthereumAddress, isEnsName } from '../utils/validation'

const EMPTY = { isCallsign: false, address: null, status: null, verified: false, isLoading: false, message: null }

/**
 * @param {string} input raw entry-field value
 * @param {{ chainId?: number }} [opts]
 * @returns {{ isCallsign: boolean, address: string|null, status: number|null, verified: boolean, isLoading: boolean, message: string|null }}
 */
export function useCallsignResolution(input, { chainId: chainIdArg } = {}) {
  const wallet = useContext(WalletContext)
  const provider = wallet?.provider
  const chainId = chainIdArg ?? wallet?.chainId
  const raw = typeof input === 'string' ? input.trim() : ''

  // Callsign branch engages only for callsign-shaped input that is NOT an address or ENS name.
  const looksLikeCallsign = isCallsignLike(raw) && !isValidEthereumAddress(raw) && !isEnsName(raw)

  const [state, setState] = useState(EMPTY)

  useEffect(() => {
    if (!looksLikeCallsign) {
      setState(EMPTY)
      return
    }
    // Locally invalid (e.g. bad hyphen) — treat as a callsign attempt with a format hint, no contract call.
    let canonical
    try {
      canonical = normalizeCallsign(raw)
    } catch {
      setState({ ...EMPTY, isCallsign: true, message: 'Not a valid callsign' })
      return
    }
    if (!provider || chainId == null) {
      setState({ ...EMPTY, isCallsign: true, isLoading: false })
      return
    }

    let cancelled = false
    setState({ ...EMPTY, isCallsign: true, isLoading: true })
    resolveCallsign(canonical, { provider, chainId })
      .then((info) => {
        if (cancelled) return
        if (!info || info.status === CallsignStatus.NONE) {
          setState({ isCallsign: true, address: null, status: CallsignStatus.NONE, verified: false, isLoading: false, message: 'No such callsign' })
          return
        }
        const active = info.status === CallsignStatus.ACTIVE
        setState({
          isCallsign: true,
          address: active ? info.address : null,
          status: info.status,
          verified: info.verified,
          isLoading: false,
          message: active ? null : statusMessage(info.status),
        })
      })
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY, isCallsign: true, isLoading: false })
      })
    return () => {
      cancelled = true
    }
  }, [looksLikeCallsign, raw, provider, chainId])

  return state
}

export default useCallsignResolution
