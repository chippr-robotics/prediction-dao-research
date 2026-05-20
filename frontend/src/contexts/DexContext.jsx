import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../hooks/useWalletManagement'
import { DEX_ADDRESSES, TOKENS, FEE_TIERS, DEFAULT_SLIPPAGE, isDexAvailable } from '../constants/dex'
import { ERC20_ABI } from '../abis/ERC20'
import { WNATIVE_ABI } from '../abis/WNative'
import { SWAP_ROUTER_02_ABI } from '../abis/SwapRouter02'
import { QUOTER_V2_ABI } from '../abis/QuoterV2'
import { DexContext } from './DexContext'
import logger from '../utils/logger'

/**
 * Provider for the active chain's V3 DEX (Uniswap-style). On chains where no
 * DEX is deployed (Polygon Amoy today) the provider stays inert — balances
 * stay at zero and actions throw — and callers should branch on
 * `isDexAvailable` from `constants/dex` before exposing swap UI.
 */
export function DexProvider({ children }) {
  const { provider, signer, address, isConnected } = useWallet()

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
      wnative: new ethers.Contract(DEX_ADDRESSES.WNATIVE, WNATIVE_ABI, provider),
      stable: new ethers.Contract(DEX_ADDRESSES.STABLECOIN, ERC20_ABI, provider),
      swapRouter: new ethers.Contract(DEX_ADDRESSES.SWAP_ROUTER_02, SWAP_ROUTER_02_ABI, provider),
      quoter: new ethers.Contract(DEX_ADDRESSES.QUOTER_V2, QUOTER_V2_ABI, provider),
    }
  }, [provider])

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
        stable: ethers.formatUnits(stableBalance, 6),
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
  }, [provider, address, contracts])

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

  const getQuote = useCallback(async (tokenIn, tokenOut, amountIn) => {
    if (!contracts) {
      throw new Error('DEX contracts not initialized on this chain')
    }

    try {
      setQuotingPrice(true)
      const amountInWei = ethers.parseEther(amountIn)

      const params = {
        tokenIn,
        tokenOut,
        amountIn: amountInWei,
        fee: FEE_TIERS.MEDIUM,
        sqrtPriceLimitX96: 0,
      }

      const result = await contracts.quoter.quoteExactInputSingle.staticCall(params)
      return ethers.formatEther(result[0])
    } catch (error) {
      console.error('Error getting quote:', error)
      throw error
    } finally {
      setQuotingPrice(false)
    }
  }, [contracts])

  const swap = useCallback(async (tokenIn, tokenOut, amountIn) => {
    if (!signer || !contracts || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setLoading(true)

      const amountOut = await getQuote(tokenIn, tokenOut, amountIn)
      const minAmountOut = (parseFloat(amountOut) * (10000 - slippage) / 10000).toString()

      const amountInWei = ethers.parseEther(amountIn)
      const minAmountOutWei = ethers.parseEther(minAmountOut)

      const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, signer)
      const allowance = await tokenInContract.allowance(address, DEX_ADDRESSES.SWAP_ROUTER_02)

      if (allowance < amountInWei) {
        const approveTx = await tokenInContract.approve(
          DEX_ADDRESSES.SWAP_ROUTER_02,
          ethers.MaxUint256
        )
        await approveTx.wait()
      }

      const swapRouterWithSigner = contracts.swapRouter.connect(signer)
      const params = {
        tokenIn,
        tokenOut,
        fee: FEE_TIERS.MEDIUM,
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
  }, [signer, contracts, address, slippage, getQuote, fetchBalances])

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

    tokens: TOKENS,
    addresses: DEX_ADDRESSES,
    isDexAvailable,
  }

  return (
    <DexContext.Provider value={value}>
      {children}
    </DexContext.Provider>
  )
}
