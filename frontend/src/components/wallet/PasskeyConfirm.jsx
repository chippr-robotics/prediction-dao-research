/**
 * Transaction-ceremony confirmation surface for passkey accounts (spec 041,
 * T031 — FR-008/FR-014, clarification Q3).
 *
 * Shows exactly what the upcoming WebAuthn ceremony authorizes — action,
 * amount, counterparty (when applicable), and the network fee in stablecoin
 * terms — BEFORE the biometric prompt. Fee-path degradation is honest: when
 * the stablecoin fee path is down the defined fallbacks are offered (pay the
 * fee in the native token if the account holds any, or wait and retry) —
 * never an opaque failure, never a stranded user.
 */

import PropTypes from 'prop-types'
import './PasskeyConfirm.css'

function formatFeeLine({ feeQuote }) {
  if (!feeQuote) return 'Network fee: none (relayed intent)'
  if (feeQuote.denomination === 'USDC') return `Network fee: ~${feeQuote.display} USDC`
  return `Network fee: ~${feeQuote.display} ${feeQuote.denomination}`
}

function PasskeyConfirm({
  action,
  amount,
  counterparty,
  feeQuote, // null => gasless relayed intent; { display, denomination, raw }
  feeFallback, // null | { reason, nativeBalanceSufficient, onPayNative, onRetry }
  insufficient, // null | { shortfall, denomination } (pre-flight, exact shortfall)
  onConfirm,
  onCancel,
  busy = false,
}) {
  return (
    <div className="passkey-confirm" role="dialog" aria-label="Confirm with passkey" aria-modal="true">
      <h3 className="passkey-confirm__title">Confirm: {action}</h3>

      <dl className="passkey-confirm__details">
        {amount != null && (
          <>
            <dt>Amount</dt>
            <dd data-testid="confirm-amount">{amount}</dd>
          </>
        )}
        {counterparty && (
          <>
            <dt>Counterparty</dt>
            <dd data-testid="confirm-counterparty">{counterparty}</dd>
          </>
        )}
        <dt>Fee</dt>
        <dd data-testid="confirm-fee">{formatFeeLine({ feeQuote })}</dd>
      </dl>

      {insufficient && (
        <div className="passkey-confirm__insufficient" role="alert" data-testid="confirm-insufficient">
          Your balance is short {insufficient.shortfall} {insufficient.denomination} for this action
          (including its fee). Top up and try again — nothing was submitted.
        </div>
      )}

      {feeFallback && !insufficient && (
        <div className="passkey-confirm__fallback" role="alert" data-testid="confirm-fee-fallback">
          <p>
            Paying the fee in USDC isn&apos;t available right now ({feeFallback.reason}). Your funds are
            safe. You can:
          </p>
          <div className="passkey-confirm__fallback-actions">
            {feeFallback.nativeBalanceSufficient && (
              <button type="button" className="btn" onClick={feeFallback.onPayNative}>
                Pay this fee in the network token
              </button>
            )}
            <button type="button" className="btn" onClick={feeFallback.onRetry}>
              Wait and retry
            </button>
          </div>
        </div>
      )}

      <div className="passkey-confirm__actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={busy || Boolean(insufficient)}
          data-testid="confirm-passkey"
        >
          {busy ? 'Waiting for your device…' : 'Confirm with passkey'}
        </button>
      </div>
    </div>
  )
}

PasskeyConfirm.propTypes = {
  action: PropTypes.string.isRequired,
  amount: PropTypes.string,
  counterparty: PropTypes.string,
  feeQuote: PropTypes.shape({
    display: PropTypes.string,
    denomination: PropTypes.string,
    raw: PropTypes.any,
  }),
  feeFallback: PropTypes.shape({
    reason: PropTypes.string,
    nativeBalanceSufficient: PropTypes.bool,
    onPayNative: PropTypes.func,
    onRetry: PropTypes.func,
  }),
  insufficient: PropTypes.shape({
    shortfall: PropTypes.string,
    denomination: PropTypes.string,
  }),
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  busy: PropTypes.bool,
}

export default PasskeyConfirm
