/**
 * AdminAccessGate (spec 093) — the operations area's entry gate, shared by the
 * Control Room and every admin app screen so a deep link can never reach a
 * softer gate than the front door.
 *
 * The two refusal screens are copied from the monolithic AdminPanel and keep
 * its FR-012 distinction: "you hold no operator role" and "we could not ask"
 * are different statements, and the second must never be dressed as the
 * first. An operator refused during a network outage needs to know their
 * grant is not in question. Nothing behind the gate mounts (and therefore
 * nothing fetches) until access is granted.
 */
import { networkName } from '../../lib/chains/estate'

export default function AdminAccessGate({ access, children }) {
  const { entryState, estateRead, retry } = access

  if (entryState === 'granted') return children

  return (
    <div className="admin-panel">
      <div className="admin-unauthorized">
        <div className="unauthorized-icon" aria-hidden="true">🔒</div>
        <h2>{entryState === 'unverified' ? 'Could Not Verify Access' : 'Access Restricted'}</h2>
        {entryState === 'unverified' ? (
          <>
            <p>
              No network could be read, so your operator roles could not be checked. This is a
              connectivity problem, not a statement about what you hold.
            </p>
            <p className="unauthorized-hint">
              {estateRead?.unreadable?.length
                ? `Unreachable: ${estateRead.unreadable.map(networkName).join(', ')}.`
                : 'The role sweep did not complete.'}{' '}
              Check your network endpoints, then retry.
            </p>
            <button type="button" className="confirm-btn primary" onClick={retry}>
              Retry
            </button>
          </>
        ) : (
          <>
            <p>The operations control plane is only accessible to users with operator privileges.</p>
            <p className="unauthorized-hint">
              Operator roles include: Administrator, Emergency Guardian, Account Moderator, Role
              Manager, and Compliance Officer. Checked across{' '}
              {estateRead?.read?.length ?? 0} network{(estateRead?.read?.length ?? 0) === 1 ? '' : 's'}
              {estateRead?.unreadable?.length > 0 &&
                ` (${estateRead.unreadable.map(networkName).join(', ')} could not be read)`}
              .
            </p>
          </>
        )}
      </div>
    </div>
  )
}
