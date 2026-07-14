/**
 * usePredictTrade (spec 057) — orchestrates a buy/sell CLOB trade for one market outcome: fetch the
 * live fee schedule → verify network (Polygon) + account can sign → confirm (honest total incl. the
 * additive builder fee) → sign (EOA or passkey) → submit through the builder-code-attaching gateway.
 * The state machine mirrors useCollectibleSell.
 *
 * Honest-state guarantees: signing is BLOCKED when the fee schedule can't be confirmed (FR-010) or the
 * account type can't sign (FR-019, honest reason — never a dead button); the previewed total EQUALS
 * the submitted order's cost (FR-011, both from buildOrder); the builder fee is always a visible line
 * (FR-012); on any error the member still has the "trade on Polymarket" path (never stranded, FR-017).
 * All external calls are injectable for tests.
 */
import { useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useChainId } from 'wagmi'
import { WalletContext } from '../contexts/WalletContext.js'
import { getCurrentChainId } from '../config/networks'
import { buildOrder as defaultBuildOrder, computeCost as defaultComputeCost, ZERO_BYTES32 } from '../lib/predict/clobOrder'
import { resolveTradeSigner as defaultResolveTradeSigner } from '../lib/predict/tradeSigner'
import {
  fetchFeeRate as defaultFetchFeeRate,
  submitOrder as defaultSubmitOrder,
  cancelOrder as defaultCancelOrder,
} from '../lib/predict/predictClient'

const POLYGON = 137

export function usePredictTrade(options = {}) {
  const optionDeps = options.deps
  const deps = useMemo(
    () => ({
      fetchFeeRate: defaultFetchFeeRate,
      submitOrder: defaultSubmitOrder,
      cancelOrder: defaultCancelOrder,
      buildOrder: defaultBuildOrder,
      computeCost: defaultComputeCost,
      resolveTradeSigner: defaultResolveTradeSigner,
      ...optionDeps,
    }),
    [optionDeps]
  )
  const walletCtx = useContext(WalletContext)
  const wallet = useMemo(() => walletCtx || {}, [walletCtx])
  const activeChainId = useChainId() || getCurrentChainId()

  const [status, setStatus] = useState('idle') // idle|checking|ready|blocked|signing|submitting|done|error
  const [reason, setReason] = useState(null)
  const [fee, setFee] = useState(null)
  const [result, setResult] = useState(null)
  const reqRef = useRef(0)

  const onWrongNetwork = Number(activeChainId) !== POLYGON

  const signer = useMemo(
    () =>
      deps.resolveTradeSigner({
        loginMethod: wallet.loginMethod,
        signer: wallet.signer,
        address: wallet.address,
        chainId: POLYGON,
        passkey: options.passkey,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wallet.loginMethod, wallet.signer, wallet.address, options.passkey]
  )

  /** Ensure the wallet is on Polygon before signing an order bound to it (FR-021). */
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

  /** Load the live fee schedule for the outcome token. Fee failure BLOCKS signing (FR-010). */
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
      try {
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
  const preview = useCallback(
    (params) => {
      if (!fee) return null
      // Buys surface totalCostUnits; sells surface netProceedsUnits — both carried on the result.
      return deps.computeCost(params, fee)
    },
    [fee, deps]
  )

  /** Build + sign + submit an order carrying the builder code. */
  const submit = useCallback(
    async (params, { builder, negRisk = false } = {}) => {
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
        const built = deps.buildOrder(params, fee, builder || ZERO_BYTES32, { maker: wallet.address, negRisk })
        const signature = await signer.sign(built.domain, built.types, built.message)
        if (req !== reqRef.current) return null
        setStatus('submitting')
        const submitted = await deps.submitOrder(POLYGON, { order: built.message, signature })
        if (req !== reqRef.current) return null
        setResult({ kind: 'submitted', ...submitted, total: built.totalCost, net: built.netProceeds })
        setStatus('done')
        return submitted
      } catch (e) {
        if (req !== reqRef.current) return null
        // A price move isn't a failure — ask the member to re-confirm the current price (FR-008).
        if (e?.code === 'price_changed') {
          setStatus('error')
          setReason('The market moved — review the current price before trading.')
          return { priceChanged: true }
        }
        setStatus('error')
        setReason(e?.message || 'The order could not be submitted. You can still trade on Polymarket directly.')
        return null
      }
    },
    [fee, signer, ensureNetwork, wallet, deps]
  )

  /** Cancel an open order (gas-free CLOB cancel). */
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
        let signature
        try {
          signature = wallet.signer?.signMessage ? await wallet.signer.signMessage(`cancel:${order.orderId}`) : undefined
        } catch {
          signature = undefined
        }
        const res = await deps.cancelOrder(POLYGON, { orderId: order.orderId, address: wallet.address, signature })
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
    [signer, wallet, deps]
  )

  const reset = useCallback(() => {
    reqRef.current++
    setStatus('idle')
    setReason(null)
    setResult(null)
  }, [])

  return {
    status,
    reason,
    fee,
    result,
    canTrade: signer.canSign,
    unsupportedReason: signer.canSign ? null : signer.reason,
    onWrongNetwork,
    loadFee,
    preview,
    submit,
    cancel,
    reset,
  }
}

export default usePredictTrade
