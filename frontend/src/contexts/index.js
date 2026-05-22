// UI and Theme contexts
export { UIContext } from './UIContext.js'
export { UIProvider } from './UIContext.jsx'
export { ThemeContext } from './ThemeContext.js'
export { ThemeProvider } from './ThemeContext.jsx'

// Price context
export { usePrice } from './PriceContext.js'
export { PriceProvider } from './PriceContext.jsx'

// DEX context (active chain's V3 DEX — Polygon Amoy has no Uniswap deployment
// today, so consumers must branch on `isDexAvailable` from constants/dex).
export { DexContext } from './DexContext.js'
export { DexProvider } from './DexContext.jsx'

// User preferences context
export { UserPreferencesContext } from './UserPreferencesContext.js'
export { UserPreferencesProvider } from './UserPreferencesContext.jsx'

// Unified Wallet context (single source of truth for blockchain interactions)
export { WalletContext } from './WalletContext.js'
export { WalletProvider } from './WalletContext.jsx'

// Friend markets context (single source of truth for friend/private wager data)
export { FriendMarketsContext, useFriendMarkets } from './FriendMarketsContext.js'
export { FriendMarketsProvider } from './FriendMarketsContext.jsx'

// Role constants and context (roles are managed in WalletProvider, but RoleContext exported for test compatibility)
export { RoleContext, ROLES, ROLE_INFO, ADMIN_ROLES, isAdminRole, getRoleName } from './RoleContext.js'

