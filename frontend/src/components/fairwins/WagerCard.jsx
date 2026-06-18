import Badge from '../ui/Badge'
import ResolveButtonWithCountdown from './ResolveButtonWithCountdown'

// spec 012 FR-007 action-needed labels, reused on the card's status row.
const ACTION_NEEDED_LABELS = {
  accept: 'Accept',
  resolve: 'Resolve',
  claim: 'Claim',
  refund: 'Refund',
  respondDraw: 'Respond to draw',
}

const VARIANT_CLASS = {
  primary: 'wc-action-primary',
  success: 'wc-action-success',
  danger: 'wc-action-danger',
  warning: 'wc-action-warning',
  ghost: 'wc-action-ghost',
}

/**
 * WagerCard (spec 017)
 *
 * A single wager rendered as an expandable card. Collapsed: stake, title, status
 * pill, chevron (+ opponent/time preview in comfortable density). Expanded: terms
 * (or an inline decrypt affordance for encrypted wagers), a 2-column metadata
 * grid, contextual action buttons, and a "View details" link to the full detail
 * view. Pure presentation — all side effects flow through the passed callbacks.
 */
export default function WagerCard({
  market,
  vm,
  isOpen,
  onToggle,
  onSelect,
  onDecrypt,
  onResolve,
  account,
  showResolveCountdown = false,
}) {
  const headingId = `wc-${vm.id}-title`
  const panelId = `wc-${vm.id}-panel`

  const onHeaderKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      onToggle()
    }
  }

  return (
    <div className={`wc-card${isOpen ? ' wc-open' : ''}${vm.isExpired ? ' wc-expired' : ''}`}>
      {/* Collapsed header — click/keyboard toggles expansion */}
      <div
        className="wc-header"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={onHeaderKeyDown}
      >
        <div className="wc-header-main">
          <div className="wc-amount-row">
            <span className="wc-stake">{vm.stake}</span>
            <span className="wc-token">{vm.tokenSymbol}</span>
            {vm.outcome && (
              <span className={`wc-outcome ${vm.outcome.tone}`}>{vm.outcome.label}</span>
            )}
          </div>
          <div className="wc-title" id={headingId} title={vm.displayTitle}>
            {vm.isPrivate && (
              <svg
                className="wc-privacy-icon" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            )}
            <span className="wc-title-text">{vm.displayTitle}</span>
          </div>
          {vm.showPreview && (
            <div className="wc-preview">
              <span className="wc-avatar" style={{ background: vm.avatarColor }} aria-hidden="true"></span>
              <span className="wc-preview-text">{vm.opponent}</span>
              <span className="wc-dot">·</span>
              <span className="wc-preview-text">{vm.timeLeft}</span>
            </div>
          )}
        </div>
        <div className="wc-header-side">
          <span className={`wc-status ${vm.statusClass}`}>{vm.statusText}</span>
          {vm.actionNeeded && !vm.actionBadgeRedundant && (
            <Badge variant={vm.actionNeeded === 'claim' ? 'success' : 'warning'} className="wc-action-needed">
              {ACTION_NEEDED_LABELS[vm.actionNeeded] ?? vm.actionNeeded}
            </Badge>
          )}
          <svg
            className="wc-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6"></path>
          </svg>
        </div>
      </div>

      {/* Expanded detail */}
      {isOpen && (
        <div className="wc-body" id={panelId}>
          <div className="wc-divider"></div>

          {/* Terms / decrypt affordance */}
          {vm.encState === 'locked' && (
            <div className="wc-locked">
              <div className="wc-locked-text">Wager terms are encrypted end-to-end.</div>
              <button type="button" className="wc-action wc-action-primary" onClick={() => onDecrypt(market.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 7 }}>
                  <rect x="4" y="11" width="16" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
                </svg>
                Decrypt Wager Details
              </button>
            </div>
          )}
          {vm.encState === 'decrypting' && (
            <div className="wc-locked">
              <div className="wc-locked-text">Decrypting…</div>
            </div>
          )}
          {vm.encState === 'unavailable' && (
            <div className="wc-locked">
              <div className="wc-locked-text">Terms unavailable</div>
              <button type="button" className="wc-action wc-action-ghost" onClick={() => onDecrypt(market.id)}>
                Try again
              </button>
            </div>
          )}
          {(vm.encState === 'revealed' || vm.encState === 'plain') && vm.terms && (
            <div className="wc-terms">
              <div className="wc-terms-label">Wager terms</div>
              <div className="wc-terms-text">{vm.terms}</div>
            </div>
          )}

          {/* Metadata grid */}
          <div className="wc-meta">
            {vm.meta.map((m, i) => (
              <div className="wc-meta-item" key={i}>
                <div className="wc-meta-label">{m.label}</div>
                <div className={`wc-meta-value${m.tone ? ` ${m.tone}` : ''}`}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="wc-actions">
            {showResolveCountdown && !vm.isExpired && (
              <ResolveButtonWithCountdown market={market} onResolve={onResolve} account={account} />
            )}
            {vm.actions.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`wc-action ${VARIANT_CLASS[a.variant] || 'wc-action-ghost'}`}
                onClick={(e) => { e.stopPropagation(); a.onClick() }}
                disabled={a.disabled}
                title={a.title}
              >
                {a.label}
              </button>
            ))}
            <button
              type="button"
              className="wc-action wc-action-ghost wc-action-details"
              onClick={(e) => { e.stopPropagation(); onSelect() }}
            >
              View details
            </button>
          </div>

          {/* Per-card action errors */}
          {vm.actions.filter(a => a.error).map((a) => (
            <div className="wc-action-error" role="alert" key={`${a.key}-err`}>{a.error}</div>
          ))}
        </div>
      )}
    </div>
  )
}
