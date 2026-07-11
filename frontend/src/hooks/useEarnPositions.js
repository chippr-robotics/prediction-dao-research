/**
 * useEarnPositions (spec 050) — the member's lending positions on the active
 * network. Authoritative state is on-chain (share balance + convertToAssets +
 * maxWithdraw over the chain's read provider); USD value and earned-so-far are
 * best-effort enrichment from the Morpho API that degrades honestly to "—"
 * when the API is down (position still shown — constitution III).
 *
 * Polls every POSITIONS_POLL_MS (60s, aligned with usePortfolio), scoped to
 * (account, chain) — a scope change resets synchronously so nothing leaks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { NETWORKS, isEarnAvailable } from '../config/networks'
import { makeReadProvider } from '../utils/rpcProvider'
import { POSITIONS_POLL_MS } from '../config/earn'
import { readVaultUserState } from '../lib/earn/vaultActions'
import { fetchPositionsEnrichment } from '../lib/earn/morphoApi'

export function useEarnPositions(vaults) {
  const { address, isConnected, chainId } = useWallet() || {}
  const supported = isEarnAvailable(chainId)

  const [userStates, setUserStates] = useState(null) // Map vaultAddrLc -> chain reads
  const [enrichment, setEnrichment] = useState({})
  const [status, setStatus] = useState('loading')
  const reqIdRef = useRef(0)

  const provider = useMemo(
    () => (supported ? makeReadProvider(NETWORKS[chainId].rpcUrl, chainId) : null),
    [supported, chainId],
  )

  const load = useCallback(async () => {
    if (!supported || !isConnected || !address || !provider || !vaults?.length) return
    const reqId = ++reqIdRef.current
    try {
      const [settled, enriched] = await Promise.all([
        Promise.allSettled(
          vaults.map((vault) => readVaultUserState({ vault, account: address, provider })),
        ),
        // Enrichment failure degrades to on-chain values only — never blocks.
        fetchPositionsEnrichment(address, chainId).catch(() => ({})),
      ])
      if (reqId !== reqIdRef.current) return
      const next = new Map()
      let anyOk = false
      settled.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          anyOk = true
          next.set(vaults[i].address.toLowerCase(), res.value)
        }
      })
      if (!anyOk) {
        setUserStates(null)
        setStatus('unavailable')
        return
      }
      setUserStates(next)
      setEnrichment(enriched)
      setStatus('ready')
    } catch {
      if (reqId !== reqIdRef.current) return
      setUserStates(null)
      setStatus('unavailable')
    }
  }, [supported, isConnected, address, provider, chainId, vaults])

  // Scope change: hard reset so another account/chain's positions never render.
  useEffect(() => {
    reqIdRef.current++
    setUserStates(null)
    setEnrichment({})
    setStatus(supported && isConnected ? 'loading' : 'idle')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, vaults])

  useEffect(() => {
    if (!supported || !isConnected || !address) return undefined
    const id = setInterval(() => load(), POSITIONS_POLL_MS)
    return () => clearInterval(id)
  }, [supported, isConnected, address, load])

  return useMemo(() => {
    const positions = []
    if (userStates && vaults?.length) {
      for (const vault of vaults) {
        const state = userStates.get(vault.address.toLowerCase())
        if (!state || state.shares === 0n) continue
        const extra = enrichment[vault.address.toLowerCase()] || {}
        positions.push({
          vault,
          shares: state.shares,
          assets: state.assets,
          maxWithdrawAssets: state.maxWithdrawAssets,
          walletBalance: state.walletBalance,
          maxDepositAssets: state.maxDepositAssets,
          assetsUsd: extra.assetsUsd ?? null,
          pnlUsd: extra.pnlUsd ?? null,
        })
      }
    }
    return {
      positions,
      // Per-vault wallet/limit reads for the deposit form, position or not.
      userStates,
      status,
      refresh: load,
    }
  }, [userStates, enrichment, vaults, status, load])
}

export default useEarnPositions
