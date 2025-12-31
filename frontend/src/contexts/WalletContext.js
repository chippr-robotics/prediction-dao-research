import { createContext } from 'react'

/**
 * WalletContext - Unified wallet and user management system
 * 
 * This context provides a single source of truth for all wallet-related state and operations:
 * - Wallet connection and address management
 * - Balance tracking (ETC, WETC, tokens)
 * - Provider and signer for transactions
 * - RVAC role management integrated with wallet
 * - Network state and switching
 * 
 * All components needing wallet functionality should use this context via the useWallet hook.
 */
export const WalletContext = createContext(null)
