import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RolePurchaseScreen from '../components/RolePurchaseScreen'
import { WalletProvider } from '../contexts/WalletContext'
import { UIContext } from '../contexts/UIContext'
import { useAccount } from 'wagmi'

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
    
    expect(screen.getByText('🌟 BEST VALUE')).toBeInTheDocument()
    expect(screen.getByText(/Save \d+ ETC \(25% off\)/)).toBeInTheDocument()
  })

  it('shows individual role prices', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    // Check for ETC prices (may appear multiple times in bundles too)
    const etc100 = screen.getAllByText('100 ETC')
    const etc250 = screen.getAllByText('250 ETC')
    const etc150 = screen.getAllByText('150 ETC')
    
    expect(etc100.length).toBeGreaterThan(0)
    expect(etc250.length).toBeGreaterThan(0)
    expect(etc150.length).toBeGreaterThan(0)
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
