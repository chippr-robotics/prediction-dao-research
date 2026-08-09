import { useMemo } from 'react'
import { WagerStatus as MarketStatus } from '../../constants/wagerDefaults'
import { useWagerActivityOptional } from '../../hooks/useWagerActivity'
import { buildWagerVm } from './wagerVm'
import Badge from '../ui/Badge'
import ResolveButtonWithCountdown from './ResolveButtonWithCountdown'
import { resolveControlState } from './resolveWindow'
import OpponentName from './OpponentName'
import SensitiveValue from '../common/SensitiveValue'

const VARIANT_CLASS = {
  primary: 'wc-action-primary',
  success: 'wc-action-success',
  danger: 'wc-action-danger',
  warning: 'wc-action-warning',
  ghost: 'wc-action-ghost',
}

// spec 012 FR-007 action-needed labels.
const ACTION_NEEDED_LABELS = {
  accept: 'Accept',
  resolve: 'Resolve',
  claim: 'Claim',
  refund: 'Refund',
  respondDraw: 'Respond to draw',
}

// Which row control satisfies each action-needed kind. The tag is dropped only
// when the row actually renders one of them — otherwise it stays, because it is
// then the only signal that the wager needs attention.
const CONTROLS_SATISFYING = {
  accept: ['accept'],
  resolve: ['resolve'],
  claim: ['claim'],
  refund: ['refund', 'clear'],
  respondDraw: ['draw'],
}

/**
 * True when the row still needs its action-needed tag: something is pending on
 * this wager and no control in the row already says so.
 *
 * @param {boolean} resolveButtonShown - whether ResolveButtonWithCountdown is
 *   rendering an actual Resolve *button* for this row. A countdown or an empty
 *   render does not count: suppressing the tag behind a control that was never
 *   drawn is what leaves a row looking inert.
 */
function needsActionTag(vm, resolveButtonShown) {
  if (!vm.actionNeeded) return false
  const shown = new Set(vm.actions.map(a => a.key))
  if (resolveButtonShown) shown.add('resolve')
  return !(CONTROLS_SATISFYING[vm.actionNeeded] ?? []).some(k => shown.has(k))
}

/**
 * Inline decrypt affordance for an encrypted wager (spec 018 FR-010). Encrypted
 * terms can be unlocked straight from the row — the member does not have to open
 * the detail view first. Returns null when there is nothing to unlock (plain or
 * already-revealed terms) or when the caller wired no decrypt handler.
 */
function decryptControlFor(vm, onDecrypt) {
  if (typeof onDecrypt !== 'function') return null
  if (vm.encState === 'locked') return { label: 'Decrypt', disabled: false, title: 'Decrypt wager details' }
  if (vm.encState === 'decrypting') return { label: 'Decrypting…', disabled: true, title: 'Decrypting wager details' }
  if (vm.encState === 'unavailable') return { label: 'Retry decrypt', disabled: false, title: 'Terms unavailable — try again' }
  return null
}

