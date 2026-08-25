import { WagerStatus as MarketStatus } from '../../constants/wagerDefaults'
import { getMarketDisplayTitle, getRowOutcome, isWinnerUnpaid, formatShortAddress } from './wagerCardHelpers'

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
 * Consumed by WagerTable — the single My Wagers list view — so status, metadata,
 * encryption state, and contextual actions are derived in one place rather than
 * inline in the markup. Pure: all side effects flow through the callbacks in `ctx`.
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

  // Counterparty / creator labels (on-chain public; display only).
  const others = [market.creator, ...(market.participants || [])]
    .filter(a => a && a.toLowerCase?.() !== me)
  const opponentAddress = others.length ? others[0] : null
  const opponent = opponentAddress ? formatShortAddress(opponentAddress) : '—'
  const creatorIsSelf = market.creator?.toLowerCase?.() === me
  const creatorLabel = creatorIsSelf ? 'You' : formatShortAddress(market.creator)
  const endRaw = market.tradingEndTime || market.endDate

  // Draw state (spec 040 US2). A terminal DRAW means both parties agreed and
  // stakes were returned. Otherwise, an open proposer (from the subgraph scan,
  // attached as `drawProposedBy`) means a draw is proposed and awaiting the
  // other party — surfaced regardless of who proposed, so the proposer also
  // sees that their submission is recorded.
  const drawProposer = market.drawProposedBy ? String(market.drawProposedBy).toLowerCase() : null
  let draw = null
  if (market.computedStatus === MarketStatus.DRAW) {
    draw = {
      phase: 'settled',
      proposer: drawProposer,
      mySubmitted: true,
      opponentSubmitted: true,
      label: 'Both agreed · stakes returned',
    }
  } else if (drawProposer) {
    const mine = drawProposer === me
    draw = {
      phase: 'proposed',
      proposer: drawProposer,
      mySubmitted: mine,
      opponentSubmitted: !mine,
      label: mine ? 'You proposed · awaiting opponent' : 'Opponent proposed · your turn',
    }
  }

  const meta = [
    showOutcome && outcome
      ? { label: 'Outcome', value: outcome.label, tone: outcome.tone, kind: outcome.address ? 'address' : undefined, address: outcome.address }
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

  const actions = []
  if (showAcceptBtn) {
    actions.push({ key: 'accept', label: 'View Offer', variant: 'primary', onClick: () => onAccept(market), title: 'View offer details' })
  }
  if (showResolveBtn && !showResolveCountdown) {
    actions.push({ key: 'resolve', label: 'Resolve', variant: 'primary', onClick: () => onResolve(market), title: 'Resolve wager' })
  }
  if (showClearBtn) {
    // For the creator this button claims the refund before it dismisses, so it
    // reports through the same per-row refund state as the "Refund" button —
    // a reclaim that failed has to say so, or it is indistinguishable from one
    // that worked and the row is gone either way (#1297).
    actions.push({
      key: 'clear',
      label: !isCreator ? 'Clear' : refundingId === idStr ? 'Reclaiming…' : 'Reclaim & Clear',
      variant: 'ghost',
      onClick: () => onClearExpired(market),
      disabled: isCreator && refundingId === idStr,
      error: isCreator && refundError?.id === idStr ? refundError.message : null,
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
    meta,
    actions,
    actionNeeded,
    opponent,
    opponentAddress,
    draw,
  }
}
