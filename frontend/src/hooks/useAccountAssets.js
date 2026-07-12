import { useCallback, useEffect, useMemo, useState } from 'react'
import { Contract, formatUnits } from 'ethers'
import { useWallet } from './useWalletManagement'
import { makeReadProvider } from '../utils/rpcProvider'
import { NETWORKS } from '../config/networks'
import { getPortfolioRegistry } from '../config/assetTaxonomy'

const BALANCE_OF_ABI = ['function balanceOf(address) view returns (uint256)']

/**
 * Read the CONNECTED chain's transferable balances (native + curated ERC-20s, no NFTs) for an arbitrary
 * account address. This lets the Transfer form source its asset list + balances from whichever "From"
 * account is active — in particular a custody vault, which lives on the connected chain and is not part of
 * the connected wallet's cross-chain portfolio scan (usePortfolio). Returns holdings shaped like a
 * usePortfolio holding ({ asset, balance, network }), so callers treat vault and personal sources
 * identically. Honest-state: a balance read that fails drops that asset rather than rendering a false zero.
 *
 * Pass `accountAddress = null` (e.g. when operating personally) to disable the reads and get an empty list.
 */
export function useAccountAssets(accountAddress) {
  const { chainId } = useWallet()
  const numericChainId = Number(chainId)

  const registry = useMemo(
    () => getPortfolioRegistry(numericChainId).filter((a) => a.kind === 'native' || a.kind === 'erc20'),
    [numericChainId],
  )
  const provider = useMemo(() => {
    const net = NETWORKS[numericChainId]
    return net?.rpcUrl ? makeReadProvider(net.rpcUrl, numericChainId) : null
  }, [numericChainId])

  const [holdings, setHoldings] = useState([])

  // Compute (never sets state) so the effect below can set state off the synchronous path.
  const compute = useCallback(async () => {
    if (!accountAddress || !provider || registry.length === 0) return []
    const settled = await Promise.allSettled(
      registry.map(async (asset) => {
        const raw =
          asset.kind === 'native'
            ? await provider.getBalance(accountAddress)
            : await new Contract(asset.address, BALANCE_OF_ABI, provider).balanceOf(accountAddress)
        return {
          asset,
          balance: Number(formatUnits(raw, asset.decimals)),
          network: NETWORKS[asset.chainId]?.name || String(asset.chainId),
        }
      }),
    )
    return settled.filter((r) => r.status === 'fulfilled').map((r) => r.value)
  }, [accountAddress, provider, registry])

  useEffect(() => {
    let active = true
    compute().then((h) => { if (active) setHoldings(h) })
    return () => { active = false }
  }, [compute])

  const refresh = useCallback(() => {
    compute().then((h) => setHoldings(h))
  }, [compute])

  return useMemo(() => ({ holdings, refresh }), [holdings, refresh])
}

export default useAccountAssets
