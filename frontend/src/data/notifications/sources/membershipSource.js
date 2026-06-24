/**
 * Membership activity source (spec 031, FR-029). Snapshot-diffs the user's membership (tier + expiry) each
 * cycle: granted / upgraded / expired (informational), plus "expiring soon" (action: renew, anti-spammed once
 * per UTC day) and "voucher redeemable" (action: redeem) from a best-effort bounded voucher scan. Pure
 * snapshot-diff (first-sight = baseline). No hooks; read-only provider.
 */
import { ethers } from 'ethers'
import { getProvider } from '../../../utils/blockchainService'
import { getContractAddressForChain, getDeploymentBlockForChain } from '../../../config/contracts'
import { MEMBERSHIP_MANAGER_ABI } from '../../../abis/MembershipManager'
import { MEMBERSHIP_VOUCHER_ABI } from '../../../abis/MembershipVoucher'

const ROLE = ethers.keccak256(ethers.toUtf8Bytes('WAGER_PARTICIPANT_ROLE'))
const TIER = ['None', 'Bronze', 'Silver', 'Gold', 'Platinum']
const DAY_S = 86400
const EXPIRING_WINDOW_S = 7 * DAY_S

const tierName = (t) => TIER[t] || `Tier ${t}`

async function countRedeemableVouchers(voucherAddr, account, chainId, provider) {
  const voucher = new ethers.Contract(voucherAddr, MEMBERSHIP_VOUCHER_ABI, provider)
  const fromBlock = getDeploymentBlockForChain('membershipVoucher', chainId) || 0
  const incoming = await voucher.queryFilter(voucher.filters.Transfer(null, account), fromBlock)
  const ids = [...new Set(incoming.map((e) => e.args.tokenId.toString()))]
  let held = 0
  for (const id of ids) {
    try {
      if (String(await voucher.ownerOf(id)).toLowerCase() === String(account).toLowerCase()) held += 1
    } catch { /* burned / redeemed / transferred away */ }
  }
  return held
}

export const membershipSource = {
  key: 'membership',
  label: 'Membership',
  async detect({ account, chainId, nowMs, prior }) {
    const managerAddr = getContractAddressForChain('membershipManager', chainId)
    if (!managerAddr || !ethers.isAddress(managerAddr)) {
      return { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} }
    }
    let provider
    try {
      provider = getProvider(chainId)
    } catch {
      return { ok: false }
    }

    let tier
    let expiresAt
    try {
      const mgr = new ethers.Contract(managerAddr, MEMBERSHIP_MANAGER_ABI, provider)
      const m = await mgr.getMembership(account, ROLE)
      tier = Number(m.tier ?? m[0])
      expiresAt = Number(m.expiresAt ?? m[1])
    } catch {
      return { ok: false } // can't read membership — retain prior slice
    }

    const nowSec = Math.floor(nowMs / 1000)
    const dayBucket = Math.floor(nowMs / 86_400_000)
    const entries = []
    const actionNeededById = {}
    const currentIds = ['membership']
    const nextSnapshots = {}
    const nextAux = { ...(prior.aux || {}) }

    const mk = (type, message, severity, actionable = false, link = { to: '/wallet', state: { tab: 'membership' } }) => ({
      id: `membership:membership:${type}:${nowMs}`, domain: 'membership', refId: 'membership', type, message, severity, actionable, link, createdAt: nowMs, read: false,
    })

    const prev = prior.snapshots?.membership
    nextSnapshots.membership = { tier, expiresAt, snappedAt: nowMs }
    if (prev && prev.tier !== tier) {
      if (tier === 0) entries.push(mk('membership-expired', `Your ${tierName(prev.tier)} membership has ended`, 'warning'))
      else if (prev.tier === 0) entries.push(mk('membership-granted', `You're now a ${tierName(tier)} member`, 'success'))
      else if (tier > prev.tier) entries.push(mk('membership-upgraded', `Membership upgraded to ${tierName(tier)}`, 'success'))
      else entries.push(mk('membership-changed', `Membership changed to ${tierName(tier)}`, 'info'))
    }

    // Expiring soon (action: renew) — anti-spam to once per UTC day via aux.
    if (tier > 0 && expiresAt > nowSec && expiresAt - nowSec <= EXPIRING_WINDOW_S) {
      actionNeededById.membership = 'renew'
      if (nextAux.expiringDay !== dayBucket) {
        const days = Math.max(1, Math.ceil((expiresAt - nowSec) / DAY_S))
        entries.push(mk('membership-expiring', `Your ${tierName(tier)} membership expires in ${days} day${days === 1 ? '' : 's'} — renew to keep it`, 'warning', true))
        nextAux.expiringDay = dayBucket
      }
    }

    // Voucher redeemable (action: redeem) — best-effort bounded scan; degrades silently on failure.
    const voucherAddr = getContractAddressForChain('membershipVoucher', chainId)
    if (voucherAddr && ethers.isAddress(voucherAddr)) {
      currentIds.push('voucher')
      try {
        const held = await countRedeemableVouchers(voucherAddr, account, chainId, provider)
        nextSnapshots.voucher = { count: held, snappedAt: nowMs }
        if (held > 0) actionNeededById.voucher = 'redeemVoucher'
        const prevCount = prior.snapshots?.voucher?.count ?? 0
        if (prior.snapshots?.voucher && prevCount === 0 && held > 0) {
          entries.push(mk('voucher-redeemable', `You have ${held} membership voucher${held === 1 ? '' : 's'} to redeem`, 'info', true, { to: '/vouchers' }))
        }
      } catch {
        if (prior.snapshots?.voucher) nextSnapshots.voucher = prior.snapshots.voucher // degrade: keep prior
      }
    }

    return { ok: true, entries, nextSnapshots, currentIds, actionNeededById, nextAux }
  },
}

export default membershipSource
