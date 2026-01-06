import { createContext } from 'react'

export const RoleContext = createContext(null)

/**
 * Available roles in the system
 */
export const ROLES = {
  // User-facing roles
  MARKET_MAKER: 'MARKET_MAKER',
  CLEARPATH_USER: 'CLEARPATH_USER',
  TOKENMINT: 'TOKENMINT',
  FRIEND_MARKET: 'FRIEND_MARKET',

  // Administrative roles (hierarchical)
  ADMIN: 'ADMIN', // Top-level admin (DEFAULT_ADMIN_ROLE on-chain)
  CORE_SYSTEM_ADMIN: 'CORE_SYSTEM_ADMIN', // System-wide admin with timelock
  OPERATIONS_ADMIN: 'OPERATIONS_ADMIN', // Day-to-day operations
  EMERGENCY_GUARDIAN: 'EMERGENCY_GUARDIAN', // Can pause contracts
  OVERSIGHT_COMMITTEE: 'OVERSIGHT_COMMITTEE', // Independent verification
}

/**
 * Role display names and descriptions
 */
export const ROLE_INFO = {
  [ROLES.MARKET_MAKER]: {
    name: 'Market Maker',
    description: 'Ability to create and manage prediction markets',
    premium: true,
    isAdminRole: false
  },
  [ROLES.CLEARPATH_USER]: {
    name: 'ClearPath User',
    description: 'Access to DAO governance and management platform',
    premium: true,
    isAdminRole: false
  },
  [ROLES.TOKENMINT]: {
    name: 'Token Mint',
    description: 'Access to mint and manage NFTs and ERC20 tokens',
    premium: true,
    isAdminRole: false
  },
  [ROLES.FRIEND_MARKET]: {
    name: 'Friend Markets',
    description: 'Create private prediction markets with friends',
    premium: true,
    isAdminRole: false
  },
  [ROLES.ADMIN]: {
    name: 'Administrator',
    description: 'Full system access including role management and contract configuration',
    premium: false,
    isAdminRole: true
  },
  [ROLES.CORE_SYSTEM_ADMIN]: {
    name: 'Core System Admin',
    description: 'System-wide administrative access with multi-sig and timelock requirements',
    premium: false,
    isAdminRole: true
  },
  [ROLES.OPERATIONS_ADMIN]: {
    name: 'Operations Admin',
    description: 'Day-to-day operational control including tier configuration and user management',
    premium: false,
    isAdminRole: true
  },
  [ROLES.EMERGENCY_GUARDIAN]: {
    name: 'Emergency Guardian',
    description: 'Emergency response capability to pause contracts when security issues arise',
    premium: false,
    isAdminRole: true
  },
  [ROLES.OVERSIGHT_COMMITTEE]: {
    name: 'Oversight Committee',
    description: 'Independent verification and audit access for governance transparency',
    premium: false,
    isAdminRole: true
  }
}

/**
 * Admin roles that grant access to the admin panel
 */
export const ADMIN_ROLES = [
  ROLES.ADMIN,
  ROLES.CORE_SYSTEM_ADMIN,
  ROLES.OPERATIONS_ADMIN,
  ROLES.EMERGENCY_GUARDIAN,
  ROLES.OVERSIGHT_COMMITTEE
]

/**
 * Check if a role is an administrative role
 */
export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role)
}

/**
 * Get the display-friendly name for a role
 */
export function getRoleName(role) {
  return ROLE_INFO[role]?.name || role
}
