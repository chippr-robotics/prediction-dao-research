import { useRoles } from '../../hooks/useRoles'
import { useWeb3 } from '../../hooks/useWeb3'
import './RoleGate.css'

/**
 * RoleGate - Conditionally render children based on user role
 * @param {Array<string>} requiredRoles - Roles required to access (any of them)
 * @param {Array<string>} requiredAllRoles - All roles required to access
 * @param {ReactNode} children - Content to show if user has role
 * @param {ReactNode} fallback - Content to show if user doesn't have role
 * @param {boolean} showPurchase - Show purchase option if user doesn't have role
 */
function RoleGate({ 
  requiredRoles = [], 
  requiredAllRoles = [],
  children, 
  fallback = null,
  showPurchase = true,
  onPurchase = null
}) {
  const { hasAnyRole, hasAllRoles, getRoleInfo } = useRoles()
  const { isConnected } = useWeb3()

  // If not connected, show connection requirement
  if (!isConnected) {
    return fallback || (
      <div className="role-gate-message">
        <div className="role-gate-icon" aria-hidden="true">🔒</div>
        <h3>Wallet Connection Required</h3>
        <p>Please connect your wallet to access this feature.</p>
      </div>
    )
  }

  // Check if user has required roles
  let hasAccess = false
  if (requiredAllRoles.length > 0) {
    hasAccess = hasAllRoles(requiredAllRoles)
  } else if (requiredRoles.length > 0) {
    hasAccess = hasAnyRole(requiredRoles)
  } else {
    // No roles required, allow access
    hasAccess = true
  }

  if (hasAccess) {
    return <>{children}</>
  }

  // User doesn't have required roles
  if (fallback) {
    return fallback
  }

  // Show purchase option
  const rolesToShow = requiredAllRoles.length > 0 ? requiredAllRoles : requiredRoles
  
  return (
    <div className="role-gate-message">
      <div className="role-gate-icon" aria-hidden="true">⭐</div>
      <h3>Premium Feature</h3>
      <p>This feature requires one of the following roles:</p>
      <ul className="required-roles-list">
        {rolesToShow.map(role => {
          const info = getRoleInfo(role)
          return (
            <li key={role} className="required-role-item">
              <strong>{info.name}</strong>
              <span className="role-description">{info.description}</span>
            </li>
          )
        })}
      </ul>
      {showPurchase && (
        <button 
          onClick={onPurchase}
          className="purchase-access-btn"
        >
          Purchase Access
        </button>
      )}
    </div>
  )
}

export default RoleGate
