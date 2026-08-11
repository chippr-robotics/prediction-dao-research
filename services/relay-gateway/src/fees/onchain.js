/**
 * FeeRouter on-chain rate reader (spec 060).
 *
 * The FeeRouter contract is the single source of truth for FairWins' configurable platform fees;
 * the gateway READS the Polymarket builder taker/maker bps from it so an admin's on-chain change is
 * live on every member surface within the cache TTL — with no gateway redeploy and no new gateway
 * mutability (the gateway stays stateless; this is a cached eth_call, nothing more).
 *
 * Honesty rules:
 *   - values read from chain are CLAMPED to the spec-057 caps (100 taker / 50 maker) before being
 *     served — the contract enforces the caps too, so a clamp firing is logged as a warning;
 *   - on a read failure the last good value is served while it is still fresh-ish (<= 10x TTL),
 *     else null — callers fall back to the env-configured bps and mark `source: 'env-fallback'`;
 *   - a router that is not configured at all returns null immediately (pre-060 behavior).
 */
import { ethers } from 'ethers'

const FEE_BPS_IFACE = new ethers.Interface(['function feeBps(bytes32 serviceId) view returns (uint16)'])

export const FEE_SERVICE_IDS = {
  polymarketTaker: ethers.id('polymarket.taker'),
  polymarketMaker: ethers.id('polymarket.maker'),
  // Spec 067. The gateway only ever READS these — the bridge and liquidity fees are charged
  // on-chain by BridgeRouter/LiquidityRouter, which read the same FeeRouter at call time. The
  // gateway never becomes a second source of truth for a rate.
  bridgeTransfer: ethers.id('bridge.transfer'),
  liquidityDeposit: ethers.id('liquidity.deposit'),
  // Spec 082. The Hyperliquid builder fee is the one platform-priced perps rate; the gateway
  // READS it for /v1/perps/config and member disclosure — enforcement happens when an order
  // carries the builder tuple (execution spec), and the rate's home stays the FeeRouter.
  perpsHlBuilder: ethers.id('perps.hyperliquid.builder'),
}

// Spec-067 caps, re-applied at read time like the spec-057 ones above (defense in depth).
export const BRIDGE_TRANSFER_CAP_BPS = 250
export const LIQUIDITY_DEPOSIT_CAP_BPS = 250

// Spec-057 hard caps, re-applied at read time (defense in depth).
const TAKER_CAP_BPS = 100
const MAKER_CAP_BPS = 50

// Spec-082 cap: Hyperliquid's own 10 bps limit on perps builder fees, re-applied at read time.
export const PERPS_HL_BUILDER_CAP_BPS = 10

// How long a stale cached value may still be served during an RPC outage before
// callers drop to env fallback (bounded staleness beats flapping).
const STALE_FACTOR = 10

/**
 * @param {object} config gateway config (reads .feeRouter)
 * @param {Record<number, {call: Function}>} providers per-chain read providers
 * @param {{now?: () => number, log?: (msg: string) => void}} [opts]
 * @returns {{ enabled: boolean, address: string|null, getPolymarketBps: () => Promise<{takerBps:number, makerBps:number}|null> }}
 */
export function createFeeRouterReader(config, providers, opts = {}) {
  const now = opts.now ?? Date.now
  const log = opts.log ?? ((msg) => console.warn(msg))
  const fr = config.feeRouter || {}
  const provider = fr.address ? providers?.[fr.chainId] : null
  const enabled = Boolean(fr.address && provider)

  let cached = null // { takerBps, makerBps, fetchedAt }
  let inflight = null
  let cachedPerps = null // { bps, fetchedAt }
  let inflightPerps = null

  async function readBps(serviceId, capBps, label) {
    const data = FEE_BPS_IFACE.encodeFunctionData('feeBps', [serviceId])
    const ret = await provider.call({ to: fr.address, data })
    const [bps] = FEE_BPS_IFACE.decodeFunctionResult('feeBps', ret)
    const value = Number(bps)
    if (value > capBps) {
      // The contract enforces per-service caps, so this should be impossible — clamp and shout.
      log(`[relay-gateway] FeeRouter ${label} bps ${value} exceeds the ${capBps} cap; clamping (investigate!)`)
      return capBps
    }
    return value
  }

  async function refresh() {
    const [takerBps, makerBps] = await Promise.all([
      readBps(FEE_SERVICE_IDS.polymarketTaker, TAKER_CAP_BPS, 'polymarket.taker'),
      readBps(FEE_SERVICE_IDS.polymarketMaker, MAKER_CAP_BPS, 'polymarket.maker'),
    ])
    cached = { takerBps, makerBps, fetchedAt: now() }
    return cached
  }

  /**
   * Live Polymarket builder bps, or null when the gateway must fall back to env values.
   */
  async function getPolymarketBps() {
    if (!enabled) return null
    if (cached && now() - cached.fetchedAt < fr.cacheTtlMs) {
      return { takerBps: cached.takerBps, makerBps: cached.makerBps }
    }
    if (!inflight) {
      inflight = refresh().finally(() => {
        inflight = null
      })
    }
    try {
      const fresh = await inflight
      return { takerBps: fresh.takerBps, makerBps: fresh.makerBps }
    } catch (err) {
      log(`[relay-gateway] FeeRouter read failed: ${err?.message || err}`)
      if (cached && now() - cached.fetchedAt < fr.cacheTtlMs * STALE_FACTOR) {
        return { takerBps: cached.takerBps, makerBps: cached.makerBps }
      }
      return null
    }
  }

  /**
   * Live Hyperliquid builder-fee bps (spec 082), or null when callers must fall back to the
   * env-configured value and mark `source: 'env-fallback'`. Same bounded-staleness rules as
   * getPolymarketBps.
   */
  async function getPerpsHlBuilderBps() {
    if (!enabled) return null
    if (cachedPerps && now() - cachedPerps.fetchedAt < fr.cacheTtlMs) return cachedPerps.bps
    if (!inflightPerps) {
      inflightPerps = readBps(FEE_SERVICE_IDS.perpsHlBuilder, PERPS_HL_BUILDER_CAP_BPS, 'perps.hyperliquid.builder')
        .then((bps) => {
          cachedPerps = { bps, fetchedAt: now() }
          return bps
        })
        .finally(() => {
          inflightPerps = null
        })
    }
    try {
      return await inflightPerps
    } catch (err) {
      log(`[relay-gateway] FeeRouter perps read failed: ${err?.message || err}`)
      if (cachedPerps && now() - cachedPerps.fetchedAt < fr.cacheTtlMs * STALE_FACTOR) return cachedPerps.bps
      return null
    }
  }

  return { enabled, address: fr.address ?? null, getPolymarketBps, getPerpsHlBuilderBps }
}
