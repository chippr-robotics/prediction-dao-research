/**
 * useEarnPositions (spec 050) — the member's lending positions across every
 * earn-enabled network. Like the portfolio, each vault is read over ITS OWN
 * chain's read provider (independent of the wallet's active network), so the
 * member sees all their positions at once with network badges. Authoritative
 * state is on-chain (share balance + convertToAssets + maxWithdraw); USD
 * value and earned-so-far are best-effort Morpho API enrichment that
 * degrades honestly to "—" (position still shown — constitution III).
 *
 * Polls every POSITIONS_POLL_MS (60s, aligned with usePortfolio), scoped to
 * the connected account — an account change resets synchronously.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { NETWORKS, getEarnNetworks } from '../config/networks'
import { makeReadProvider } from '../utils/rpcProvider'
import { POSITIONS_POLL_MS } from '../config/earn'
import { readVaultUserState } from '../lib/earn/vaultActions'
import { fetchPositionsEnrichment } from '../lib/earn/morphoApi'

/** Cross-chain key for one vault position. */
export function positionKey(chainId, vaultAddress) {
  return `${chainId}:${String(vaultAddress).toLowerCase()}`
}

export function useEarnPositions(vaults) {
  const { address, isConnected } = useWallet() || {}
  const earnChainIds = useMemo(() => getEarnNetworks().map((net) => net.chainId), [])

  const [userStates, setUserStates] = useState(null) // Map positionKey -> chain reads
  const [enrichment, setEnrichment] = useState({})
  const [status, setStatus] = useState('loading')
  const reqIdRef = useRef(0)

  const providers = useMemo(
    () => new Map(earnChainIds.map((id) => [id, makeReadProvider(NETWORKS[id].rpcUrl, id)])),
    [earnChainIds],
  )

  const load = useCallback(async () => {
    if (!isConnected || !address || !vaults?.length) return
    const reqId = ++reqIdRef.current
    try {
      const [settled, enrichedPerChain] = await Promise.all([
        Promise.allSettled(
          vaults.map((vault) =>
            readVaultUserState({ vault, account: address, provider: providers.get(vault.chainId) }),
          ),
        ),
        // Enrichment failure degrades to on-chain values only — never blocks.
        Promise.all(
          earnChainIds.map((chainId) =>
            fetchPositionsEnrichment(address, chainId)
              .then((byVault) => ({ chainId, byVault }))
              .catch(() => ({ chainId, byVault: {} })),
          ),
        ),
      ])
      if (reqId !== reqIdRef.current) return
      const next = new Map()
      let anyOk = false
      settled.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          anyOk = true
          next.set(positionKey(vaults[i].chainId, vaults[i].address), res.value)
        }
      })
      if (!anyOk) {
        setUserStates(null)
        setStatus('unavailable')
        return
      }
      const enriched = {}
      for (const { chainId, byVault } of enrichedPerChain) {
        for (const [vaultAddress, extra] of Object.entries(byVault)) {
          enriched[positionKey(chainId, vaultAddress)] = extra
        }
      }
      setUserStates(next)
      setEnrichment(enriched)
      setStatus('ready')
    } catch {
      if (reqId !== reqIdRef.current) return
      setUserStates(null)
      setStatus('unavailable')
    }
  }, [isConnected, address, providers, earnChainIds, vaults])

  // Account change: hard reset so another account's positions never render.
  useEffect(() => {
    reqIdRef.current++
    setUserStates(null)
    setEnrichment({})
    setStatus(isConnected ? 'loading' : 'idle')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, vaults])

  useEffect(() => {
    if (!isConnected || !address) return undefined
    const id = setInterval(() => load(), POSITIONS_POLL_MS)
    return () => clearInterval(id)
  }, [isConnected, address, load])

  return useMemo(() => {
    const positions = []
    if (userStates && vaults?.length) {
      for (const vault of vaults) {
        const state = userStates.get(positionKey(vault.chainId, vault.address))
        if (!state || state.shares === 0n) continue
        const extra = enrichment[positionKey(vault.chainId, vault.address)] || {}
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
