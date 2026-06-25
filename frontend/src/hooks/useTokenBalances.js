/**
 * useTokenBalances (Spec 034, FR-005).
 *
 * Reads the connected wallet's live ERC-20 balance for a set of watched tokens
 * via ethers v6 (the codebase's sole read idiom — see DexContext). Balances are
 * display-only and NEVER persisted. A failed read yields status 'unavailable'
 * (rendered as "—") rather than a misleading 0. Refreshes on a 300s interval
 * (matching DexContext) and whenever the entries/account/provider change.
 *
 * Reads run concurrently (Promise.all over balanceOf); Multicall batching is a
 * possible future optimization but is not required for a manually-bounded list.
 */

import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'
import { useWallet } from './useWalletManagement'
import { ERC20_ABI } from '../abis/ERC20'

const REFRESH_MS = 300000

function balanceKey(chainId, address) {
  return `${chainId}:${String(address).toLowerCase()}`
}

export { balanceKey }

export function useTokenBalances(entries) {
  const { provider } = useWeb3()
  const { address } = useWallet()
  const [balances, setBalances] = useState({})

  const fetchAll = useCallback(async () => {
    if (!provider || !address || !entries || entries.length === 0) {
      setBalances({})
      return
    }
    const next = {}
    await Promise.all(
      entries.map(async (e) => {
        const k = balanceKey(e.chainId, e.address)
        try {
          const c = new ethers.Contract(e.address, ERC20_ABI, provider)
          const raw = await c.balanceOf(address)
          next[k] = {
            status: 'ok',
            raw,
            formatted: ethers.formatUnits(raw, Number(e.decimals) || 18),
          }
        } catch {
          next[k] = { status: 'unavailable', raw: null, formatted: null }
        }
      }),
    )
    setBalances(next)
  }, [provider, address, entries])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchAll])

  return { balances, refresh: fetchAll }
}

export default useTokenBalances
