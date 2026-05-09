import { useChainId } from 'wagmi'
import { getNetwork, getCurrentChainId } from '../config/networks'

/**
 * Hook returning chain-aware token symbols, decimals, and per-chain
 * capabilities. Use this everywhere the UI used to hardcode "ETC" / "USC" so
 * the same screen renders the right labels on Mordor (METC / USC) and
 * Polygon Amoy (MATIC / USDC).
 *
 * Also exposes capabilities and the limited-functionality flag so screens can
 * decide whether to gate features (e.g. Polymarket-pegged side bets are only
 * available on chains where Polymarket's CTF lives).
 */
export function useChainTokens() {
  const wagmiChainId = useChainId()
  const chainId = wagmiChainId || getCurrentChainId()
  const n = getNetwork(chainId)

  return {
    chainId,
    networkName: n?.name || '',
    isPrimary: Boolean(n?.isPrimary),
    isTestnet: Boolean(n?.isTestnet),
    limitedFunctionality: Boolean(n?.limitedFunctionality),
    capabilities: n?.capabilities || {},
    native: n?.nativeCurrency?.symbol || '',
    nativeName: n?.nativeCurrency?.name || '',
    nativeDecimals: n?.nativeCurrency?.decimals || 18,
    stable: n?.stablecoin?.symbol || 'STABLE',
    stableName: n?.stablecoin?.name || '',
    stableAddress: n?.stablecoin?.address || null,
    stableDecimals: n?.stablecoin?.decimals || 6,
  }
}

export default useChainTokens
