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
              <UIProvider>
                <PriceProvider>
                  <App />
                </PriceProvider>
              </UIProvider>
            </Web3Provider>
          </ThemeProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </StrictMode>,
)
