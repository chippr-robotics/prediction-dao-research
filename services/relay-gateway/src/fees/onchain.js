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
}

// Spec-057 hard caps, re-applied at read time (defense in depth).
const TAKER_CAP_BPS = 100
const MAKER_CAP_BPS = 50

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

  return { enabled, address: fr.address ?? null, getPolymarketBps }
}
