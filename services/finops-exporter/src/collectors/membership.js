/**
 * Membership revenue collector (spec 089, FR-004).
 *
 * TWO NUMBERS, NEVER ONE.
 *
 *   membership-accrued  — earned (MembershipPurchased/Upgraded/Extended), still in the contract
 *   membership-received — withdrawn to the treasury (FeesWithdrawn)
 *
 * Spec 071 already established that accrued and received are never summed. This collector is the
 * place someone would be most tempted to add them — "total membership revenue" sounds like one
 * number — and adding them double-counts every fee that has since been withdrawn. They are
 * therefore separate metric families (`revenue_accrued` is a gauge, `revenue_total` is a counter),
 * so the type system of the metrics themselves resists the mistake.
 *
 * Membership has ONE home chain per cohort (spec 071, `membershipChainId()`), which is why the
 * catalogue pins these sources to a single chain rather than fanning out across the estate.
 */
import { ethers } from 'ethers'
import { read, notConfigured } from '../reading.js'
import { finalizedBlock } from '../chain/providers.js'
import { scanLogs } from '../chain/logs.js'

const IFACE = new ethers.Interface([
  'event MembershipPurchased(address indexed user, bytes32 indexed role, uint8 tier, uint128 price, uint64 expiresAt)',
  'event MembershipUpgraded(address indexed user, bytes32 indexed role, uint8 fromTier, uint8 toTier, uint128 delta)',
  'event MembershipExtended(address indexed user, bytes32 indexed role, uint32 durationDays, uint128 price, uint64 expiresAt)',
  'event FeesWithdrawn(address indexed to, uint128 amount)',
])

const PURCHASED = IFACE.getEvent('MembershipPurchased').topicHash
const UPGRADED = IFACE.getEvent('MembershipUpgraded').topicHash
const EXTENDED = IFACE.getEvent('MembershipExtended').topicHash
const WITHDRAWN = IFACE.getEvent('FeesWithdrawn').topicHash

/** Membership is priced in USDC (`priceUSDC` in `TierSet`), 6dp. */
const USDC_DECIMALS = 6

export function createMembershipCollector({ config, providers, cursors, log = console.warn }) {
  return async function collectMembership(source) {
    const address = config.contracts.membershipManager
    if (!address) return notConfigured('MEMBERSHIP_MANAGER_ADDRESS is not set')

    const chainId = source.chains?.[0]
    const provider = providers[chainId]
    if (!provider) return notConfigured(`no provider for chain ${chainId}`)

    const wantsWithdrawn = source.id === 'membership-received'
    const topics = wantsWithdrawn ? [WITHDRAWN] : [[PURCHASED, UPGRADED, EXTENDED]]

    const to = await finalizedBlock(provider, chainId, config)
    const key = `${chainId}:${address}:membership:${wantsWithdrawn ? 'withdrawn' : 'earned'}`
    const from = cursors.get(key, Math.max(0, to - config.lookbackBlocks))

    if (to < from) {
      return read(Number(ethers.formatUnits(cursors.total(key), USDC_DECIMALS)), 'USDC', {
        labels: { chain: String(chainId) },
      })
    }

    const logs = await scanLogs(provider, { address, topics }, from, to)

    let delta = 0n
    for (const entry of logs) {
      const parsed = IFACE.parseLog(entry)
      if (!parsed) continue
      switch (parsed.name) {
        case 'FeesWithdrawn':
          delta += parsed.args.amount
          break
        case 'MembershipUpgraded':
          // An upgrade charges only the DIFFERENCE. Adding the new tier's full price here would
          // count the original purchase twice.
          delta += parsed.args.delta
          break
        default:
          delta += parsed.args.price
      }
    }

    cursors.set(key, to + 1)

    if (wantsWithdrawn) {
      // Received is cumulative: money that arrived stays arrived.
      const total = cursors.accumulate(key, delta)
      if (logs.length) log(`[finops] membership-received: +${logs.length} withdrawals (blocks ${from}–${to})`)
      return read(Number(ethers.formatUnits(total, USDC_DECIMALS)), 'USDC', { labels: { chain: String(chainId) } })
    }

    // Accrued is a GAUGE: earned-so-far minus withdrawn-so-far, i.e. what is still sitting in the
    // contract. Tracking it as a counter would make it rise forever and never reflect a withdrawal.
    const earned = cursors.accumulate(key, delta)
    const withdrawnKey = `${chainId}:${address}:membership:withdrawn`
    const outstanding = earned - cursors.total(withdrawnKey)

    return read(
      Number(ethers.formatUnits(outstanding > 0n ? outstanding : 0n, USDC_DECIMALS)),
      'USDC',
      { labels: { chain: String(chainId) } },
    )
  }
}
