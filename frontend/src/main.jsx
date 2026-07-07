import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { config } from './wagmi'
import {
  WalletProvider,
  UIProvider,
  ThemeProvider,
  PriceProvider,
  DexProvider,
  UserPreferencesProvider,
  FriendMarketsProvider,
  CustodyProvider
} from './contexts'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { validateTheme } from './utils/validateTheme'
import { registerServiceWorker } from './lib/pwa/serviceWorkerUpdate'

// Create query client for wagmi
const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            {/* WalletProvider is the unified blockchain context - single source of truth */}
            <WalletProvider>
              <CustodyProvider>
              <UserPreferencesProvider>
                <FriendMarketsProvider>
                  <DexProvider>
                    <UIProvider>
                      <PriceProvider>
                        <App />
                      </PriceProvider>
                    </UIProvider>
                  </DexProvider>
                </FriendMarketsProvider>
              </UserPreferencesProvider>
              </CustodyProvider>
            </WalletProvider>
          </ThemeProvider>
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

// Register the PWA service worker so the app is installable, works offline, and can
// surface a user-approved update when a new version ships (see serviceWorkerUpdate.js).
// Dev is skipped: Vite serves modules the SW would otherwise intercept, and a stale
// cache during HMR is a debugging footgun. Registration failures are non-fatal.
if (import.meta.env.PROD) {
  registerServiceWorker()
}
