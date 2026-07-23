import { useCallback, useMemo } from 'react'
import { useTransfer, TRANSFER_KIND } from './useTransfer'
import { useWallet } from './useWalletManagement'
import { useChainTokens } from './useChainTokens'
import { useBitcoinWallet } from './useBitcoinWallet'
import usePortfolio from './usePortfolio'
import { useAccountAssets } from './useAccountAssets'
import { getBitcoinNetwork } from '../config/bitcoinNetworks'
import { filterAssetsForActivity, defaultAssetKey } from '../lib/assets/assetActivity'

const toNum = (v) => (v == null || v === '' ? null : Number(v))

/**
 * useSelectableAssets (spec 064) — the shared, activity-scoped, acting-account-aware
 * asset option list behind the Universal Asset Selector. It generalizes the
 * `assetOptions` assembly previously inlined in the wallet Transfer form so the home
 * Pay/Request/Wager surfaces and the Transfer ("trade") view all list an identical
 * asset set (FR-001, FR-002).
 *
 * Data sources (never new network reads — this is a pure memo over already-fetched
 * state):
 *   - the connected chain's native + stablecoin (always present, even at zero
 *     balance, so a form is usable before balances load);
 *   - native Bitcoin (spec 061) when the passkey BTC wallet is ready AND the acting
 *     account is personal (custody vaults / recovered EOAs are EVM and can't hold BTC);
 *   - every native/erc20 holding of the ACTING source — personal `usePortfolio`, or
 *     `useAccountAssets(actingAddress)` for a vault / recovered legacy account.
 *
 * The list is then filtered by the activity's capability profile (FR-008): Bitcoin
 * and the native coin drop out of `wager` (EVM ERC-20 escrow only), etc.
 *
 * Routing is NOT re-derived here: `isGasless(option)` delegates to the send engine's
 * per-asset quote (Bitcoin forced false — never gasless, FR-005).
 *
 * @param {{ activity: 'pay'|'request'|'wager'|'transfer', actingAddress?: string|null }} params
 * @returns {{ options: object[], defaultKey: string|null, isGasless: (o:object)=>boolean }}
 */
export function useSelectableAssets({ activity, actingAddress = null } = {}) {
  const { chainId } = useWallet()
  const { balanceOf, quoteGaslessForAsset } = useTransfer()
  const tokens = useChainTokens()
  const btc = useBitcoinWallet()
  const portfolio = usePortfolio()
  const actingAssets = useAccountAssets(actingAddress)

  const connectedChainId = Number(tokens.chainId ?? chainId)

  const isConnectedStableAddr = useCallback(
    (addr) => Boolean(addr && tokens.stableAddress && addr.toLowerCase() === tokens.stableAddress.toLowerCase()),
    [tokens.stableAddress],
  )

  // The full (pre-activity-filter) option list — mirrors TransferForm.assetOptions.
  const allOptions = useMemo(() => {
    const byKey = new Map()
    const put = (opt) => byKey.set(opt.key, { ...(byKey.get(opt.key) || {}), ...opt })

    if (tokens.native) {
      put({
        key: `${connectedChainId}:native`,
        chainId: connectedChainId,
        kind: 'native',
        address: null,
        symbol: tokens.native,
        name: tokens.nativeName,
        decimals: tokens.nativeDecimals,
        networkName: tokens.networkName,
        balance: actingAddress ? null : toNum(balanceOf(TRANSFER_KIND.NATIVE)),
      })
    }
    if (tokens.stableAddress) {
      put({
        key: `${connectedChainId}:${tokens.stableAddress.toLowerCase()}`,
        chainId: connectedChainId,
        kind: 'erc20',
        address: tokens.stableAddress,
        symbol: tokens.stable,
        name: tokens.stableName,
        decimals: tokens.stableDecimals,
        networkName: tokens.networkName,
        balance: actingAddress ? null : toNum(balanceOf(TRANSFER_KIND.STABLE)),
      })
    }

    // Native Bitcoin — personal wallet only. Balance is the SPENDABLE amount.
    if (!actingAddress && btc.status === 'ready') {
      put({
        key: 'bitcoin:native',
        chainId: btc.networkId,
        kind: 'btc-native',
        address: null,
        symbol: 'BTC',
        name: 'Bitcoin',
        decimals: 8,
        networkName: getBitcoinNetwork(btc.networkId)?.name || 'Bitcoin',
        balance: (btc.balances?.spendableSats ?? 0) / 1e8,
      })
    }

    const source = actingAddress ? actingAssets.holdings : portfolio.holdings
    for (const h of source || []) {
      if (h.asset.kind !== 'native' && h.asset.kind !== 'erc20') continue // no NFTs in a value action
      const keepZero = h.asset.kind === 'native' || isConnectedStableAddr(h.asset.address)
      if (!(h.balance > 0) && !keepZero) continue
      put({
        key: `${Number(h.asset.chainId)}:${String(h.asset.id).toLowerCase()}`,
        chainId: Number(h.asset.chainId),
        kind: h.asset.kind,
        address: h.asset.address || null,
        symbol: h.asset.symbol,
        name: h.asset.name,
        decimals: h.asset.decimals,
        networkName: h.network,
        balance: h.balance,
      })
    }

    return [...byKey.values()].sort((a, b) => {
      const ac = a.chainId === connectedChainId ? 0 : 1
      const bc = b.chainId === connectedChainId ? 0 : 1
      if (ac !== bc) return ac - bc
      return (b.balance ?? 0) - (a.balance ?? 0)
    })
  }, [
    actingAddress, actingAssets.holdings, portfolio.holdings, tokens, connectedChainId,
    balanceOf, isConnectedStableAddr, btc.status, btc.networkId, btc.balances?.spendableSats,
  ])

  const options = useMemo(() => filterAssetsForActivity(activity, allOptions), [activity, allOptions])

  const defaultKey = useMemo(
    () => defaultAssetKey(activity, options, { connectedChainId, stableAddress: tokens.stableAddress }),
    [activity, options, connectedChainId, tokens.stableAddress],
  )

  // Bitcoin is never gasless (FR-005/FR-015); otherwise defer to the engine's quote.
  const isGasless = useCallback(
    (opt) => (opt?.kind === 'btc-native' ? false : quoteGaslessForAsset(opt)),
    [quoteGaslessForAsset],
  )

  return { options, defaultKey, isGasless }
}

export default useSelectableAssets
