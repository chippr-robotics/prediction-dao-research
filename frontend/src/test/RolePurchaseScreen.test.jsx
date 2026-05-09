import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RolePurchaseScreen from '../components/RolePurchaseScreen'
import { WalletProvider, UIContext } from '../contexts'

// Mock contexts
const mockUIContext = {
  showNotification: vi.fn(),
  showModal: vi.fn(),
  closeModal: vi.fn(),
  announce: vi.fn(),
  modals: [],
}

function renderWithProviders(component) {
  return render(
    <WalletProvider>
      <UIContext.Provider value={mockUIContext}>
        {component}
      </UIContext.Provider>
    </WalletProvider>
  )
}

describe('RolePurchaseScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the purchase screen with header', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    expect(screen.getByText('Unlock Premium Access')).toBeInTheDocument()
    expect(screen.getByText(/Choose individual roles or save with bundle packages/i)).toBeInTheDocument()
  })

  it('displays all individual role products', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    const marketMaker = screen.getAllByText('Market Maker')
    const clearPath = screen.getAllByText('ClearPath User')
    const tokenMint = screen.getAllByText('Token Mint')
    
    expect(marketMaker.length).toBeGreaterThan(0)
    expect(clearPath.length).toBeGreaterThan(0)
    expect(tokenMint.length).toBeGreaterThan(0)
  })

  it('displays bundle options section', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    const completeBundle = screen.getAllByText('Complete Access Bundle')
    expect(completeBundle.length).toBeGreaterThan(0)
    expect(screen.getByText('Two-Role Bundles')).toBeInTheDocument()
  })

  it('displays featured bundle with discount badge', () => {
    renderWithProviders(<RolePurchaseScreen />)

    // Price labels render the chain stablecoin symbol — USC on Mordor, USDC
    // on Polygon Amoy, "STABLE" fallback on chains with no stablecoin defined
    // (the test setup mocks useChainId to ETC mainnet, which has none). Match
    // any of these so the assertion tracks chain-aware rendering.
    expect(screen.getByText('🌟 BEST VALUE')).toBeInTheDocument()
    expect(screen.getByText(/Save \d+ (USC|USDC|STABLE) \(25% off\)/)).toBeInTheDocument()
  })

  it('shows individual role prices', () => {
    renderWithProviders(<RolePurchaseScreen />)

    // Prices are denominated in the chain stablecoin; the symbol varies by
    // active chain. Assert each numeric amount renders with some recognized
    // stable-token suffix rather than baking in a specific symbol.
    const priceMatcher = (n) => new RegExp(`^\\s*${n}\\s+(USC|USDC|STABLE)\\s*$`)
    expect(screen.getAllByText(priceMatcher(100)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(priceMatcher(250)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(priceMatcher(150)).length).toBeGreaterThan(0)
  })

  it('renders without errors when wallet is connected', () => {
    // The default mock has wallet connected
    renderWithProviders(<RolePurchaseScreen />)
    
    // Should show the products
    expect(screen.getByText('Unlock Premium Access')).toBeInTheDocument()
    // Products should be visible
    const marketMakerElements = screen.getAllByText('Market Maker')
    expect(marketMakerElements.length).toBeGreaterThan(0)
  })

  it('shows features list for each role', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    // Check for Bronze tier features
    expect(screen.getByText('10 daily bets')).toBeInTheDocument()
    expect(screen.getByText('5 daily bets on proposals')).toBeInTheDocument()
    expect(screen.getByText('10 monthly token mints')).toBeInTheDocument()
  })

  it('displays two-role bundle options', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    // Check that bundle discount text is shown
    expect(screen.getByText(/Mix and match any two roles and save 15%/i)).toBeInTheDocument()
  })
})
