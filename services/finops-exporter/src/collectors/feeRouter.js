/**
 * Fee revenue collector (spec 089, FR-004; research R5).
 *
 * Reads `FeeCharged` and `FeeSkippedNoTreasury` from the FeeRouter (spec 060) — the single on-chain
 * source of truth for every configurable platform fee.
 *
 * WHY EVENTS AND NOT THE TREASURY BALANCE. A balance moves on withdrawal, transfer and airdrop, so a
 * balance delta attributes nothing to a service and can fall for reasons that are not revenue. The
 * event carries the serviceId, so it is the only read that can say WHICH fee earned what.
 *
 * `FeeSkippedNoTreasury` is collected deliberately: a fee waived because no treasury was configured
 * is revenue forgone for a fixable reason, and it is invisible everywhere else. Without it, a fee
 * path that is live but misconfigured looks exactly like a quiet day.
 */
import { ethers } from 'ethers'
import { read, notConfigured, unreadable } from '../reading.js'
import { finalizedBlock } from '../chain/providers.js'
import { scanLogs } from '../chain/logs.js'

const IFACE = new ethers.Interface([
  'event FeeCharged(bytes32 indexed serviceId, address indexed payer, address asset, uint256 grossAmount, uint256 feeAmount, address vault, address receiver)',
  'event FeeSkippedNoTreasury(bytes32 indexed serviceId, address indexed payer, uint256 grossAmount)',
])

const FEE_CHARGED = IFACE.getEvent('FeeCharged').topicHash
const FEE_SKIPPED = IFACE.getEvent('FeeSkippedNoTreasury').topicHash

/** USDC is 6dp on every chain we settle fees on. Kept explicit so the scale is auditable. */
const USDC_DECIMALS = 6

function toUsdc(raw) {
  return Number(ethers.formatUnits(raw, USDC_DECIMALS))
}

export function createFeeRouterCollector({ config, providers, cursors, log = console.warn }) {
  /**
   * @param {object} source catalogue entry — `serviceLabel` is the keccak preimage joining it to chain
   */
  return async function collectFeeRouter(source) {
    const address = config.contracts.feeRouter
    if (!address) return notConfigured('FEE_ROUTER_ADDRESS is not set')

    const chainId = source.chains?.[0]
    const provider = providers[chainId]
    if (!provider) return notConfigured(`no provider for chain ${chainId}`)

    const isWaived = source.metric === 'fairwins_finops_revenue_waived_total'
    const topic0 = isWaived ? FEE_SKIPPED : FEE_CHARGED

    // The waived source aggregates every service; the per-service sources filter by serviceId.
    const serviceTopic = source.serviceLabel ? ethers.id(source.serviceLabel) : null

    const to = await finalizedBlock(provider, chainId, config)
    const key = `${chainId}:${address}:${topic0}:${serviceTopic ?? 'all'}`
    const from = cursors.get(key, Math.max(0, to - config.lookbackBlocks))

    if (to < from) {
      // Head went backwards (provider swap behind a FallbackProvider, or a deep reorg). Report the
      // running total rather than inventing a window; do NOT rewind the cursor.
      return read(toUsdc(cursors.total(key)), 'USDC', { labels: { chain: String(chainId) } })
    }

    const logs = await scanLogs(
      provider,
      { address, topics: serviceTopic ? [topic0, serviceTopic] : [topic0] },
      from,
      to,
    )

    let delta = 0n
    for (const entry of logs) {
      const parsed = IFACE.parseLog(entry)
      if (!parsed) continue
      // FeeCharged carries the fee we took; FeeSkippedNoTreasury carries the gross we did not charge on.
      delta += isWaived ? parsed.args.grossAmount : parsed.args.feeAmount
    }

    const total = cursors.accumulate(key, delta)
    cursors.set(key, to + 1)

    if (logs.length) {
      log(`[finops] ${source.id}: +${toUsdc(delta)} USDC from ${logs.length} events (blocks ${from}–${to})`)
    }

    return read(toUsdc(total), 'USDC', { labels: { chain: String(chainId) } })
  }
}

/**
 * Read the LIVE configured rate for each service. Not revenue — the rate itself, so the dashboard
 * can show what is currently being charged next to what it has earned.
 *
 * A rate that reads above its own immutable cap cannot have come from a healthy router, so it is
 * reported unreadable rather than displayed (the same rule `frontend/src/lib/fees/feeQuote.js`
 * applies before a member signs).
 */
export function createFeeRateCollector({ config, providers }) {
  const iface = new ethers.Interface([
    'function feeBps(bytes32 serviceId) view returns (uint16)',
    'function getService(bytes32 serviceId) view returns (tuple(uint16 capBps, uint16 feeBps, uint8 kind))',
  ])

  return async function collectFeeRate(source) {
    const address = config.contracts.feeRouter
    if (!address || !source.serviceLabel) return notConfigured('FEE_ROUTER_ADDRESS is not set')

    const chainId = source.chains?.[0]
    const provider = providers[chainId]
    if (!provider) return notConfigured(`no provider for chain ${chainId}`)

    const data = iface.encodeFunctionData('getService', [ethers.id(source.serviceLabel)])
    const raw = await provider.call({ to: address, data })
    const [svc] = iface.decodeFunctionResult('getService', raw)

    const capBps = Number(svc.capBps)
    const feeBps = Number(svc.feeBps)
    if (feeBps > capBps || feeBps < 0 || feeBps > 10_000) {
      return unreadable(`rate ${feeBps} bps fails its own cap of ${capBps} bps`)
    }
    return read(feeBps, 'bps', { labels: { chain: String(chainId) } })
  }
}
