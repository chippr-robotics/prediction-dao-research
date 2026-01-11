// UI and Theme contexts
export { UIContext } from './UIContext.js'
export { UIProvider } from './UIContext.jsx'
export { ThemeContext } from './ThemeContext.js'
export { ThemeProvider } from './ThemeContext.jsx'

// Price context
export { usePrice } from './PriceContext.js'
export { PriceProvider } from './PriceContext.jsx'

// ETCswap context
export { ETCswapContext } from './ETCswapContext.js'
export { ETCswapProvider } from './ETCswapContext.jsx'

// User preferences context
export { UserPreferencesContext } from './UserPreferencesContext.js'
export { UserPreferencesProvider } from './UserPreferencesContext.jsx'

// Unified Wallet context (single source of truth for blockchain interactions)
export { WalletContext } from './WalletContext.js'
export { WalletProvider } from './WalletContext.jsx'

// Role constants and context (roles are managed in WalletProvider, but RoleContext exported for test compatibility)
export { RoleContext, ROLES, ROLE_INFO, ADMIN_ROLES, isAdminRole, getRoleName } from './RoleContext.js'

