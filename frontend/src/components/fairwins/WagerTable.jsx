import { useMemo } from 'react'
import { WagerStatus as MarketStatus } from '../../constants/wagerDefaults'
import { useWagerActivityOptional } from '../../hooks/useWagerActivity'
import { buildWagerVm } from './wagerVm'
import ResolveButtonWithCountdown from './ResolveButtonWithCountdown'
import OpponentName from './OpponentName'

const VARIANT_CLASS = {
  primary: 'wc-action-primary',
  success: 'wc-action-success',
  danger: 'wc-action-danger',
  warning: 'wc-action-warning',
  ghost: 'wc-action-ghost',
}

/**
 * WagerTable (spec 018 FR-003/004)
 *
 * Compact, minimal table view for My Wagers — Wager / Amount / Date / State /
 * Actions. Clicking a row (outside an action control) opens the wager's full
 * detail view via onSelect. Shares its view model and action wiring with the
 * card grid through buildWagerVm, so behavior is identical across views.
 */
export default function WagerTable({
  markets,
  onSelect,
  onView,
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
}) {
  const activity = useWagerActivityOptional()
  const actionNeededByWagerId = activity?.actionNeededByWagerId

  const expiredMarkets = useMemo(
    () => markets.filter(m => m.computedStatus === MarketStatus.EXPIRED),
    [markets]
  )
  const showClearAll =
    statusFilter === MarketStatus.EXPIRED &&
    expiredMarkets.length > 0 &&
    typeof onClearAllExpired === 'function'

  const ctx = {
    account, getStatusClass, getStatusLabel, getTimeRemaining, formatDate,
    showActions, showOutcome, showResolveCountdown,
    canResolve, canAccept, isCreatorOfPending,
    onResolve, onAccept, onClearExpired, onClaim, onRefund,
    claimingId, claimError, refundingId, refundError,
    actionNeededByWagerId,
  }

  const rows = markets.map(m => ({ market: m, vm: buildWagerVm(m, ctx) }))
  const hasActionsColumn =
    showResolveCountdown ||
    rows.some(({ vm }) => vm.actions.length > 0)

  const openRow = (market) => {
    onView?.(market)
    onSelect(market)
  }

  return (
    <div className="wc-table-container mm-table-container">
      <table className="mm-table" role="table">
        <thead>
          <tr>
            <th>Wager</th>
            <th>Amount</th>
            <th>{showOutcome ? 'Settled' : 'Date'}</th>
            <th>State</th>
            {hasActionsColumn && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ market, vm }) => (
            <tr
              key={`${market.marketType}-${market.id}`}
              className={`mm-table-row${vm.isExpired ? ' mm-table-row-expired' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => openRow(market)}
              onKeyDown={(e) => { if (e.key === 'Enter') openRow(market) }}
            >
              <td className="mm-table-market">
                <span className="mm-table-market-title">
                  <span>{vm.displayTitle}</span>
                </span>
                {vm.opponentAddress && (
                  <span className="mm-table-market-opponent">
                    <OpponentName address={vm.opponentAddress} interactive={false} />
                  </span>
                )}
              </td>
              <td className="wc-table-amount">
                <strong>{vm.stake}</strong> {vm.tokenSymbol}
                {vm.outcome && (
                  <span className={`wc-outcome ${vm.outcome.tone}`} style={{ marginLeft: 6 }}>{vm.outcome.label}</span>
                )}
              </td>
              <td className="mm-table-time">{vm.meta[1]?.value}</td>
              <td>
                <span className={`mm-status-badge ${vm.statusClass}`}>{vm.statusText}</span>
              </td>
              {hasActionsColumn && (
                <td className="mm-table-actions" onClick={(e) => e.stopPropagation()}>
                  {showResolveCountdown && !vm.isExpired && (
                    <ResolveButtonWithCountdown market={market} onResolve={onResolve} account={account} />
                  )}
                  {vm.actions.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      className={`wc-action wc-action-sm ${VARIANT_CLASS[a.variant] || 'wc-action-ghost'}`}
                      onClick={(e) => { e.stopPropagation(); a.onClick() }}
                      disabled={a.disabled}
                      title={a.title}
                    >
                      {a.label}
                    </button>
                  ))}
                  {vm.actions.filter(a => a.error).map((a) => (
                    <span className="wc-action-error" role="alert" key={`${a.key}-err`}>{a.error}</span>
                  ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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
