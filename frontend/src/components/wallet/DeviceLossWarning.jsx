/**
 * Device-loss warning (spec 041, T051 — US5/FR-021).
 *
 * Shown at the three mandated moments — account creation, first funding,
 * membership purchase — whenever the account is protected by a SINGLE
 * device-bound credential. Dismissals are tracked per moment in the local
 * AccountProfile but RE-ARM until a second controller exists: the risk is
 * real until then, so the warning is too.
 */

import { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { usePasskeyAccount } from '../../hooks/usePasskeyAccount'
import { WARNING_MOMENTS, dismissedAt, recordDismissal } from '../../lib/passkey/accountProfile'
import './DeviceLossWarning.css'

function DeviceLossWarning({ moment, onAddController, deps = {} }) {
  const account = usePasskeyAccount(deps)
  const [dismissed, setDismissed] = useState(() =>
    account.address ? dismissedAt(account.address, moment, deps.storage) : false
  )

  const dismiss = useCallback(() => {
    recordDismissal(account.address, moment, deps.storage)
    setDismissed(true)
  }, [account.address, moment, deps.storage])

  if (!account.isPasskeySession || !account.singleControllerRisk || dismissed) return null

  return (
    <aside className="device-loss-warning" role="alert" data-testid={`device-loss-warning-${moment}`}>
      <strong>One passkey guards this account.</strong>
      <p>
        If you lose this device (and your platform doesn&apos;t sync passkeys), you lose access to these
        funds — FairWins can&apos;t recover them for you, by design. Add a second passkey or link a
        wallet now.
      </p>
      <div className="device-loss-warning__actions">
        <button type="button" className="btn btn-primary" onClick={onAddController}>
          Add a backup now
        </button>
        <button type="button" className="btn" onClick={dismiss}>
          I understand the risk
        </button>
      </div>
    </aside>
  )
}

DeviceLossWarning.propTypes = {
  moment: PropTypes.oneOf(WARNING_MOMENTS).isRequired,
  onAddController: PropTypes.func,
  deps: PropTypes.object,
}

export default DeviceLossWarning
