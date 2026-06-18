import { useMemo, useState } from 'react'
import { WagerStatus as MarketStatus } from '../../constants/wagerDefaults'
import { useWagerActivityOptional } from '../../hooks/useWagerActivity'
import { getMarketDisplayTitle, getRowOutcome, isWinnerUnpaid, formatShortAddress } from './wagerCardHelpers'
import WagerCard from './WagerCard'

// Action kinds whose card already renders a matching button, so the duplicate
// status-row badge is just noise (mirrors the old MarketsTable behavior).
const ACTION_BADGES_WITH_BUTTON = new Set(['accept', 'claim', 'resolve'])

// Stable avatar tint for the comfortable-density preview line (from the mockup).
const AVATAR_PALETTE = ['#fca5a5', '#fdba74', '#86efac', '#93c5fd', '#c4b5fd', '#f9a8d4', '#67e8f9']
function avatarColor(seed) {
  const s = String(seed || '')
  let n = 0
  for (const ch of s) n += ch.charCodeAt(0)
  return AVATAR_PALETTE[n % AVATAR_PALETTE.length]
}

/**
 * WagerCardGrid (spec 017)
 *
 * Responsive, expandable card grid for My Wagers. Drop-in replacement for the
 * former MarketsTable — accepts the same prop contract plus `density`,
 * `onDecrypt`, and `isDecrypting`. Owns the single-open accordion state and the
 * clear-all-expired affordance. Adds no network calls; every side effect flows
 * through the passed callbacks.
 */
