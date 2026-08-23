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
import { ADMIN_ROLES, ROLE_INFO } from '../../contexts/RoleContext'

/*
 * DERIVED, never restated. This hint used to hard-code five role names while
 * `useAdminAccess` granted entry on eight roles plus the app-curator authority
 * — so an operator holding Fee, Staking or Liquidity Administrator was told
 * their role was not one that opens the area, which is the opposite of true.
 *
 * Reading ADMIN_ROLES means adding a role to the gate adds it to the hint, and
 * the two cannot drift again. The curator path is named separately because it
 * is not an ADMIN_ROLES entry — it is read from the registry contract.
 */
const OPERATOR_ROLE_NAMES = ADMIN_ROLES.map((r) => ROLE_INFO[r]?.name).filter(Boolean)

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
              Operator roles: {OPERATOR_ROLE_NAMES.join(', ')} — or the mini-app curator
              authority. Checked across{' '}
              {estateRead?.read?.length ?? 0} network{(estateRead?.read?.length ?? 0) === 1 ? '' : 's'}
              {estateRead?.notDeployed?.length > 0 &&
                ` (${estateRead.notDeployed.map(networkName).join(', ')} carr${
                  estateRead.notDeployed.length === 1 ? 'ies' : 'y'
                } no operator contracts)`}
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
