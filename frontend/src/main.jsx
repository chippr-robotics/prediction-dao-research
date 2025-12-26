import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { config } from './wagmi'
import { Web3Provider } from './contexts/Web3Context'
import { UIProvider } from './contexts/UIContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { PriceProvider } from './contexts/PriceContext'
import { ETCswapProvider } from './contexts/ETCswapContext'
import { UserPreferencesProvider } from './contexts/UserPreferencesContext'
import { RoleProvider } from './contexts/RoleContext'
import ErrorBoundary from './components/ui/ErrorBoundary'

// Create query client for wagmi
const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Web3Provider>
              <UserPreferencesProvider>
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
            </Web3Provider>
          </ThemeProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </StrictMode>,
)