export default function WagerCardGrid({
  markets,
  onSelect,
  getStatusClass,
  getStatusLabel,
  getTimeRemaining,
  formatDate,
  showActions = false,
  showOutcome = false,
  canResolve,
  canAccept,
  isCreatorOfPending,
  onResolve,
  onAccept,
  onClearExpired,
  onClearAllExpired,
  onClaim,
  claimingId,
  claimError,
  onRefund,
  refundingId,
  refundError,
  statusFilter,
  account,
  showResolveCountdown = false,
  density = 'compact',
  onDecrypt,
  isDecrypting,
  onView,
}) {
  const activity = useWagerActivityOptional()
  const actionNeededByWagerId = activity?.actionNeededByWagerId

  // Single-open accordion: at most one expanded card at a time (FR-007).
  const [openId, setOpenId] = useState(null)

  const expiredMarkets = useMemo(
    () => markets.filter(m => m.computedStatus === MarketStatus.EXPIRED),
    [markets]
  )
  const showClearAll =
    statusFilter === MarketStatus.EXPIRED &&
    expiredMarkets.length > 0 &&
    typeof onClearAllExpired === 'function'

  const me = account?.toLowerCase()

  // Pick the right countdown source: pending/expired offers use the *acceptance*
  // deadline, everything else the trading/resolve end.
  const rowTimeLeft = (market) => {
    const isPending =
      market.computedStatus === MarketStatus.PENDING_ACCEPTANCE ||
      market.computedStatus === MarketStatus.EXPIRED
    const endTime = isPending && market.acceptanceDeadline
      ? market.acceptanceDeadline
      : (market.tradingEndTime || market.endDate)
    if (market.computedStatus === MarketStatus.EXPIRED) return 'Expired'
    return getTimeRemaining(endTime)
  }

  const buildVm = (market) => {
    const idStr = String(market.id)
    const isExpired = market.computedStatus === MarketStatus.EXPIRED
    const isCreator = market.creator?.toLowerCase?.() === me
    const displayTitle = getMarketDisplayTitle(market)
    const timeLeft = rowTimeLeft(market)
    const outcome = showOutcome ? getRowOutcome(market, account) : null
    const actionNeeded = actionNeededByWagerId?.[idStr] ?? null

    // Encryption display state.
    const encState = !market.isEncrypted
      ? 'plain'
      : market.decryptedMetadata
        ? 'revealed'
        : (isDecrypting && isDecrypting(market.id))
          ? 'decrypting'
          : (market.decryptionError || market.ipfsEnvelopeError)
            ? 'unavailable'
            : 'locked'

    const termsRaw = market.decryptedMetadata?.terms || market.decryptedMetadata?.description || ''
    const terms = termsRaw && termsRaw !== displayTitle ? termsRaw : ''

    // Counterparty / creator labels (on-chain public; display only).
    const others = [market.creator, ...(market.participants || [])]
      .filter(a => a && a.toLowerCase?.() !== me)
    const opponent = others.length ? formatShortAddress(others[0]) : '—'
    const creatorLabel = market.creator?.toLowerCase?.() === me ? 'You' : formatShortAddress(market.creator)
    const endRaw = market.tradingEndTime || market.endDate

    const meta = [
      showOutcome && outcome
        ? { label: 'Outcome', value: outcome.label, tone: outcome.tone }
        : { label: 'Opponent', value: opponent },
      { label: showOutcome ? 'Settled' : 'Ends', value: showOutcome ? formatDate(endRaw) : timeLeft },
      { label: 'Wager ID', value: `#${market.id}` },
      { label: 'Creator', value: creatorLabel },
    ]

    // Action visibility — identical rules to the former MarketsTable.
    const showClearBtn = isExpired && typeof onClearExpired === 'function'
    const showAcceptBtn = !isExpired && canAccept?.(market)
    const showUnderConsideration = !isExpired && isCreatorOfPending?.(market)
    const showResolveBtn = showActions && canResolve?.(market)
    const canClaimRow = typeof onClaim === 'function' && isWinnerUnpaid(market, account)
    const showRefundBtn = actionNeeded === 'refund' && !showClearBtn && typeof onRefund === 'function'
    const showDrawBtn = actionNeeded === 'respondDraw' && typeof onResolve === 'function'

    const actionBadgeRedundant =
      ACTION_BADGES_WITH_BUTTON.has(actionNeeded) ||
      (actionNeeded === 'refund' && (showClearBtn || showRefundBtn)) ||
      showDrawBtn

    const actions = []
    if (showAcceptBtn) {
      actions.push({ key: 'accept', label: 'View Offer', variant: 'primary', onClick: () => onAccept(market), title: 'View offer details' })
    }
    if (showResolveBtn && !showResolveCountdown) {
      actions.push({ key: 'resolve', label: 'Resolve', variant: 'primary', onClick: () => onResolve(market), title: 'Resolve wager' })
    }
    if (showClearBtn) {
      actions.push({
        key: 'clear',
        label: isCreator ? 'Reclaim & Clear' : 'Clear',
        variant: 'ghost',
        onClick: () => onClearExpired(market),
        title: isCreator ? 'Reclaim stake and clear' : 'Clear from list',
      })
    }
    if (canClaimRow) {
      actions.push({
        key: 'claim',
        label: claimingId === idStr ? 'Claiming…' : 'Claim',
        variant: 'success',
        onClick: () => onClaim(market),
        disabled: claimingId === idStr,
        error: claimError?.id === idStr ? claimError.message : null,
        title: 'Claim your winnings',
      })
    }
    if (showRefundBtn) {
      actions.push({
        key: 'refund',
        label: refundingId === idStr ? 'Refunding…' : 'Refund',
        variant: 'warning',
        onClick: () => onRefund(market),
        disabled: refundingId === idStr,
        error: refundError?.id === idStr ? refundError.message : null,
        title: 'Reclaim your stake — the resolution window has passed',
      })
    }
    if (showDrawBtn) {
      actions.push({ key: 'draw', label: 'Respond to Draw', variant: 'primary', onClick: () => onResolve(market), title: 'Your counterparty proposed a draw — review and respond' })
    }

    return {
      id: idStr,
      stake: market.stakeAmount ?? '—',
      tokenSymbol: market.stakeTokenSymbol || 'ETC',
      displayTitle,
      isPrivate: Boolean(market.isPrivate),
      statusClass: getStatusClass(market.computedStatus),
      statusText: showUnderConsideration ? 'Under Consideration' : getStatusLabel(market.computedStatus),
      isExpired,
      timeLeft,
      outcome,
      encState,
      terms,
      meta,
      actions,
      actionNeeded,
      actionBadgeRedundant,
      // comfortable-density preview line
      showPreview: density === 'comfortable' && openId !== idStr && opponent !== '—',
      opponent,
      avatarColor: avatarColor(others[0] || idStr),
    }
  }

  return (
    <div className="wc-grid-container">
      <div className="wc-grid" role="list">
        {markets.map((market) => {
          const idStr = String(market.id)
          const vm = buildVm(market)
          return (
            <div role="listitem" key={`${market.marketType}-${market.id}`} className="wc-grid-item">
              <WagerCard
                market={market}
                vm={vm}
                isOpen={openId === idStr}
                onToggle={() => {
                  const willOpen = openId !== idStr
                  setOpenId(willOpen ? idStr : null)
                  // Expanding a card is "viewing" it → clear its unread activity
                  // (spec 012 FR-004 carried forward to the inline card view).
                  if (willOpen) onView?.(market)
                }}
                onSelect={() => onSelect(market)}
                onDecrypt={onDecrypt}
                onResolve={onResolve}
                account={account}
                showResolveCountdown={showResolveCountdown}
              />
            </div>
          )
        })}
      </div>
      {showClearAll && (
        <div className="wc-grid-footer">
          <button
            type="button"
            className="mm-btn-secondary mm-btn-small"
            onClick={() => onClearAllExpired(expiredMarkets)}
            title="Hide all expired offers from this list"
          >
            Clear all expired ({expiredMarkets.length})
          </button>
        </div>
      )}
    </div>
  )
}
