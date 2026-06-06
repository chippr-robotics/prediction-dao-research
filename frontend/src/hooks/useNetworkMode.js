import { useCallback, useMemo } from 'react'
import { useChainId, useSwitchChain } from 'wagmi'
import { getNetwork, TESTNET_MAINNET_PAIR, getCurrentChainId } from '../config/networks'

/**
 * Testnet ↔ Mainnet toggle. The default network is Polygon Mainnet; the user
 * can flip to Polygon Amoy (testnet) via the toggle, which calls
 * wagmi.switchChain so the wallet prompts the user. The DEX context and
 * chain-token hooks react automatically once the chain switches.
 *
 * Returns:
 *  - mode: 'testnet' | 'mainnet'
 *  - isMainnet, isTestnet, isOtherChain (e.g. Hardhat)
 *  - network: full network config object for the active chain
 *  - chainId: active chain id from wagmi (falls back to default)
 *  - switchMode(mode | 'toggle'): kicks off wagmi.switchChain
 *  - isSwitching: pending state from wagmi
 *  - error: last switch error
 */
export function useNetworkMode() {
  const wagmiChainId = useChainId()
  const chainId = wagmiChainId || getCurrentChainId()
  const network = getNetwork(chainId)
  const { switchChain, isPending: isSwitching, error } = useSwitchChain()

  const mode = useMemo(() => {
    if (chainId === TESTNET_MAINNET_PAIR.mainnet) return 'mainnet'
    if (chainId === TESTNET_MAINNET_PAIR.testnet) return 'testnet'
    return 'other'
  }, [chainId])

  const switchMode = useCallback((target) => {
    const next = target === 'toggle'
      ? (mode === 'mainnet' ? 'testnet' : 'mainnet')
      : target
    const targetChainId = next === 'mainnet'
      ? TESTNET_MAINNET_PAIR.mainnet
      : TESTNET_MAINNET_PAIR.testnet
    if (targetChainId === chainId) return
    switchChain({ chainId: targetChainId })
  }, [mode, chainId, switchChain])

  return {
    mode,
    isMainnet: mode === 'mainnet',
    isTestnet: mode === 'testnet',
    isOtherChain: mode === 'other',
    network,
    chainId,
    switchMode,
    isSwitching,
    error,
  }
}

export default useNetworkMode
