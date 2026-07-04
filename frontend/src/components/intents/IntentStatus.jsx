/**
 * IntentStatus — honest lifecycle readout for one gasless intent (spec 035 FR-018/FR-023, spec 036
 * frontend-relay-client.md "Honest status + accessibility").
 *
 * Purely presentational: state arrives as the `status` prop (useIntentAction's machine) and actions
 * arrive as callbacks. WCAG 2.1 AA: the container is a polite live region (role="status" +
 * aria-live="polite") so transitions are announced; every state is conveyed IN TEXT (never color or
 * icon alone); 'Confirmed' is only ever rendered when the caller's machine reached a txHash-bearing
 * confirmed state — this component adds no optimism of its own.
 */
/** Honest, user-facing label per lifecycle state. `idle` renders an empty (but present) live region. */
const INTENT_STATUS_LABELS = {
  idle: '',
  signing: 'Waiting for your signature…',
  signed: 'Signed — not yet submitted',
  submitting: 'Submitting…',
  pending: 'Pending on-chain…',
  confirmed: 'Confirmed',
  failed: 'Failed',
  expired: 'Expired',
  invalidated: 'Invalidated',
  'self-submitting': 'Self-submit fallback — sending from your wallet (you pay gas)…',
  'self-submitted': 'Self-submit fallback — sent from your wallet',
}

/** States where the signed intent has NOT executed, so "Pay my own gas" is a meaningful offer. */
const SELF_SUBMIT_OFFER = new Set(['signed', 'failed', 'expired'])

function IntentStatus({ status = 'idle', txHash = null, error = null, onInvalidate = null, onSelfSubmit = null }) {
  const label = INTENT_STATUS_LABELS[status] ?? status
  const detail = status === 'failed' && error?.message ? error.message : null

  return (
    // Persistent polite live region: assistive tech announces each label change without stealing focus.
    <div className="intent-status" role="status" aria-live="polite" data-status={status}>
      {label ? <span className="intent-status__label">{label}</span> : null}
      {detail ? <span className="intent-status__detail"> — {detail}</span> : null}
      {status === 'confirmed' && txHash ? (
        <span className="intent-status__tx"> (transaction {txHash})</span>
      ) : null}
      {status === 'signed' && typeof onInvalidate === 'function' ? (
        <button type="button" className="intent-status__action" onClick={onInvalidate}>
          Invalidate
        </button>
      ) : null}
      {SELF_SUBMIT_OFFER.has(status) && typeof onSelfSubmit === 'function' ? (
        <button type="button" className="intent-status__action" onClick={onSelfSubmit}>
          Pay my own gas
        </button>
      ) : null}
    </div>
  )
}

export default IntentStatus
export { IntentStatus }
