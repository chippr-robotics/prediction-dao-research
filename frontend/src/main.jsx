import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThirdwebProvider } from 'thirdweb/react'
import './index.css'
import App from './App.jsx'
import { config } from './wagmi'
import { WalletProvider } from './contexts/WalletContext'
import { UIProvider } from './contexts/UIContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { PriceProvider } from './contexts/PriceContext'
import { ETCswapProvider } from './contexts/ETCswapContext'
import { UserPreferencesProvider } from './contexts/UserPreferencesContext'
import { RoleProvider } from './contexts/RoleContext'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { validateTheme } from './utils/validateTheme'

// Create query client for wagmi
const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThirdwebProvider>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
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
          </QueryClientProvider>
        </WagmiProvider>
      </ThirdwebProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Validate theme CSS variables after React mounts
// Use requestAnimationFrame to ensure DOM is ready and styles are applied
requestAnimationFrame(() => {
  validateTheme()
})
