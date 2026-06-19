import './EmptyState.css'

/**
 * EmptyState — honest "no activity yet" block (spec 020 US3, Constitution III).
 * Never fabricates data; offers a clear next step.
 */
function EmptyState({ title = 'No activity yet', message, ctaLabel, onCta, compact = false }) {
  return (
    <div className={`account-empty${compact ? ' compact' : ''}`} role="note">
      <div className="account-empty-icon" aria-hidden="true">🍀</div>
      <p className="account-empty-title">{title}</p>
      {message && <p className="account-empty-message">{message}</p>}
      {ctaLabel && onCta && (
        <button type="button" className="account-empty-cta" onClick={onCta}>
          {ctaLabel}
        </button>
      )}
    </div>
  )
}

export default EmptyState
