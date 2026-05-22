import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useChainId } from 'wagmi'
import { useWallet } from '../hooks/useWalletManagement'
import { FEE_TIERS, DEFAULT_SLIPPAGE } from '../constants/dex'
import { getNetwork, getCurrentChainId } from '../config/networks'
import { ERC20_ABI } from '../abis/ERC20'
import { WNATIVE_ABI } from '../abis/WNative'
import { SWAP_ROUTER_02_ABI } from '../abis/SwapRouter02'
import { QUOTER_V2_ABI } from '../abis/QuoterV2'
import { DexContext } from './DexContext'
import logger from '../utils/logger'

const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * Per-chain DEX wiring. Reads the active chain at runtime so the Testnet/
 * Mainnet toggle (wagmi.switchChain) transparently re-targets the right
 * Uniswap V3 deployment. Components that surface swap UI should branch on
 * `isDexAvailable` from the returned context.
 */
export function DexProvider({ children }) {
  const { provider, signer, address, isConnected } = useWallet()
  const wagmiChainId = useChainId()
  const chainId = wagmiChainId || getCurrentChainId()
  const network = getNetwork(chainId)

  const dexConfig = network?.dex || null
  const stableConfig = network?.stablecoin || null
  const nativeConfig = network?.nativeCurrency || null

  const isDexAvailable = Boolean(dexConfig)

  const addresses = useMemo(() => ({
    FACTORY: dexConfig?.factory || ZERO,
    SWAP_ROUTER_02: dexConfig?.swapRouter || ZERO,
    NONFUNGIBLE_TOKEN_POSITION_MANAGER: dexConfig?.positionManager || ZERO,
    QUOTER_V2: dexConfig?.quoter || ZERO,
    PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    WNATIVE: dexConfig?.wnative || ZERO,
    STABLECOIN: stableConfig?.address || ZERO,
  }), [dexConfig, stableConfig])

  const tokens = useMemo(() => ({
    WNATIVE: {
      address: addresses.WNATIVE,
      symbol: nativeConfig?.symbol ? `W${nativeConfig.symbol}` : 'WNATIVE',
      name: nativeConfig?.name ? `Wrapped ${nativeConfig.name}` : 'Wrapped Native',
      decimals: 18,
      icon: '🌐',
    },
    STABLE: stableConfig
      ? {
          address: stableConfig.address || ZERO,
          symbol: stableConfig.symbol,
          name: stableConfig.name,
          decimals: stableConfig.decimals,
          icon: '💵',
        }
      : {
          address: ZERO,
          symbol: 'STABLE',
          name: 'Stablecoin',
          decimals: 6,
          icon: '💵',
        },
    NATIVE: {
      address: 'native',
      symbol: nativeConfig?.symbol || 'MATIC',
      name: nativeConfig?.name || 'MATIC',
      decimals: nativeConfig?.decimals || 18,
      icon: '💎',
    },
  }), [addresses, stableConfig, nativeConfig])

  const [balances, setBalances] = useState({
    native: '0',
    wnative: '0',
    stable: '0',
  })

  const [balanceHistory, setBalanceHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [quotingPrice, setQuotingPrice] = useState(false)
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)

  const contracts = useMemo(() => {
    if (!provider || !isDexAvailable) return null

    return {
      wnative: new ethers.Contract(addresses.WNATIVE, WNATIVE_ABI, provider),
      stable: new ethers.Contract(addresses.STABLECOIN, ERC20_ABI, provider),
      swapRouter: new ethers.Contract(addresses.SWAP_ROUTER_02, SWAP_ROUTER_02_ABI, provider),
      quoter: new ethers.Contract(addresses.QUOTER_V2, QUOTER_V2_ABI, provider),
    }
  }, [provider, isDexAvailable, addresses])

  const fetchBalances = useCallback(async () => {
    if (import.meta.env.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') {
      return
    }

    if (!provider || !address || !contracts) return

    try {
      setLoading(true)

      const nativeBalance = await provider.getBalance(address)
      const wnativeBalance = await contracts.wnative.balanceOf(address)
      const stableBalance = await contracts.stable.balanceOf(address)

      const newBalances = {
        native: ethers.formatEther(nativeBalance),
        wnative: ethers.formatEther(wnativeBalance),
        stable: ethers.formatUnits(stableBalance, tokens.STABLE.decimals),
      }

      setBalances(newBalances)

      setBalanceHistory(prev => [
        ...prev,
        {
          timestamp: Date.now(),
          ...newBalances,
        },
      ].slice(-100))
    } catch (error) {
      logger.error('Error fetching balances:', error)
    } finally {
      setLoading(false)
    }
  }, [provider, address, contracts, tokens.STABLE.decimals])

  // Reset balances when chain changes so the user doesn't see stale numbers.
  useEffect(() => {
    setBalances({ native: '0', wnative: '0', stable: '0' })
    setBalanceHistory([])
  }, [chainId])

  useEffect(() => {
    if (isConnected) {
      fetchBalances()
      const interval = setInterval(fetchBalances, 300000)
      return () => clearInterval(interval)
    }
  }, [isConnected, fetchBalances])

  const wrapNative = useCallback(async (amount) => {
    if (!signer || !contracts) {
      throw new Error('Wallet not connected')
    }

    try {
      setLoading(true)
      const wnativeWithSigner = contracts.wnative.connect(signer)
      const amountWei = ethers.parseEther(amount)

      const tx = await wnativeWithSigner.deposit({ value: amountWei })
      await tx.wait()

      await fetchBalances()
      return tx
    } catch (error) {
      console.error('Error wrapping native:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [signer, contracts, fetchBalances])

  const unwrapNative = useCallback(async (amount) => {
    if (!signer || !contracts) {
      throw new Error('Wallet not connected')
    }

    try {
      setLoading(true)
      const wnativeWithSigner = contracts.wnative.connect(signer)
      const amountWei = ethers.parseEther(amount)

      const tx = await wnativeWithSigner.withdraw(amountWei)
      await tx.wait()

      await fetchBalances()
      return tx
    } catch (error) {
      console.error('Error unwrapping native:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [signer, contracts, fetchBalances])

  // Decimals lookup for a token by address used in quote/swap calls below.
  // Defaults to 18 (native/wrapped) when the token isn't in our known set.
  const decimalsOf = useCallback((tokenAddress) => {
    const lower = tokenAddress?.toLowerCase?.()
    if (lower === addresses.STABLECOIN.toLowerCase()) return tokens.STABLE.decimals
    if (lower === addresses.WNATIVE.toLowerCase()) return 18
    return 18
  }, [addresses, tokens.STABLE.decimals])

  const getQuote = useCallback(async (tokenIn, tokenOut, amountIn, feeTier = FEE_TIERS.MEDIUM) => {
    if (!contracts) {
      throw new Error('DEX is not available on the current network')
    }

    try {
      setQuotingPrice(true)
      const decIn = decimalsOf(tokenIn)
      const decOut = decimalsOf(tokenOut)
      const amountInWei = ethers.parseUnits(amountIn, decIn)

      const params = {
        tokenIn,
        tokenOut,
        amountIn: amountInWei,
        fee: feeTier,
        sqrtPriceLimitX96: 0,
      }

      const result = await contracts.quoter.quoteExactInputSingle.staticCall(params)
      return ethers.formatUnits(result[0], decOut)
    } catch (error) {
      console.error('Error getting quote:', error)
      throw error
    } finally {
      setQuotingPrice(false)
    }
  }, [contracts, decimalsOf])

  const swap = useCallback(async (tokenIn, tokenOut, amountIn, feeTier = FEE_TIERS.MEDIUM) => {
    if (!signer || !contracts || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setLoading(true)

      const decIn = decimalsOf(tokenIn)
      const decOut = decimalsOf(tokenOut)
      const amountOut = await getQuote(tokenIn, tokenOut, amountIn, feeTier)
      const minAmountOut = (parseFloat(amountOut) * (10000 - slippage) / 10000).toFixed(decOut)

      const amountInWei = ethers.parseUnits(amountIn, decIn)
      const minAmountOutWei = ethers.parseUnits(minAmountOut, decOut)

      const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, signer)
      const allowance = await tokenInContract.allowance(address, addresses.SWAP_ROUTER_02)

      if (allowance < amountInWei) {
        const approveTx = await tokenInContract.approve(
          addresses.SWAP_ROUTER_02,
          ethers.MaxUint256
        )
        await approveTx.wait()
      }

      const swapRouterWithSigner = contracts.swapRouter.connect(signer)
      const params = {
        tokenIn,
        tokenOut,
        fee: feeTier,
        recipient: address,
        amountIn: amountInWei,
        amountOutMinimum: minAmountOutWei,
        sqrtPriceLimitX96: 0,
      }

      const tx = await swapRouterWithSigner.exactInputSingle(params)
      await tx.wait()

      await fetchBalances()
      return tx
    } catch (error) {
      console.error('Error performing swap:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [signer, contracts, address, slippage, getQuote, fetchBalances, decimalsOf, addresses])

  const value = {
    balances,
    balanceHistory,
    loading,
    quotingPrice,
    slippage,

    fetchBalances,
    wrapNative,
    unwrapNative,
    getQuote,
    swap,
    setSlippage,

    tokens,
    addresses,
    isDexAvailable,
    chainId,
    network,
  }

  return (
    <DexContext.Provider value={value}>
      {children}
    </DexContext.Provider>
  )
}
