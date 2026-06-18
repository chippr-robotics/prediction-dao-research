import { useMemo, useState } from 'react'
import { WagerStatus as MarketStatus } from '../../constants/wagerDefaults'
import { useWagerActivityOptional } from '../../hooks/useWagerActivity'
import { buildWagerVm } from './wagerVm'
import WagerCard from './WagerCard'

/**
 * WagerCardGrid (spec 017, updated spec 018)
 *
 * Responsive, expandable card grid for My Wagers. Owns the single-open accordion
 * state, the per-card "hide decrypted terms" state (FR-002), and the
 * clear-all-expired affordance. Shares its view model with the table view via
 * buildWagerVm. Adds no network calls; every side effect flows through callbacks.
 */
export default function WagerCardGrid({
  markets,
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
  // Per-card re-hidden decrypted terms (spec 018 FR-002). Default visible after
  // decryption; the user opts to conceal. View-only — does not re-encrypt.
  const [hiddenTermIds, setHiddenTermIds] = useState(() => new Set())

  const expiredMarkets = useMemo(
    () => markets.filter(m => m.computedStatus === MarketStatus.EXPIRED),
    [markets]
  )
  const showClearAll =
    statusFilter === MarketStatus.EXPIRED &&
    expiredMarkets.length > 0 &&
    typeof onClearAllExpired === 'function'

  const ctx = {
    account, isDecrypting, getStatusClass, getStatusLabel, getTimeRemaining, formatDate,
    showActions, showOutcome, showResolveCountdown,
    canResolve, canAccept, isCreatorOfPending,
    onResolve, onAccept, onClearExpired, onClaim, onRefund,
    claimingId, claimError, refundingId, refundError,
    actionNeededByWagerId,
  }

  const toggleHideTerms = (id) => {
    setHiddenTermIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="wc-grid-container">
      <div className="wc-grid" role="list">
        {markets.map((market) => {
          const idStr = String(market.id)
          const vm = buildWagerVm(market, ctx)
          // Grid-only display flags.
          vm.showPreview = density === 'comfortable' && openId !== idStr && vm.opponent !== '—'
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
                onDecrypt={onDecrypt}
                onResolve={onResolve}
                account={account}
                showResolveCountdown={showResolveCountdown}
                termsHidden={hiddenTermIds.has(idStr)}
                onToggleHideTerms={() => toggleHideTerms(idStr)}
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
