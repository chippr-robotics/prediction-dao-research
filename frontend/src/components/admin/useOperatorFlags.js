/**
 * useOperatorFlags (spec 093 follow-up) — the role-flag object the admin app
 * matrix takes, read from WalletContext WITHOUT the curator authority
 * round-trip and WITHOUT throwing outside a provider.
 *
 * For member-facing surfaces that only *offer* admin entry points (the Apps
 * store's Operator tools section): absence of the wallet context — or of any
 * role — derives every flag false, so the surface simply renders no operator
 * affordance. That tolerance is deliberate and safe here because these flags
 * gate DISCOVERY only; the /admin shell re-derives access with the full
 * three-way gate (useAdminAccess) and the contracts enforce for real.
 * Anything that needs "could not verify" as a distinct state must keep using
 * useAdminAccess — this hook cannot express it.
 */
import { useContext, useMemo } from 'react'
import { WalletContext } from '../../contexts/WalletContext'
import { ROLES, ADMIN_ROLES } from '../../contexts/RoleContext'

export function useOperatorFlags() {
  const context = useContext(WalletContext)
  const hasRole = context?.hasRole
  const hasAnyRole = context?.hasAnyRole

  return useMemo(() => {
    if (typeof hasRole !== 'function' || typeof hasAnyRole !== 'function') {
      return { isOperator: false, flags: {} }
    }
    return {
      isOperator: hasAnyRole(ADMIN_ROLES),
      flags: {
        isAdmin: hasRole(ROLES.ADMIN),
        isGuardian: hasRole(ROLES.GUARDIAN),
        isAccountModerator: hasRole(ROLES.ACCOUNT_MODERATOR),
        isRoleManager: hasRole(ROLES.ROLE_MANAGER),
        isSanctionsAdmin: hasRole(ROLES.SANCTIONS_ADMIN),
        isFeeAdmin: hasRole(ROLES.FEE_ADMIN),
        isStakingAdmin: hasRole(ROLES.STAKING_ADMIN),
        isLiquidityAdmin: hasRole(ROLES.LIQUIDITY_ADMIN),
      },
    }
  }, [hasRole, hasAnyRole])
}
