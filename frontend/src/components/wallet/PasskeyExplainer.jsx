/**
 * First-time passkey explainer (spec 045, US4/FR-010). Shown once per browser
 * before the very first passkey ceremony; dismissible; never blocks returning
 * users. Copy carries the device-loss honesty from the original onboarding
 * intro (spec 041 FR-021 moment #1).
 */

import PropTypes from 'prop-types'

function PasskeyExplainer({ onContinue, onDismiss }) {
  return (
    <div className="passkey-explainer" role="region" aria-label="About passkeys">
      <h4>What&apos;s a passkey?</h4>
      <p>
        A passkey signs you in with Face ID, Touch ID, or your device PIN — no browser extension, no
        seed phrase, nothing to write down. It creates a self-custodial account: your device keeps the
        key, FairWins never can.
      </p>
      <ul className="passkey-explainer__points">
        <li>Works on this device, and syncs through your platform&apos;s passkey sync (iCloud/Google) if enabled.</li>
        <li>Each action you take is confirmed with one quick device prompt.</li>
        <li>
          After setup, add a recovery method — a second passkey or a linked wallet — so losing this
          device never means losing your funds.
        </li>
      </ul>
      <div className="passkey-explainer__actions">
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          Continue with passkey
        </button>
        <button type="button" className="btn" onClick={onDismiss}>
          Back
        </button>
      </div>
    </div>
  )
}

PasskeyExplainer.propTypes = {
  onContinue: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
}

export default PasskeyExplainer
