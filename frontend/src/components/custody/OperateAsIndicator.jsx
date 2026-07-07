// Spec 043 (US3, FR-020/FR-023) — a persistent, app-wide banner shown whenever the member is operating as a
// vault, with a one-click switch back to the personal wallet. Renders nothing in personal mode.

import { useActiveAccount } from '../../hooks/useActiveAccount'
import './Custody.css'

function shorten(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}

export default function OperateAsIndicator() {
  const { isVault, identity, canActAsVault, operateAsPersonal } = useActiveAccount()
  if (!isVault) return null

  return (
    <div className="custody-operateas" role="status" aria-live="polite">
      <span className="custody-operateas-text">
        Operating as <strong>{identity.label || 'vault'}</strong>{' '}
        <code>{shorten(identity.vaultAddress)}</code>
        {!canActAsVault && (
          <span className="custody-operateas-warn"> — switch to network {identity.chainId} to act</span>
        )}
      </span>
      <button type="button" className="custody-operateas-switch" onClick={operateAsPersonal}>
        Switch back to personal wallet
      </button>
    </div>
  )
}
