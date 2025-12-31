import { createContext } from 'react'

export const RoleContext = createContext(null)

/**
 * Available roles in the system
 */
export const ROLES = {
  MARKET_MAKER: 'MARKET_MAKER',
  CLEARPATH_USER: 'CLEARPATH_USER',
  TOKENMINT: 'TOKENMINT',
  ADMIN: 'ADMIN', // For role management
}

/**
 * Role display names and descriptions
 */
export const ROLE_INFO = {
  [ROLES.MARKET_MAKER]: {
    name: 'Market Maker',
    description: 'Ability to create and manage prediction markets',
    premium: true
  },
  [ROLES.CLEARPATH_USER]: {
    name: 'ClearPath User',
    description: 'Access to DAO governance and management platform',
    premium: true
  },
  [ROLES.TOKENMINT]: {
    name: 'Token Mint',
    description: 'Access to mint and manage NFTs and ERC20 tokens',
    premium: true
  },
  [ROLES.ADMIN]: {
    name: 'Administrator',
    description: 'Full system access including role management',
    premium: false
  }
}
