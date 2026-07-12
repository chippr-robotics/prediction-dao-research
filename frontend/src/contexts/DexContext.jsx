import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useChainId } from 'wagmi'
import { useWallet } from '../hooks/useWalletManagement'
import { useActiveAccount } from '../hooks/useActiveAccount'
import { FEE_TIERS, DEFAULT_SLIPPAGE } from '../constants/dex'
import { getNetwork, getCurrentChainId } from '../config/networks'
import { getPortfolioRegistry } from '../config/assetTaxonomy'
import { ERC20_ABI } from '../abis/ERC20'
import { WNATIVE_ABI } from '../abis/WNative'
import { SWAP_ROUTER_02_ABI } from '../abis/SwapRouter02'
import { QUOTER_V2_ABI } from '../abis/QuoterV2'
import { DexContext } from './DexContext'
import { toSdkToken, buildTradeMetrics, ROUTED_FEE_TIERS } from '../lib/uniswap/trade'
import { makeReadProvider } from '../utils/rpcProvider'
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
  const { provider, address, isConnected, sendCalls } = useWallet()
  // Spec 043 (US3): swapping while operating as a vault becomes a threshold-gated vault proposal.
  const { isVault: operatingAsVault, canActAsVault, identity: activeIdentity, submit: submitAsActive } = useActiveAccount()
  const wagmiChainId = useChainId()
  const chainId = wagmiChainId || getCurrentChainId()
  const network = getNetwork(chainId)

  // Reads must not depend on a wallet signer-provider: passkey sessions have
  // none (WalletContext leaves provider/signer null), yet they still need
  // balances and quotes. Fall back to the chain's public read provider, the
  // same pattern Portfolio and Earn use.
  const readProvider = useMemo(() => {
    if (provider) return provider
    if (!network?.rpcUrl) return null
    return makeReadProvider(network.rpcUrl, chainId)
  }, [provider, network?.rpcUrl, chainId])

  // The account whose funds the trade ticket represents: the vault when the
  // member operates as one (on the vault's own network), else the connected
  // wallet. Balances and swap recipients follow this address so "available to
  // trade" is accurate for the selected account (Spec 043).
  const tradingAddress = operatingAsVault && canActAsVault ? activeIdentity.vaultAddress : address

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

  // The tradeable universe for the active chain: every fungible ERC-20 the
  // portfolio registry knows about on this network (wrapped native + stablecoin
  // from app-config, plus curated commodities/tools/stables) — i.e. the
  // portfolio assets that have a routeable pair on a chain we support. Native
  // coins (must be wrapped first) and NFT credentials are excluded. Swaps
  // execute on the active chain, so the list is per-chain (honest-state: we only
  // offer what can actually route here). Falls back to []/no-DEX cleanly.
  const tradeTokens = useMemo(() => {
    if (!isDexAvailable) return []
    return getPortfolioRegistry(chainId)
      .filter((entry) => entry.kind === 'erc20' && entry.address)
      .map((entry) => ({
        address: entry.address,
        symbol: entry.symbol,
        name: entry.name,
        decimals: entry.decimals,
      }))
  }, [chainId, isDexAvailable])

  // Address → metadata lookup so quote/swap math uses the right decimals and
  // ticker for any tradeable token, not just wrapped-native and the stablecoin.
  const tokenMeta = useMemo(() => {
    const map = new Map()
    for (const t of tradeTokens) map.set(t.address.toLowerCase(), t)
    return map
  }, [tradeTokens])

  const [balances, setBalances] = useState({
    native: '0',
    wnative: '0',
    stable: '0',
    tokens: {},
  })

  const [balanceHistory, setBalanceHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [quotingPrice, setQuotingPrice] = useState(false)
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)

  // Stablecoin contract for balance reads — available even when DEX is not.
  const stableContract = useMemo(() => {
    if (!readProvider || !stableConfig?.address) return null
    return new ethers.Contract(stableConfig.address, ERC20_ABI, readProvider)
  }, [readProvider, stableConfig])

  const contracts = useMemo(() => {
    if (!readProvider || !isDexAvailable) return null

    return {
      wnative: new ethers.Contract(addresses.WNATIVE, WNATIVE_ABI, readProvider),
      stable: new ethers.Contract(addresses.STABLECOIN, ERC20_ABI, readProvider),
      swapRouter: new ethers.Contract(addresses.SWAP_ROUTER_02, SWAP_ROUTER_02_ABI, readProvider),
      quoter: new ethers.Contract(addresses.QUOTER_V2, QUOTER_V2_ABI, readProvider),
    }
  }, [readProvider, isDexAvailable, addresses])

  const fetchBalances = useCallback(async () => {
    if (import.meta.env.VITE_SKIP_BLOCKCHAIN_CALLS === 'true') {
      return
    }

    if (!readProvider || !tradingAddress) return
    // Need at least stableContract or full DEX contracts to fetch anything useful
    if (!stableContract && !contracts) return

    try {
      setLoading(true)

      const nativeBalance = await readProvider.getBalance(tradingAddress)

      // Fetch wnative only when DEX contracts are available
      const wnativeBalance = contracts
        ? await contracts.wnative.balanceOf(tradingAddress)
        : 0n

      // Fetch stable balance from DEX contracts if available, otherwise
      // fall back to the standalone stableContract
      const stableReader = contracts?.stable || stableContract
      const stableBalance = stableReader
        ? await stableReader.balanceOf(tradingAddress)
        : 0n

      const newBalances = {
        native: ethers.formatEther(nativeBalance),
        wnative: ethers.formatEther(wnativeBalance),
        stable: ethers.formatUnits(stableBalance, tokens.STABLE.decimals),
      }

      // Balances for the rest of the tradeable set (curated commodities/tools/
      // stables) so the ticket's "available to trade" line is accurate for any
      // selected asset, not just wrapped-native/stablecoin. Read-only, a handful
      // of tokens per chain, tolerant of per-token failure.
      const wnativeLower = addresses.WNATIVE.toLowerCase()
      const stableLower = addresses.STABLECOIN.toLowerCase()
      const tokenBalances = {
        [wnativeLower]: newBalances.wnative,
        [stableLower]: newBalances.stable,
      }
      const extraTokens = tradeTokens.filter((t) => {
        const lower = t.address.toLowerCase()
        return lower !== wnativeLower && lower !== stableLower
      })
      await Promise.all(
        extraTokens.map(async (t) => {
          try {
            const erc20 = new ethers.Contract(t.address, ERC20_ABI, readProvider)
            const bal = await erc20.balanceOf(tradingAddress)
            tokenBalances[t.address.toLowerCase()] = ethers.formatUnits(bal, t.decimals)
          } catch {
            tokenBalances[t.address.toLowerCase()] = '0'
          }
        }),
      )
      newBalances.tokens = tokenBalances

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
  }, [readProvider, tradingAddress, contracts, stableContract, tokens.STABLE.decimals, tradeTokens, addresses])

  // Reset balances when the chain or the active account changes so the user
  // doesn't see stale numbers (e.g. personal balances while operating as a vault).
  useEffect(() => {
    setBalances({ native: '0', wnative: '0', stable: '0', tokens: {} })
    setBalanceHistory([])
  }, [chainId, tradingAddress])

  useEffect(() => {
    if (isConnected) {
      fetchBalances()
      const interval = setInterval(fetchBalances, 300000)
      return () => clearInterval(interval)
    }
  }, [isConnected, fetchBalances])

  // Wrap/unwrap ride the unified spec-041 write rail (WalletContext.sendCalls)
  // so BOTH session kinds work: passkey sessions authorize with one WebAuthn
  // ceremony (they have no ethers signer), classic wallets sign per call.
  // Operating as a vault turns the action into a threshold-gated proposal.
  const wrapNative = useCallback(async (amount) => {
    if (!contracts) {
      throw new Error('DEX is not available on the current network')
    }

    try {
      setLoading(true)
      const amountWei = ethers.parseEther(amount)
      const data = contracts.wnative.interface.encodeFunctionData('deposit', [])
      const call = { to: addresses.WNATIVE, value: amountWei, data }

      if (operatingAsVault) {
        if (!canActAsVault) throw new Error("Switch to the vault's network to act as the vault.")
        const res = await submitAsActive({ batch: [call] })
        return { proposed: true, safeTxHash: res.safeTxHash }
      }

      if (typeof sendCalls !== 'function') throw new Error('Wallet not connected')
      const res = await sendCalls([call])
      if (res?.state === 'failed') throw new Error(res.reason || 'Transaction failed')

      await fetchBalances()
      return res
    } catch (error) {
      console.error('Error wrapping native:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [contracts, addresses, operatingAsVault, canActAsVault, submitAsActive, sendCalls, fetchBalances])

  const unwrapNative = useCallback(async (amount) => {
    if (!contracts) {
      throw new Error('DEX is not available on the current network')
    }

    try {
      setLoading(true)
      const amountWei = ethers.parseEther(amount)
      const data = contracts.wnative.interface.encodeFunctionData('withdraw', [amountWei])
      const call = { to: addresses.WNATIVE, value: 0n, data }

      if (operatingAsVault) {
        if (!canActAsVault) throw new Error("Switch to the vault's network to act as the vault.")
        const res = await submitAsActive({ batch: [call] })
        return { proposed: true, safeTxHash: res.safeTxHash }
      }

      if (typeof sendCalls !== 'function') throw new Error('Wallet not connected')
      const res = await sendCalls([call])
      if (res?.state === 'failed') throw new Error(res.reason || 'Transaction failed')

      await fetchBalances()
      return res
    } catch (error) {
      console.error('Error unwrapping native:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [contracts, addresses, operatingAsVault, canActAsVault, submitAsActive, sendCalls, fetchBalances])

  // Decimals lookup for a token by address used in quote/swap calls below.
  // Defaults to 18 (native/wrapped) when the token isn't in our known set.
  const decimalsOf = useCallback((tokenAddress) => {
    const lower = tokenAddress?.toLowerCase?.()
    if (lower === addresses.STABLECOIN.toLowerCase()) return tokens.STABLE.decimals
    if (lower === addresses.WNATIVE.toLowerCase()) return 18
    return tokenMeta.get(lower)?.decimals ?? 18
  }, [addresses, tokens.STABLE.decimals, tokenMeta])

  // Symbol lookup for a token by address, used to label SDK Token instances so
  // the trade surface reads the right ticker on every chain.
  const symbolOf = useCallback((tokenAddress) => {
    const lower = tokenAddress?.toLowerCase?.()
    if (lower === addresses.STABLECOIN.toLowerCase()) return tokens.STABLE.symbol
    if (lower === addresses.WNATIVE.toLowerCase()) return tokens.WNATIVE.symbol
    return tokenMeta.get(lower)?.symbol ?? 'TOKEN'
  }, [addresses, tokens.STABLE.symbol, tokens.WNATIVE.symbol, tokenMeta])

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

  /**
   * Execute (or, as a vault, propose) a swap.
   *
   * `opts.limitMinOutWei` — a Limit order's floor: the member's limit price
   * expressed as the minimum output amount. Uniswap V3 enforces it on-chain
   * via `amountOutMinimum`, making the order immediate-or-cancel — it fills at
   * the limit or better, or not at all. We pre-check against the fresh quote
   * so an unfillable limit fails with a plain reason before any wallet prompt.
   */
  const swap = useCallback(async (tokenIn, tokenOut, amountIn, opts = {}) => {
    if (!contracts || !tradingAddress) {
      throw new Error('Wallet not connected')
    }

    try {
      setLoading(true)

      // Re-quote at execution time so the route and minimum-received we enforce
      // on-chain match the freshest price, not a stale on-screen figure.
      const quote = await getBestQuote(tokenIn, tokenOut, amountIn)

      const decIn = decimalsOf(tokenIn)
      const amountInWei = ethers.parseUnits(amountIn, decIn)
      const isLimit = opts.limitMinOutWei != null
      const minAmountOutWei = isLimit ? BigInt(opts.limitMinOutWei) : quote.minimumReceivedWei

      if (isLimit && quote.amountOutWei < minAmountOutWei) {
        throw new Error(
          'The market is below your limit price right now — the order was not placed. Nothing was moved.'
        )
      }

      const erc20 = new ethers.Interface(ERC20_ABI)
      const swapParams = (recipient) => ({
        tokenIn,
        tokenOut,
        fee: quote.feeTier,
        recipient,
        amountIn: amountInWei,
        amountOutMinimum: minAmountOutWei,
        sqrtPriceLimitX96: 0,
      })

      // Spec 043 (US3, FR-022a): swap AS a vault → batch [approve, exactInputSingle] with recipient = the
      // vault, proposed as a threshold-gated vault transaction. Only in the vault queue until executed.
      if (operatingAsVault) {
        if (!canActAsVault) throw new Error("Switch to the vault's network to swap as the vault.")
        const approveData = erc20.encodeFunctionData('approve', [addresses.SWAP_ROUTER_02, amountInWei])
        const swapData = contracts.swapRouter.interface.encodeFunctionData('exactInputSingle', [
          swapParams(activeIdentity.vaultAddress),
        ])
        const res = await submitAsActive({
          batch: [
            { to: tokenIn, value: 0n, data: approveData },
            { to: addresses.SWAP_ROUTER_02, value: 0n, data: swapData },
          ],
        })
        return { proposed: true, safeTxHash: res.safeTxHash }
      }

      // Personal mode rides the unified spec-041 write rail: one batch through
      // sendCalls covers approval (only when needed, for the exact amount) and
      // the swap — a single WebAuthn ceremony for passkey sessions, sequential
      // signed transactions for classic wallets.
      if (typeof sendCalls !== 'function') throw new Error('Wallet not connected')

      const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, readProvider)
      const allowance = await tokenInContract.allowance(tradingAddress, addresses.SWAP_ROUTER_02)

      const calls = []
      if (allowance < amountInWei) {
        calls.push({
          to: tokenIn,
          value: 0n,
          data: erc20.encodeFunctionData('approve', [addresses.SWAP_ROUTER_02, amountInWei]),
        })
      }
      calls.push({
        to: addresses.SWAP_ROUTER_02,
        value: 0n,
        data: contracts.swapRouter.interface.encodeFunctionData('exactInputSingle', [
          swapParams(tradingAddress),
        ]),
      })

      const res = await sendCalls(calls)
      if (res?.state === 'failed') throw new Error(res.reason || 'Transaction failed')

      await fetchBalances()
      return res
    } catch (error) {
      console.error('Error performing swap:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [contracts, tradingAddress, readProvider, getBestQuote, fetchBalances, decimalsOf, addresses, operatingAsVault, canActAsVault, activeIdentity, submitAsActive, sendCalls])

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
    tradeTokens,
    addresses,
    isDexAvailable,
    dexProvider,
    chainId,
    network,
    tradingAddress,
  }

  return (
    <DexContext.Provider value={value}>
      {children}
    </DexContext.Provider>
  )
}
