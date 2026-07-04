import { WagerStatus as MarketStatus } from '../../constants/wagerDefaults'
import { getMarketDisplayTitle, getRowOutcome, isWinnerUnpaid, formatShortAddress } from './wagerCardHelpers'

// Action kinds whose row already renders a matching button, so the duplicate
// status badge is just noise (mirrors the former MarketsTable behavior).
const ACTION_BADGES_WITH_BUTTON = new Set(['accept', 'claim', 'resolve'])

// Stable avatar tint for the comfortable-density preview line (from the mockup).
const AVATAR_PALETTE = ['#fca5a5', '#fdba74', '#86efac', '#93c5fd', '#c4b5fd', '#f9a8d4', '#67e8f9']
export function avatarColor(seed) {
  const s = String(seed || '')
  let n = 0
  for (const ch of s) n += ch.charCodeAt(0)
  return AVATAR_PALETTE[n % AVATAR_PALETTE.length]
}

/**
 * Pick the right countdown source: pending/expired offers use the *acceptance*
 * deadline, everything else the trading/resolve end.
 */
export function rowTimeLeft(market, getTimeRemaining) {
  const isPending =
    market.computedStatus === MarketStatus.PENDING_ACCEPTANCE ||
    market.computedStatus === MarketStatus.EXPIRED
  const endTime = isPending && market.acceptanceDeadline
    ? market.acceptanceDeadline
    : (market.tradingEndTime || market.endDate)
  if (market.computedStatus === MarketStatus.EXPIRED) return 'Expired'
  return getTimeRemaining(endTime)
}

/**
 * Build the shared, presentation-only view model for one wager (spec 017/018).
 *
 * Used by both the grid (WagerCardGrid/WagerCard) and the table (WagerTable) so
 * status, metadata, encryption state, and contextual actions stay identical
 * across views. Pure: all side effects flow through the callbacks in `ctx`.
 *
 * @param {object} market
 * @param {object} ctx - formatters, predicates, action callbacks, in-flight
 *   state, the activity-watcher map, and `isDecrypting`.
 */
export function buildWagerVm(market, ctx) {
  const {
    account,
    isDecrypting,
    getStatusClass,
    getStatusLabel,
    getTimeRemaining,
    formatDate,
    showActions = false,
    showOutcome = false,
    showResolveCountdown = false,
    canResolve,
    canAccept,
    isCreatorOfPending,
    onResolve,
    onAccept,
    onClearExpired,
    onClaim,
    onRefund,
    claimingId,
    claimError,
    refundingId,
    refundError,
    actionNeededByWagerId,
  } = ctx

  const me = account?.toLowerCase()
  const idStr = String(market.id)
  const isExpired = market.computedStatus === MarketStatus.EXPIRED
  const isCreator = market.creator?.toLowerCase?.() === me
  const displayTitle = getMarketDisplayTitle(market)
  const timeLeft = rowTimeLeft(market, getTimeRemaining)
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
  // Only encrypted wagers that have been decrypted can be re-hidden (FR-002).
  const canHideTerms = Boolean(market.isEncrypted) && encState === 'revealed' && Boolean(terms)

  // Counterparty / creator labels (on-chain public; display only).
  const others = [market.creator, ...(market.participants || [])]
    .filter(a => a && a.toLowerCase?.() !== me)
  const opponentAddress = others.length ? others[0] : null
  const opponent = opponentAddress ? formatShortAddress(opponentAddress) : '—'
  const creatorIsSelf = market.creator?.toLowerCase?.() === me
  const creatorLabel = creatorIsSelf ? 'You' : formatShortAddress(market.creator)
  const endRaw = market.tradingEndTime || market.endDate

  const meta = [
    showOutcome && outcome
      ? { label: 'Outcome', value: outcome.label, tone: outcome.tone }
      : { label: 'Opponent', value: opponent, kind: opponentAddress ? 'address' : undefined, address: opponentAddress },
    { label: showOutcome ? 'Settled' : 'Ends', value: showOutcome ? formatDate(endRaw) : timeLeft },
    { label: 'Wager ID', value: `#${market.id}` },
    { label: 'Creator', value: creatorLabel, kind: 'address', address: market.creator, isSelf: creatorIsSelf },
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
    canHideTerms,
    meta,
    actions,
    actionNeeded,
    actionBadgeRedundant,
    opponent,
    opponentAddress,
    avatarColor: avatarColor(others[0] || idStr),
  }
}
