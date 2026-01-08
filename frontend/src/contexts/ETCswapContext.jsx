import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useWallet } from '../hooks/useWalletManagement'
import { ETCSWAP_ADDRESSES, TOKENS, FEE_TIERS, DEFAULT_SLIPPAGE } from '../constants/etcswap'
import { ERC20_ABI } from '../abis/ERC20'
import { WETC_ABI } from '../abis/WETC'
import { SWAP_ROUTER_02_ABI } from '../abis/SwapRouter02'
import { QUOTER_V2_ABI } from '../abis/QuoterV2'
import { ETCswapContext } from './ETCswapContext'

export function ETCswapProvider({ children }) {
  // Use unified wallet management
  const { provider, signer, address, isConnected } = useWallet()
  
  // Balances
  const [balances, setBalances] = useState({
    etc: '0',
    wetc: '0',
    usc: '0'
  })
  
  // Balance history for charts
  const [balanceHistory, setBalanceHistory] = useState([])
  
  // Loading states
  const [loading, setLoading] = useState(false)
  const [quotingPrice, setQuotingPrice] = useState(false)
  
  // Slippage tolerance
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)
  
  // Contract instances
  const contracts = useMemo(() => {
    if (!provider) return null
    
    return {
      wetc: new ethers.Contract(ETCSWAP_ADDRESSES.WETC, WETC_ABI, provider),
      usc: new ethers.Contract(ETCSWAP_ADDRESSES.USC_STABLECOIN, ERC20_ABI, provider),
      swapRouter: new ethers.Contract(ETCSWAP_ADDRESSES.SWAP_ROUTER_02, SWAP_ROUTER_02_ABI, provider),
      quoter: new ethers.Contract(ETCSWAP_ADDRESSES.QUOTER_V2, QUOTER_V2_ABI, provider)
    }
  }, [provider])
  
  // Fetch balances
  const fetchBalances = useCallback(async () => {
    // Skip balance fetching in test environment
    if (import.meta.env.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') {
      return
    }
    
    if (!provider || !address || !contracts) return
    
    try {
      setLoading(true)
      
      // Get native ETC balance
      const etcBalance = await provider.getBalance(address)
      
      // Get WETC balance
      const wetcBalance = await contracts.wetc.balanceOf(address)
      
      // Get USC balance (USC has 6 decimals like USDC)
      const uscBalance = await contracts.usc.balanceOf(address)
      
      const newBalances = {
        etc: ethers.formatEther(etcBalance),
        wetc: ethers.formatEther(wetcBalance),
        usc: ethers.formatUnits(uscBalance, 6)
      }
      
      setBalances(newBalances)
      
      // Add to history
      setBalanceHistory(prev => [
        ...prev,
        {
          timestamp: Date.now(),
          ...newBalances
        }
      ].slice(-100)) // Keep last 100 records
      
    } catch (error) {
      console.error('Error fetching balances:', error)
    } finally {
      setLoading(false)
    }
  }, [provider, address, contracts])
  
  // Fetch balances on connect and periodically
  useEffect(() => {
    if (isConnected) {
      fetchBalances()
      const interval = setInterval(fetchBalances, 30000) // Every 30 seconds
      return () => clearInterval(interval)
    }
  }, [isConnected, fetchBalances])
  
  // Wrap ETC to WETC
  const wrapETC = useCallback(async (amount) => {
    if (!signer || !contracts) {
      throw new Error('Wallet not connected')
    }
    
    try {
      setLoading(true)
      const wetcWithSigner = contracts.wetc.connect(signer)
      const amountWei = ethers.parseEther(amount)
      
      const tx = await wetcWithSigner.deposit({ value: amountWei })
      await tx.wait()
      
      await fetchBalances()
      return tx
    } catch (error) {
      console.error('Error wrapping ETC:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [signer, contracts, fetchBalances])
  
  // Unwrap WETC to ETC
  const unwrapWETC = useCallback(async (amount) => {
    if (!signer || !contracts) {
      throw new Error('Wallet not connected')
    }
    
    try {
      setLoading(true)
      const wetcWithSigner = contracts.wetc.connect(signer)
      const amountWei = ethers.parseEther(amount)
      
      const tx = await wetcWithSigner.withdraw(amountWei)
      await tx.wait()
      
      await fetchBalances()
      return tx
    } catch (error) {
      console.error('Error unwrapping WETC:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [signer, contracts, fetchBalances])
  
  // Get swap quote
  const getQuote = useCallback(async (tokenIn, tokenOut, amountIn) => {
    if (!contracts) {
      throw new Error('Contracts not initialized')
    }
    
    try {
      setQuotingPrice(true)
      const amountInWei = ethers.parseEther(amountIn)
      
      const params = {
        tokenIn,
        tokenOut,
        amountIn: amountInWei,
        fee: FEE_TIERS.MEDIUM, // Use 0.3% fee tier
        sqrtPriceLimitX96: 0
      }
      
      const result = await contracts.quoter.quoteExactInputSingle.staticCall(params)
      return ethers.formatEther(result[0]) // amountOut
    } catch (error) {
      console.error('Error getting quote:', error)
      throw error
    } finally {
      setQuotingPrice(false)
    }
  }, [contracts])
  
  // Perform swap
  const swap = useCallback(async (tokenIn, tokenOut, amountIn) => {
    if (!signer || !contracts || !address) {
      throw new Error('Wallet not connected')
    }
    
    try {
      setLoading(true)
      
      // Get quote
      const amountOut = await getQuote(tokenIn, tokenOut, amountIn)
      
      // Calculate minimum amount out with slippage
      const minAmountOut = (parseFloat(amountOut) * (10000 - slippage) / 10000).toString()
      
      const amountInWei = ethers.parseEther(amountIn)
      const minAmountOutWei = ethers.parseEther(minAmountOut)
      
      // Approve token if needed
      const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, signer)
      const allowance = await tokenInContract.allowance(address, ETCSWAP_ADDRESSES.SWAP_ROUTER_02)
      
      if (allowance < amountInWei) {
        const approveTx = await tokenInContract.approve(
          ETCSWAP_ADDRESSES.SWAP_ROUTER_02,
          ethers.MaxUint256
        )
        await approveTx.wait()
      }
      
      // Execute swap
      const swapRouterWithSigner = contracts.swapRouter.connect(signer)
      const params = {
        tokenIn,
        tokenOut,
        fee: FEE_TIERS.MEDIUM,
        recipient: address,
        amountIn: amountInWei,
        amountOutMinimum: minAmountOutWei,
        sqrtPriceLimitX96: 0
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
    // State
    balances,
    balanceHistory,
    loading,
    quotingPrice,
    slippage,
    
    // Actions
    fetchBalances,
    wrapETC,
    unwrapWETC,
    getQuote,
    swap,
    setSlippage,
    
    // Constants
    tokens: TOKENS,
    addresses: ETCSWAP_ADDRESSES
  }
  
  return (
    <ETCswapContext.Provider value={value}>
      {children}
    </ETCswapContext.Provider>
  )
}
