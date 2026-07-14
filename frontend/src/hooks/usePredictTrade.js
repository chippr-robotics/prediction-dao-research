/**
 * usePredictTrade (spec 057) — orchestrates a buy/sell CLOB trade for one market outcome via the official
 * viem-native @polymarket/clob-client, CLIENT-DIRECT to clob.polymarket.com (CLOB V2 binds every order to
 * its signer, so a shared gateway key can't relay orders — each member trades with their OWN derived creds).
 *
 * Flow: check the region (Polymarket geoblock) → verify the account can sign → load the honest fee schedule
 * → enable trading (derive the member's CLOB creds, one gasless signature, cached per session) → submit
 * (the SDK builds/signs/posts the order and stacks FairWins' POLY_BUILDER_* attribution via the gateway).
 *
 * Honest-state guarantees: restricted regions get an honest notice + a deep link OUT to Polymarket (we
 * respect Polymarket's regional policy, never bypass it, FR-019); signing is blocked when the fee schedule
 * can't be confirmed (FR-010) or the account can't sign (FR-019); the previewed builder fee is always a
 * visible line (FR-012); on any error the member still has the "trade on Polymarket" path (FR-017). All
 * external calls are injectable for tests.
 */
import { useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useChainId, useWalletClient } from 'wagmi'
import { WalletContext } from '../contexts/WalletContext.js'
import { getCurrentChainId } from '../config/networks'
import { computeCost as defaultComputeCost } from '../lib/predict/clobOrder'
import { resolveTradeSigner as defaultResolveTradeSigner } from '../lib/predict/tradeSigner'
import { fetchFeeRate as defaultFetchFeeRate, predictGatewayUrl } from '../lib/predict/predictClient'
import { checkGeoblock as defaultCheckGeoblock } from '../lib/predict/geoblock'
import {
  ensureClobCreds as defaultEnsureCreds,
  makeClobClient as defaultMakeClient,
  makeBuilderConfig as defaultMakeBuilderConfig,
  submitOrder as defaultSubmitOrder,
  cancelOrder as defaultCancelOrder,
  loadCachedCreds as defaultLoadCachedCreds,
} from '../lib/predict/clobSession'

const POLYGON = 137
const isRegionError = (e) =>
  e?.raw?.status === 403 || e?.status === 403 || /geoblock|restricted in your region|region/i.test(String(e?.message ?? e?.raw?.error ?? ''))
const isPriceMove = (e) => /price|tick|marketable|not enough|match/i.test(String(e?.message ?? e?.raw?.error ?? ''))

