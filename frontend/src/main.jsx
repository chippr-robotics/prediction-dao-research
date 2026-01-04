import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { config } from './wagmi'
import {
  Web3Provider,
  WalletProvider,
  UIProvider,
  ThemeProvider,
  PriceProvider,
  ETCswapProvider,
  UserPreferencesProvider,
  RoleProvider
} from './contexts'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { validateTheme } from './utils/validateTheme'

// Create query client for wagmi
const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <Web3Provider>
            <ThemeProvider>
              {/* WalletProvider is the primary wallet management - wraps everything */}
              <WalletProvider>
                <UserPreferencesProvider>
                  {/* RoleProvider kept for backwards compatibility, roles now in WalletProvider */}
                  <RoleProvider>
                    <ETCswapProvider>
                      <UIProvider>
                        <PriceProvider>
                          <App />
                        </PriceProvider>
                      </UIProvider>
                    </ETCswapProvider>
                  </RoleProvider>
                </UserPreferencesProvider>
              </WalletProvider>
            </ThemeProvider>
          </Web3Provider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Validate theme CSS variables after React mounts
// Use requestAnimationFrame to ensure DOM is ready and styles are applied
requestAnimationFrame(() => {
  validateTheme()
})
