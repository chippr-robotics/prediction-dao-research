import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useChainId } from 'wagmi'
import { useWallet } from '../hooks/useWalletManagement'
import { useActiveAccount } from '../hooks/useActiveAccount'
import { FEE_TIERS, DEFAULT_SLIPPAGE } from '../constants/dex'
import { getNetwork, getCurrentChainId } from '../config/networks'
import { ERC20_ABI } from '../abis/ERC20'
import { WNATIVE_ABI } from '../abis/WNative'
import { SWAP_ROUTER_02_ABI } from '../abis/SwapRouter02'
import { QUOTER_V2_ABI } from '../abis/QuoterV2'
import { DexContext } from './DexContext'
import { toSdkToken, buildTradeMetrics, ROUTED_FEE_TIERS } from '../lib/uniswap/trade'
import logger from '../utils/logger'

const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * Per-chain DEX wiring. Reads the active chain at runtime so switching networks
 * (wagmi.switchChain) transparently re-targets the right DEX deployment — Uniswap
 * on Polygon-family chains, ETCswap on the Ethereum Classic family (Spec 033).
 * Components that surface swap UI should branch on `isDexAvailable` and name the
 * provider via `dexProvider` from the returned context.
 */
export function DexProvider({ children }) {
  const { provider, signer, address, isConnected } = useWallet()
  // Spec 043 (US3): swapping while operating as a vault becomes a threshold-gated vault proposal.
  const { isVault: operatingAsVault, canActAsVault, identity: activeIdentity, submit: submitAsActive } = useActiveAccount()
  const wagmiChainId = useChainId()
  const chainId = wagmiChainId || getCurrentChainId()
  const network = getNetwork(chainId)

  const dexConfig = network?.dex || null
  const stableConfig = network?.stablecoin || null
  const nativeConfig = network?.nativeCurrency || null

  const isDexAvailable = Boolean(dexConfig)

  // Provider identity for the active chain (ETC family → ETCswap; else Uniswap).
  // Independent of `dexConfig` so the swap UI can name the provider even when the
  // DEX is unconfigured on this network (Spec 033).
  const dexProvider = network?.dexProvider || null

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

  // Stablecoin contract for balance reads — available even when DEX is not.
  const stableContract = useMemo(() => {
    if (!provider || !stableConfig?.address) return null
    return new ethers.Contract(stableConfig.address, ERC20_ABI, provider)
  }, [provider, stableConfig])

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

    if (!provider || !address) return
    // Need at least stableContract or full DEX contracts to fetch anything useful
    if (!stableContract && !contracts) return

    try {
      setLoading(true)

      const nativeBalance = await provider.getBalance(address)

      // Fetch wnative only when DEX contracts are available
      const wnativeBalance = contracts
        ? await contracts.wnative.balanceOf(address)
        : 0n

      // Fetch stable balance from DEX contracts if available, otherwise
      // fall back to the standalone stableContract
      const stableReader = contracts?.stable || stableContract
      const stableBalance = stableReader
        ? await stableReader.balanceOf(address)
        : 0n

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
  }, [provider, address, contracts, stableContract, tokens.STABLE.decimals])

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

  // Symbol lookup for a token by address, used to label SDK Token instances so
  // the trade surface reads the right ticker on every chain.
  const symbolOf = useCallback((tokenAddress) => {
    const lower = tokenAddress?.toLowerCase?.()
    if (lower === addresses.STABLECOIN.toLowerCase()) return tokens.STABLE.symbol
    if (lower === addresses.WNATIVE.toLowerCase()) return tokens.WNATIVE.symbol
    return 'TOKEN'
  }, [addresses, tokens.STABLE.symbol, tokens.WNATIVE.symbol])

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

  // Route a quote across the common V3 fee tiers and return the best-execution
  // result decorated with Uniswap SDK figures (execution price, minimum
  // received after slippage, price impact) — the numbers a trading UI shows.
  const getBestQuote = useCallback(async (tokenIn, tokenOut, amountIn) => {
    if (!contracts) {
      throw new Error('DEX is not available on the current network')
    }

    setQuotingPrice(true)
    try {
      const decIn = decimalsOf(tokenIn)
      const decOut = decimalsOf(tokenOut)
      const amountInWei = ethers.parseUnits(amountIn, decIn)
      if (amountInWei <= 0n) {
        throw new Error('Enter an amount greater than zero')
      }

      // Probe each fee tier; QuoterV2 reverts where no pool exists, so we keep
      // the deepest output across the tiers that do quote — a lightweight route.
      let best = null
      for (const fee of ROUTED_FEE_TIERS) {
        try {
          const res = await contracts.quoter.quoteExactInputSingle.staticCall({
            tokenIn,
            tokenOut,
            amountIn: amountInWei,
            fee,
            sqrtPriceLimitX96: 0,
          })
          const out = res[0]
          if (out > 0n && (!best || out > best.amountOutWei)) {
            best = { fee, amountOutWei: out, gasEstimate: res[3] }
          }
        } catch {
          // No pool for this fee tier — skip it.
        }
      }

      if (!best) {
        throw new Error('No liquidity route available for this pair')
      }

      // Near-spot reference quote (a fraction of the size) on the winning tier,
      // used to derive price impact via the SDK. Optional — impact is hidden if
      // the reference quote is unavailable.
      let refInWei = amountInWei / 1000n
      if (refInWei <= 0n) refInWei = 1n
      let refAmountInRaw = null
      let refAmountOutRaw = null
      try {
        const refRes = await contracts.quoter.quoteExactInputSingle.staticCall({
          tokenIn,
          tokenOut,
          amountIn: refInWei,
          fee: best.fee,
          sqrtPriceLimitX96: 0,
        })
        if (refRes[0] > 0n) {
          refAmountInRaw = refInWei
          refAmountOutRaw = refRes[0]
        }
      } catch {
        // Impact figure is best-effort.
      }

      const sdkIn = toSdkToken(chainId, tokenIn, decIn, symbolOf(tokenIn))
      const sdkOut = toSdkToken(chainId, tokenOut, decOut, symbolOf(tokenOut))
      const metrics = buildTradeMetrics({
        tokenIn: sdkIn,
        tokenOut: sdkOut,
        amountInRaw: amountInWei,
        amountOutRaw: best.amountOutWei,
        refAmountInRaw,
        refAmountOutRaw,
        slippageBps: slippage,
      })

      return {
        amountOut: ethers.formatUnits(best.amountOutWei, decOut),
        amountOutWei: best.amountOutWei,
        feeTier: best.fee,
        gasEstimate: best.gasEstimate,
        executionPrice: metrics.executionPrice.toSignificant(6),
        executionPriceInverted: metrics.executionPrice.invert().toSignificant(6),
        minimumReceived: ethers.formatUnits(metrics.minimumReceivedRaw, decOut),
        minimumReceivedWei: metrics.minimumReceivedRaw,
        priceImpactPercent: metrics.priceImpact
          ? parseFloat(metrics.priceImpact.toSignificant(4))
          : null,
        tokenInSymbol: symbolOf(tokenIn),
        tokenOutSymbol: symbolOf(tokenOut),
      }
    } finally {
      setQuotingPrice(false)
    }
  }, [contracts, decimalsOf, symbolOf, chainId, slippage])

  const swap = useCallback(async (tokenIn, tokenOut, amountIn) => {
    if (!signer || !contracts || !address) {
      throw new Error('Wallet not connected')
    }

    try {
      setLoading(true)

      // Re-quote at execution time so the route and minimum-received we enforce
      // on-chain match the freshest price, not a stale on-screen figure.
      const quote = await getBestQuote(tokenIn, tokenOut, amountIn)

      const decIn = decimalsOf(tokenIn)
      const amountInWei = ethers.parseUnits(amountIn, decIn)
      const minAmountOutWei = quote.minimumReceivedWei

      // Spec 043 (US3, FR-022a): swap AS a vault → batch [approve, exactInputSingle] with recipient = the
      // vault, proposed as a threshold-gated vault transaction. Only in the vault queue until executed.
      if (operatingAsVault) {
        if (!canActAsVault) throw new Error("Switch to the vault's network to swap as the vault.")
        const erc20 = new ethers.Interface(ERC20_ABI)
        const approveData = erc20.encodeFunctionData('approve', [addresses.SWAP_ROUTER_02, amountInWei])
        const vaultParams = {
          tokenIn,
          tokenOut,
          fee: quote.feeTier,
          recipient: activeIdentity.vaultAddress,
          amountIn: amountInWei,
          amountOutMinimum: minAmountOutWei,
          sqrtPriceLimitX96: 0,
        }
        const swapData = contracts.swapRouter.interface.encodeFunctionData('exactInputSingle', [vaultParams])
        const res = await submitAsActive({
          batch: [
            { to: tokenIn, value: 0n, data: approveData },
            { to: addresses.SWAP_ROUTER_02, value: 0n, data: swapData },
          ],
        })
        return { proposed: true, safeTxHash: res.safeTxHash }
      }

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
        fee: quote.feeTier,
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
  }, [signer, contracts, address, getBestQuote, fetchBalances, decimalsOf, addresses, operatingAsVault, canActAsVault, activeIdentity, submitAsActive])

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
    getBestQuote,
    swap,
    setSlippage,

    tokens,
    addresses,
    isDexAvailable,
    dexProvider,
    chainId,
    network,
  }

  return (
    <DexContext.Provider value={value}>
      {children}
    </DexContext.Provider>
  )
}
