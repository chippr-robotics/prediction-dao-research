/**
 * useBridgeAvailability (spec 067, US1 — T083) — can this member start a bridge on
 * this network right now, and if not, WHY.
 *
 * FR-051/FR-052 make availability an operator-driven, runtime fact: the router is the
 * source of truth for whether bridging is open, and what it says is only as good as the
 * last time we could read it. So this hook never guesses. Every path that cannot
 * establish "bridging is open" returns a reason, and the reason is specific enough for
 * the member to know whether to wait, switch networks, or do nothing:
 *
 *   bitcoin             Bitcoin is not an EVM network and never bridges (FR-006).
 *                       Answered from the STRING id alone — Bitcoin ids must never reach
 *                       `getContractAddressForChain`, `getNetwork` or wagmi (spec 061).
 *   no_protocol         The settlement protocol is not deployed on this network at all
 *                       (Ethereum Classic, Mordor — FR-006c). Not a fault; permanent here.
 *   router_undeployed   Protocol yes, FairWins bridge contract no — not synced into the
 *                       generated config for this network yet.
 *   router_unreachable  The contract exists but we could not read it, so we withhold
 *                       availability rather than invent it (FR-051).
 *   paused              The router itself says bridging is paused (GUARDIAN pause).
 *   gateway             No pricing service is configured or it cannot be reached, so no
 *                       honest quote can be produced (FR-053).
 *
 * `asOf` is the timestamp of the last completed read, so the surface can say "as of"
 * honestly (FR-052). Already-submitted transfers are unaffected by every one of these
 * states — they keep reconciling in `BridgeStatusList` — which is what keeps a member
 * from ever being stranded mid-flow (FR-053).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWallet } from './useWalletManagement'
import { NETWORKS } from '../config/networks'
import { isBitcoinNetworkId } from '../config/bitcoinNetworks'
import { makeReadProvider } from '../utils/rpcProvider'
import { getBridgeRouterAddress, isEvmChainId, readBridgeRouterConfig } from '../lib/bridge/bridgeRouter'
import { bridgeGatewayUrl } from '../lib/bridge/acrossQuotes'

/** Why bridging is not on offer. Exported so the notice and its tests share one vocabulary. */
export const BRIDGE_UNAVAILABLE_REASON = Object.freeze({
  BITCOIN: 'bitcoin',
  NO_PROTOCOL: 'no_protocol',
  ROUTER_UNDEPLOYED: 'router_undeployed',
  ROUTER_UNREACHABLE: 'router_unreachable',
  PAUSED: 'paused',
  GATEWAY: 'gateway',
})

/**
 * The reasons that need no network read, in the order they answer.
 *
 * Pure and exported for tests and for any surface that has to decide before it has a
 * provider: `null` here does NOT mean available, only that nothing disqualifies the
 * network up front — the router read still has to succeed.
 *
 * @param {number|string} chainId
 * @returns {string|null} a `BRIDGE_UNAVAILABLE_REASON`, or null
 */
export function staticBridgeReason(chainId) {
  if (isBitcoinNetworkId(chainId)) return BRIDGE_UNAVAILABLE_REASON.BITCOIN
  if (!isEvmChainId(chainId) || !NETWORKS[chainId]?.capabilities?.bridge) {
    return BRIDGE_UNAVAILABLE_REASON.NO_PROTOCOL
  }
  if (bridgeGatewayUrl() === '') return BRIDGE_UNAVAILABLE_REASON.GATEWAY
  return null
}

/**
 * @param {{chainId?: number|string}} [options] chain to test; defaults to the wallet's active one
 * @returns {{status: string, available: boolean, reason: string|null, chainId: number|string|null,
 *   config: object|null, asOf: number|null, refresh: Function}}
 */
export function useBridgeAvailability({ chainId: overrideChainId } = {}) {
  const wallet = useWallet() || {}
  const chainId = overrideChainId ?? wallet.chainId ?? null

  const [state, setState] = useState({ status: 'loading', reason: null, config: null, asOf: null })
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current
    const settle = (next) => {
      if (reqId === reqIdRef.current) setState({ ...next, asOf: Date.now() })
    }

    const staticReason = staticBridgeReason(chainId)
    if (staticReason) return settle({ status: 'unavailable', reason: staticReason, config: null })

    // Address keys come from the generated config only. An undeployed router is a
    // deployment state, not a fault, and says so rather than failing a read.
    if (!getBridgeRouterAddress(chainId)) {
      return settle({ status: 'unavailable', reason: BRIDGE_UNAVAILABLE_REASON.ROUTER_UNDEPLOYED, config: null })
    }

    let config = null
    try {
      config = await readBridgeRouterConfig({
        chainId,
        provider: makeReadProvider(NETWORKS[chainId]?.rpcUrl, chainId),
      })
    } catch {
      config = null
    }
    // `readBridgeRouterConfig` returns null when even `paused()` could not be read. We
    // do not get to assume "not paused" from a failed read (FR-051).
    if (!config) {
      return settle({ status: 'unavailable', reason: BRIDGE_UNAVAILABLE_REASON.ROUTER_UNREACHABLE, config: null })
    }
    if (config.paused) {
      return settle({ status: 'unavailable', reason: BRIDGE_UNAVAILABLE_REASON.PAUSED, config })
    }
    return settle({ status: 'available', reason: null, config })
  }, [chainId])

  // Network change: hard reset so one network's answer never stands in for another's.
  useEffect(() => {
    reqIdRef.current += 1
    setState({ status: 'loading', reason: null, config: null, asOf: null })
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId])

  return useMemo(
    () => ({
      status: state.status,
      available: state.status === 'available',
      reason: state.reason,
      chainId,
      config: state.config,
      asOf: state.asOf,
      refresh: load,
    }),
    [state, chainId, load],
  )
}

export default useBridgeAvailability