/**
 * WagerTable (spec 018 FR-003/004)
 *
 * The single My Wagers list view: compact rows — Wager / Amount / Date / State /
 * Actions — at every viewport (the card grid it used to alternate with on narrow
 * screens was removed; below 640px the same markup restyles into stacked cards
 * via MyMarketsModal.css, so every action stays reachable without rotating the
 * device). Clicking a row (outside an action control) opens the wager's full
 * detail view via onSelect, which is where resolution, refunds and the withdraw
 * flow live. Row-level actions — resolve, accept, claim, refund, decrypt — are
 * rendered inline so the common cases need no navigation at all.
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
  onDecrypt,
  isDecrypting,
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
    account, isDecrypting, getStatusClass, getStatusLabel, getTimeRemaining, formatDate,
    showActions, showOutcome, showResolveCountdown,
    canResolve, canAccept, isCreatorOfPending,
    onResolve, onAccept, onClearExpired, onClaim, onRefund,
    claimingId, claimError, refundingId, refundError,
    actionNeededByWagerId,
  }

  const rows = markets.map(m => {
    const vm = buildWagerVm(m, ctx)
    // Ask the resolve control itself whether it is drawing a button. It re-checks
    // on its own 1s tick, so a row whose window opens between parent renders can
    // briefly show both the tag and the button — a duplicate that clears on the
    // next render, which is the safe direction to be wrong in.
    const resolveButtonShown =
      showResolveCountdown && !vm.isExpired &&
      resolveControlState(m, account).state === 'button'
    return {
      market: m,
      vm,
      decrypt: decryptControlFor(vm, onDecrypt),
      showActionTag: needsActionTag(vm, resolveButtonShown),
    }
  })
  const hasActionsColumn =
    showResolveCountdown ||
    rows.some(({ vm, decrypt }) => vm.actions.length > 0 || decrypt)

  const openRow = (market) => {
    onView?.(market)
    onSelect(market)
  }

  // The row is exposed as role="button", so it activates on Enter AND Space like
  // a real button. Keystrokes on a control *inside* the row are ignored: they
  // bubble to here, and Space is how you press the row's own action buttons —
  // without this guard, claiming would also navigate into the detail view.
  const onRowKeyDown = (e, market) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      openRow(market)
    }
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
          {rows.map(({ market, vm, decrypt, showActionTag }) => (
            <tr
              key={`${market.marketType}-${market.id}`}
              className={`mm-table-row${vm.isExpired ? ' mm-table-row-expired' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => openRow(market)}
              onKeyDown={(e) => onRowKeyDown(e, market)}
            >
              <td className="mm-table-market">
                <span className="mm-table-market-title">
                  {vm.isPrivate && (
                    <svg
                      className="wc-privacy-icon" width="13" height="13" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                  )}
                  <span>{vm.displayTitle}</span>
                </span>
                {vm.opponentAddress && (
                  <span className="mm-table-market-opponent">
                    <OpponentName address={vm.opponentAddress} interactive={false} />
                  </span>
                )}
              </td>
              <td className="wc-table-amount">
                <SensitiveValue as="strong">{vm.stake}</SensitiveValue> {vm.tokenSymbol}
                {vm.outcome && (
                  <span className={`wc-outcome ${vm.outcome.tone}`} style={{ marginLeft: 6 }}>
                    {vm.outcome.address
                      ? <OpponentName address={vm.outcome.address} interactive={false} />
                      : vm.outcome.label}
                  </span>
                )}
              </td>
              <td className="mm-table-time">{vm.meta[1]?.value}</td>
              <td className="mm-table-state">
                <span className={`mm-status-badge ${vm.statusClass}`}>{vm.statusText}</span>
                {/* Action-needed tag (spec 012 FR-007). Dropped when the row already
                    renders the matching control, so it never duplicates a button. */}
                {showActionTag && (
                  <Badge
                    variant={vm.actionNeeded === 'claim' ? 'success' : 'warning'}
                    className="wc-action-needed"
                  >
                    {ACTION_NEEDED_LABELS[vm.actionNeeded] ?? vm.actionNeeded}
                  </Badge>
                )}
                {vm.draw?.phase === 'proposed' && (
                  <span className="mm-table-draw" title={vm.draw.label}>Draw pending</span>
                )}
              </td>
              {hasActionsColumn && (
                <td className="mm-table-actions" onClick={(e) => e.stopPropagation()}>
                  {showResolveCountdown && !vm.isExpired && (
                    <ResolveButtonWithCountdown market={market} onResolve={onResolve} account={account} />
                  )}
                  {decrypt && (
                    <button
                      type="button"
                      className="wc-action wc-action-sm wc-action-ghost"
                      onClick={(e) => { e.stopPropagation(); onDecrypt(market.id) }}
                      disabled={decrypt.disabled}
                      title={decrypt.title}
                    >
                      {decrypt.label}
                    </button>
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
