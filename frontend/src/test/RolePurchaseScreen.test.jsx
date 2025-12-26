import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RolePurchaseScreen from '../components/RolePurchaseScreen'
import { RoleProvider } from '../contexts/RoleContext'
import { Web3Context } from '../contexts/Web3Context'
import { UIContext } from '../contexts/UIContext'

// Mock contexts
const mockWeb3Context = {
  account: '0x1234567890123456789012345678901234567890',
  isConnected: true,
  chainId: 1,
  balance: '100',
}

const mockUIContext = {
  showNotification: vi.fn(),
  showModal: vi.fn(),
  closeModal: vi.fn(),
  announce: vi.fn(),
  modals: [],
}

function renderWithProviders(component) {
  return render(
    <Web3Context.Provider value={mockWeb3Context}>
      <UIContext.Provider value={mockUIContext}>
        <RoleProvider>
          {component}
        </RoleProvider>
      </UIContext.Provider>
    </Web3Context.Provider>
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
    
    expect(screen.getByText('Market Maker')).toBeInTheDocument()
    expect(screen.getByText('ClearPath User')).toBeInTheDocument()
    expect(screen.getByText('Token Mint')).toBeInTheDocument()
  })

  it('displays bundle options section', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    expect(screen.getByText('Complete Access Bundle')).toBeInTheDocument()
    expect(screen.getByText('Two-Role Bundles')).toBeInTheDocument()
  })

  it('displays featured bundle with discount badge', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    expect(screen.getByText('🌟 BEST VALUE')).toBeInTheDocument()
    expect(screen.getByText(/Save \$\d+ \(25% off\)/)).toBeInTheDocument()
  })

  it('shows individual role prices', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    expect(screen.getByText('$100 USDC')).toBeInTheDocument()
    expect(screen.getByText('$250 USDC')).toBeInTheDocument()
    expect(screen.getByText('$150 USDC')).toBeInTheDocument()
  })

  it('displays connect wallet prompt when not connected', () => {
    const disconnectedContext = { ...mockWeb3Context, isConnected: false, account: null }
    
    render(
      <Web3Context.Provider value={disconnectedContext}>
        <UIContext.Provider value={mockUIContext}>
          <RoleProvider>
            <RolePurchaseScreen />
          </RoleProvider>
        </UIContext.Provider>
      </Web3Context.Provider>
    )
    
    expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument()
    expect(screen.getByText(/Please connect your wallet to purchase roles/i)).toBeInTheDocument()
  })

  it('shows features list for each role', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    expect(screen.getByText('Create prediction markets')).toBeInTheDocument()
    expect(screen.getByText('Access DAO governance')).toBeInTheDocument()
    expect(screen.getByText('Mint ERC20 tokens')).toBeInTheDocument()
  })

  it('displays two-role bundle options', () => {
    renderWithProviders(<RolePurchaseScreen />)
    
    // Check that bundle discount text is shown
    expect(screen.getByText(/Mix and match any two roles and save 15%/i)).toBeInTheDocument()
  })
})