export function usePredictTrade(options = {}) {
  const optionDeps = options.deps
  const deps = useMemo(
    () => ({
      checkGeoblock: defaultCheckGeoblock,
      fetchFeeRate: defaultFetchFeeRate,
      ensureCreds: defaultEnsureCreds,
      makeClient: defaultMakeClient,
      makeBuilderConfig: defaultMakeBuilderConfig,
      submitOrder: defaultSubmitOrder,
      cancelOrder: defaultCancelOrder,
      computeCost: defaultComputeCost,
      resolveTradeSigner: defaultResolveTradeSigner,
      loadCachedCreds: defaultLoadCachedCreds,
      gatewayUrl: predictGatewayUrl,
      ...optionDeps,
    }),
    [optionDeps]
  )
  const walletCtx = useContext(WalletContext)
  const wallet = useMemo(() => walletCtx || {}, [walletCtx])
  const { data: hookWalletClient } = useWalletClient()
  const walletClient = options.walletClient ?? hookWalletClient
  const activeChainId = useChainId() || getCurrentChainId()

  const [status, setStatus] = useState('idle') // idle|checking|geoblocked|blocked|ready|enabling|signing|submitting|done|error
  const [reason, setReason] = useState(null)
  const [geoInfo, setGeoInfo] = useState(null)
  const [fee, setFee] = useState(null)
  const [result, setResult] = useState(null)
  const reqRef = useRef(0)

  const onWrongNetwork = Number(activeChainId) !== POLYGON

  const signer = useMemo(
    () =>
      deps.resolveTradeSigner({
        loginMethod: wallet.loginMethod,
        walletClient,
        address: wallet.address,
      }),
    [wallet.loginMethod, wallet.address, walletClient, deps]
  )

  const tradingEnabled = useMemo(
    () => Boolean(wallet.address && deps.loadCachedCreds(wallet.address)),
    [wallet.address, deps]
  )

  /** Ensure the wallet is on Polygon before an order bound to it is signed (FR-021). */
  const ensureNetwork = useCallback(async () => {
    if (!onWrongNetwork) return true
    try {
      if (wallet.switchChain) await wallet.switchChain({ chainId: POLYGON })
      else if (wallet.switchNetwork) await wallet.switchNetwork(POLYGON)
      else return false
      return true
    } catch {
      return false
    }
  }, [onWrongNetwork, wallet])

  /** Region check + live fee schedule. Restricted region -> 'geoblocked' (link out); fee failure -> blocked. */
  const loadFee = useCallback(
    async (tokenId) => {
      if (!signer.canSign) {
        setStatus('blocked')
        setReason(signer.reason)
        return null
      }
      const req = ++reqRef.current
      setStatus('checking')
      setReason(null)
      setGeoInfo(null)
      try {
        const geo = await deps.checkGeoblock()
        if (req !== reqRef.current) return null
        if (geo?.blocked) {
          setGeoInfo({ country: geo.country, region: geo.region })
          setStatus('geoblocked')
          return null
        }
        const f = await deps.fetchFeeRate(POLYGON, tokenId)
        if (req !== reqRef.current) return null
        setFee(f)
        setStatus('ready')
        return f
      } catch {
        if (req !== reqRef.current) return null
        setStatus('blocked')
        setReason("Couldn't confirm the fees — try again before trading.")
        return null
      }
    },
    [signer, deps]
  )

  /** Pure preview of the honest total/net (incl. the additive builder fee) — nothing signed. */
  const preview = useCallback((params) => (fee ? deps.computeCost(params, fee) : null), [fee, deps])

  /** Derive (or reuse) the member's own CLOB creds — one gasless wallet signature, cached per session. */
  const ensureCreds = useCallback(async () => {
    return deps.ensureCreds(walletClient, { address: wallet.address })
  }, [deps, walletClient, wallet.address])

  /** Explicit "enable trading" step (derive creds up front). Optional — submit() does it lazily too. */
  const enableTrading = useCallback(async () => {
    if (!signer.canSign) {
      setStatus('blocked')
      setReason(signer.reason)
      return false
    }
    setStatus('enabling')
    setReason(null)
    try {
      await ensureCreds()
      setStatus('ready')
      return true
    } catch (e) {
      setStatus('error')
      setReason(e?.message || 'Could not enable trading. You can still trade on Polymarket directly.')
      return false
    }
  }, [signer, ensureCreds])

  /** Build + sign + submit an order (the SDK does all three; attribution rides on the builder config). */
  const submit = useCallback(
    async (params, { negRisk = false } = {}) => {
      if (!fee || !signer.canSign) {
        setStatus('blocked')
        setReason(signer.reason || "Couldn't confirm the fees.")
        return null
      }
      if (!(await ensureNetwork())) {
        setStatus('error')
        setReason('Switch your wallet to Polygon to trade on Polymarket.')
        return null
      }
      const req = ++reqRef.current
      setStatus('signing')
      setReason(null)
      try {
        const creds = await ensureCreds()
        if (req !== reqRef.current) return null
        const builderConfig = deps.makeBuilderConfig(deps.gatewayUrl(), POLYGON)
        const client = deps.makeClient(walletClient, creds, { builderConfig })
        setStatus('submitting')
        const submitted = await deps.submitOrder(client, {
          tokenId: params.tokenId,
          side: params.side,
          price: params.price,
          size: params.size,
          negRisk,
        })
        if (req !== reqRef.current) return null
        if (isRegionError(submitted)) {
          setGeoInfo(null)
          setStatus('geoblocked')
          return null
        }
        setResult({ kind: 'submitted', ...submitted })
        setStatus('done')
        return submitted
      } catch (e) {
        if (req !== reqRef.current) return null
        if (isRegionError(e)) {
          setStatus('geoblocked')
          return null
        }
        if (isPriceMove(e)) {
          setStatus('error')
          setReason('The market moved — review the current price before trading.')
          return { priceChanged: true }
        }
        setStatus('error')
        setReason(e?.message || 'The order could not be submitted. You can still trade on Polymarket directly.')
        return null
      }
    },
    [fee, signer, ensureNetwork, ensureCreds, walletClient, deps]
  )

  /** Cancel an open order (gas-free CLOB cancel) with the member's own creds. */
  const cancel = useCallback(
    async (order) => {
      if (!signer.canSign) {
        setStatus('blocked')
        setReason(signer.reason)
        return null
      }
      const req = ++reqRef.current
      setStatus('submitting')
      setReason(null)
      try {
        const creds = await ensureCreds()
        const client = deps.makeClient(walletClient, creds, {})
        const res = await deps.cancelOrder(client, order.orderId ?? order.id)
        if (req !== reqRef.current) return null
        setResult({ kind: 'cancelled', ...res })
        setStatus('done')
        return res
      } catch (e) {
        if (req !== reqRef.current) return null
        setStatus('error')
        setReason(e?.message || 'The order could not be cancelled. You can still cancel it on Polymarket.')
        return null
      }
    },
    [signer, ensureCreds, walletClient, deps]
  )

  const reset = useCallback(() => {
    reqRef.current++
    setStatus('idle')
    setReason(null)
    setResult(null)
    setGeoInfo(null)
  }, [])

  return {
    status,
    reason,
    geoInfo,
    fee,
    result,
    canTrade: signer.canSign,
    unsupportedReason: signer.canSign ? null : signer.reason,
    onWrongNetwork,
    tradingEnabled,
    loadFee,
    preview,
    enableTrading,
    submit,
    cancel,
    reset,
  }
}

export default usePredictTrade
