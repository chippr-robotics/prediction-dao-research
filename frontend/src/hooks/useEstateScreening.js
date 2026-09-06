/**
 * useEstateScreening — one address, every source, every cohort chain (spec 021 amendment,
 * issue #1458). The React face of `lib/screening/screenEstate.js`.
 *
 * Distinct from `useAddressScreening`, which stays the PER-CHAIN screen: the surfaces that gate
 * a submission (Transfer, Pay, Bridge, Supply) still ask the guard on the chain the value moves
 * on, forced and live, because that is the read the contract will repeat. This hook answers the
 * broader question a member asks when they first paste an address — "is this address flagged
 * anywhere?" — and its result is advisory, never a gate.
 *
 * Returns `{ status, result, refresh }`:
 *   status  'idle' (no valid address) | 'loading' | 'done'
 *   result  an EstateScreeningResult on 'done', else null — so `result.verdict` cannot be read
 *           before it exists, and a loading pill is a distinct state, never a stale one.
 *
 * Status is DERIVED from (the address asked, the address answered): a result is only ever shown
 * for the address it was computed for, so typing a new address flips straight to 'loading'
 * without a synchronous setState in the effect.
 */
import { useCallback, useContext, useEffect, useState } from 'react'
import { getAddress, isAddress } from 'ethers'
import { WalletContext } from '../contexts/WalletContext'
import { forgetEstateScreening, screenAddressAcrossEstate } from '../lib/screening/screenEstate'

export function useEstateScreening(address) {
  // Read the wallet context WITHOUT requiring it: screening needs no wallet — the sweep resolves
  // its own read providers per chain — and a wallet's provider is only a cheaper transport for the
  // one chain it happens to be on. A surface with no WalletProvider above it still screens.
  const wallet = useContext(WalletContext)
  const provider = wallet?.provider ?? null
  const walletChainId = wallet?.chainId ?? null
  const key = typeof address === 'string' && isAddress(address.trim()) ? getAddress(address.trim()) : null
  const [answer, setAnswer] = useState(null) // { address, result, tick }
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    screenAddressAcrossEstate(key, { walletChainId, walletProvider: provider })
      .then((result) => {
        if (!cancelled) setAnswer({ address: key, result, tick })
      })
      .catch(() => {
        // screenAddressAcrossEstate never rejects; belt-and-braces so a surface can never be
        // left on 'loading' forever.
        if (!cancelled) setAnswer(null)
      })
    return () => {
      cancelled = true
    }
  }, [key, provider, walletChainId, tick])

  const refresh = useCallback(() => {
    if (key) forgetEstateScreening(key)
    setTick((n) => n + 1)
  }, [key])

  if (!key) return { status: 'idle', result: null, refresh }
  const done = answer && answer.address === key && answer.tick === tick
  return { status: done ? 'done' : 'loading', result: done ? answer.result : null, refresh }
}

export default useEstateScreening
